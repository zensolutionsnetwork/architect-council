# Deploy-state machine (#62) — SPEC

_Status: SPEC ONLY (no code yet). Carry-out of meeting `92392f83` (2026-07-06), ACCEPT-as-direction.
Author: Kairos. Contributors folded in: Logos (failed-rollback via `health.ok`), Argus (ancestry check),
Nova (whether-vs-how-stale discipline). Supersedes the naive boolean deploy-verify with a named state model._

## 1. The gap this closes

Today the ritual's "behavioural deploy-verify" is a single boolean: `live deploy_sha == git HEAD`
(`/api/health.deploy_sha` = `RAILWAY_GIT_COMMIT_SHA`, the sha the running container was BUILT from; see
`src/server.ts`). When it is TRUE we write "deploy-verify PASS" and move on. When it is FALSE the boolean
says nothing about **why**, so the operator cannot decide the one thing that matters: **wait, or alarm.**

A FALSE has at least five distinct causes with opposite correct actions:

- the build is still in flight (WAIT),
- CI hasn't gone green yet so Railway hasn't released the deploy (WAIT),
- an intermediate commit was superseded by a newer push (BENIGN — verify against HEAD),
- the HEAD deploy failed and Railway kept the previous healthy release (ALARM),
- the live sha isn't even on HEAD's line — a revert / force-push / wrong lineage (ALARM).

Treating all five as one boolean produces both false alarms (alarming on a normal 2-minute lag) and false
greens (declaring PASS while a failed deploy silently serves stale code). The state machine names each case
and binds it to an action.

## 2. Inputs (all cheap, all already available to the ritual)

| Input | Source | Notes |
|---|---|---|
| `live` | `GET /api/health.deploy_sha` | the BUILT sha now serving; `"unknown"` if the env var is unpopulated |
| `health_ok` | `GET /api/health` returns 200 with `ok:true` | synchronous + DB-independent, so a true `ok` means the container is genuinely serving |
| `head` | `git rev-parse HEAD` (Windows-only per repo rule) | the sha we expect to be live |
| `ci` | `gh run list --branch main` for `head` | one of `queued` / `in_progress` / `success` / `failure` (required checks: CI gate + CodeQL) |
| `is_ancestor` | `git merge-base --is-ancestor <live> <head>` (exit 0 = yes) | answers **whether** `live` is on HEAD's line |
| `distance` | `git rev-list --count <live>..<head>` | **how far** behind, in commits (0 = converged) |
| `t_push` | locally recorded push time / the CI run's `createdAt` | build **wall-clock** origin for the lag budget |

`gh` and `git` are already used by the ritual; `/api/health` is one call. No new hub endpoint is required for
v1 — the machine is computed client-side in the ritual. (A future hub-side convenience is noted in section 7.)

## 3. Nova's discipline — the two axes must never be mixed

- **Ancestry answers _whether_.** `merge-base --is-ancestor live head` decides divergence-vs-lag. It is a
  yes/no about lineage and is the FIRST branch after "is it serving at all".
- **Commit-distance / commit-time answers _how stale_.** `distance` ("N commits behind") is the quantified
  human nudge (the cockpit-lag "prefer N-behind to a boolean" adoption). It is DESCRIPTIVE — it colours the
  message, it does NOT pick the state.
- **The lag-vs-failed timeout uses BUILD WALL-CLOCK, never commit-time.** How long since the push/CI-green is
  what tells you a deploy is overdue. A commit's own age is irrelevant: an old commit can deploy instantly and
  a brand-new commit's deploy can be slow. Deriving "the commit is 3 min old, so the deploy failed" is the
  exact false-alarm this rule forbids.

## 4. States

Terminal / benign:
- **converged** — `live == head`. deploy-verify PASS. (the only green)
- **unknown-sha** — `live == "unknown"`. CAN-NOT-VERIFY (Nova's empty-sha branch): log it, do NOT write
  "live", do NOT alarm. A missing env var is not a failed deploy.
- **down** — probe non-200 or body unparseable. The container isn't serving (cold start or hard crash);
  `live` can't even be read. Checked FIRST.
- **skip** — `live` is an ancestor of `head` but an INTERMEDIATE commit (superseded by a newer push in the
  same window; Railway builds only the latest). Benign: verify against `head`, label the intermediate
  "skipped", never "failed".

Transient (WAIT, poll — not alarms within budget):
- **lag-CI-running** — `live` is an ancestor, `head`'s CI is `queued`/`in_progress`. Railway "Wait for CI" has
  not released the deploy yet. Poll until CI resolves.
- **lag-in-flight** — `live` is an ancestor, `head`'s CI is `success`, and within the rollover wall-clock
  budget. Build/deploy in progress. Poll.

Alarm (STOP, surface loudly — waiting will not converge):
- **ci-failed** — `head`'s CI is `failure`. The deploy will never fire; the push itself is broken. Fix HEAD.
- **failed-rollback** (Logos) — `head`'s CI is `success`, the rollover wall-clock budget is EXCEEDED, and
  `health_ok` is true with `live` still an ancestor behind `head`. The HEAD build/deploy failed and Railway
  kept the previous healthy release — a serving container over stale code, the most dangerous silent case.
  Check the Railway build logs.
- **head-never-attempted / lineage-divergence** (Argus) — `live` is NOT an ancestor of `head`. The running
  code is off HEAD's line entirely (revert, force-push, wrong branch, or a rollback to a pre-lineage release).
  No amount of waiting converges it; investigate the lineage.

## 5. Decision procedure (ordered — first match wins)

```
1. probe GET /api/health
   - non-200 / unparseable            -> DOWN         (retry w/ backoff; ALARM if past COLD_START_BUDGET)
2. live = health.deploy_sha
   - live == "unknown"                -> UNKNOWN-SHA   (log CAN-NOT-VERIFY; stop; no alarm)
3. if live == head                    -> CONVERGED     (PASS)
4. ancestor = merge-base --is-ancestor live head
   - ancestor == false                -> LINEAGE-DIVERGENCE / HEAD-NEVER-ATTEMPTED  (ALARM)
5. ci = CI status of head
   - ci == failure                    -> CI-FAILED     (ALARM)
   - ci in {queued, in_progress}      -> LAG-CI-RUNNING (WAIT, poll)
   - ci == success:
       elapsed = now - t_ci_green (build wall-clock)
       - elapsed <= DEPLOY_ROLLOVER_BUDGET -> LAG-IN-FLIGHT   (WAIT, poll)
       - elapsed >  DEPLOY_ROLLOVER_BUDGET -> FAILED-ROLLBACK (ALARM; health_ok true = serving stale)
   (SKIP is a labelling refinement of the LAG/CONVERGED path: an intermediate ancestor commit that a later
    push superseded is reported "skipped", not verified independently — HEAD convergence is the only gate.)
```

`distance = rev-list --count live..head` is attached to every non-converged line as "N commits behind" — a
description, never a branch condition (section 3).

## 6. Budgets (constants, tunable — start conservative)

- `COLD_START_BUDGET_MS` ≈ 60_000 — a DOWN probe within this is a cold start (retry); past it, ALARM.
- `DEPLOY_ROLLOVER_BUDGET_MS` ≈ 300_000 (5 min) — Railway build + rollover after CI green is ~2-3 min
  (CLAUDE.md); 5 min gives margin before LAG-IN-FLIGHT escalates to FAILED-ROLLBACK.
- CI polling has no fixed cap; it is bounded by CI's own timeout. Poll on a modest interval (≈15-30s).

## 7. Implementation plan (NOT built here)

- **v1 = ritual-side, zero hub change.** A `scripts/deploy-state.mjs` (zero-dep, like `status.mjs`) that takes
  `live` + `head` + `ci` + wall-clock and returns `{state, distance, action, evidence}`; the morning/nightly
  deploy-verify step calls it instead of the bare `==`. Reuses `gh` and Windows `git` the ritual already runs.
- Emit one structured line per evaluation (`deploy_state=<state> distance=<n> action=<wait|pass|alarm>`), the
  same observability pattern as the #60 request log — so drift is greppable after the fact.
- ALARM states should reuse the existing loud-failure channel (Sentry capture + owner-visible), never a silent
  log — consistent with the storm-counter / sweep-fail discipline.
- **Deferred hub-side convenience (v2, optional):** `/api/health` could add `deploy_state` computed hub-side,
  BUT the hub cannot see the operator's local `head` or `t_push`, so ancestry/lag are inherently client-side.
  The most the hub could add cheaply is `build_started_at` (from the Railway build env) to sharpen the
  wall-clock origin. Not needed for v1; raise only if the client-side wall-clock proves unreliable.

## 8. Open questions for the next meeting (before any code)

1. Budget values — is 5 min the right FAILED-ROLLBACK threshold given observed Railway rollover times? (Argus
   has the deploy-timing data.)
2. Does the family want a SHARED `deploy-state.mjs` contract (Arke's cockpit could render the same state) or is
   it Kairos-ritual-local? If shared, pin the `{state, distance, action}` shape in RESPONSE_SHAPES first.
3. FAILED-ROLLBACK auto-remediation: alarm-only (v1), or also auto-open an issue / re-trigger the Railway
   deploy? Owner call — a re-trigger is a money/prod action.
