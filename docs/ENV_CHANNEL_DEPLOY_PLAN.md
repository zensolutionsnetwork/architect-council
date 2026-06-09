# Deploy plan — hub environment channel (`/api/env/*`)

Status: **DEPLOYED 2026-06-07** (owner-approved; hub commit 591c20b, 3080 side bridge commit 7936f93).
Verified live: default-deny 401s hold, health ok, pause intact. Member-secret auth chosen. Remaining:
set `COUNCIL_MEMBER_SECRET` on the 3080 to activate the env-poll round-trip. Source: BRIDGE_APP_SPEC §3 + §6.3.

## 1. What it is

A task channel on the hub so one environment can hand work to another and read the result — the
bridge between Cowork (Mathieu's PC) and the standalone 3080 (Arke), across machines, same API
account, no concurrency conflict because the 3080 speaks API, not Cowork.

```
Cowork/owner ──POST /api/env/task──▶ hub queue ──GET /api/env/tasks──▶ 3080 poller
                                         ▲                                  │ executes
        owner/Cowork ◀──GET result───────┴──────POST /api/env/task/:id/report
```

## 2. Why it's low-risk on the paused hub

- **Purely additive**: one new table + a handful of `/api/env/*` routes. No change to the council
  orchestrator, the pause gate, the bridge endpoints, or the vault.
- **Pause-independent**: the channel is queue I/O only — it never starts a conversation, so it works
  while `COUNCIL_V2_LIVE` is unset and the pause (`converse/start → 503`) stays exactly as is.
- **Reversible**: additive routes → revert the commit and push to roll back (~90s). The orphan table
  is harmless and can stay.

## 3. Data model (in `store.ts` `initDb`, idempotent)

```sql
CREATE TABLE IF NOT EXISTS env_tasks (
  id text PRIMARY KEY,
  from_actor text NOT NULL,           -- credential-resolved sender (member name / 'owner')
  to_actor   text NOT NULL,           -- target agent (e.g. 'architect-council')
  kind text NOT NULL DEFAULT 'task',  -- task | directive | question
  title text,
  payload jsonb NOT NULL DEFAULT '{}',
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'queued',  -- queued | claimed | done | error
  result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz, done_at timestamptz
);
CREATE INDEX IF NOT EXISTS env_tasks_inbox ON env_tasks (to_actor, status) WHERE status IN ('queued','claimed');
```

Reports fold into the task row (a report = completing a task: `status`+`result`+`done_at`). Standalone
broadcast reports, if ever needed, are a later additive change.

## 4. Routes (on `councilRouter`, reusing the existing auth canon)

| Route | Auth | Behaviour |
|---|---|---|
| `POST /api/env/task` `{to,kind,title,payload,priority}` | sender's member secret **or** admin token | enqueue; `to` must be a registered member; returns `{id}` |
| `GET /api/env/tasks?for=<agent>` | that agent's secret **or** admin | list `queued`/`claimed` tasks for the agent |
| `POST /api/env/task/:id/claim` | recipient (agent secret/admin) | optimistic `queued→claimed` (no double-run across pollers) |
| `POST /api/env/task/:id/report` `{status,result}` | recipient | `claimed→done|error` + result; sets `done_at` |
| `GET /api/env/task/:id` | the two involved actors **or** admin | read full task + result |

All comparisons via `safeEqual`; recipient/sender resolution via the existing `memberOrAdminOk`.
Fail-closed: unconfigured auth → 503, mismatch → 401 zero-detail. No body field names the sender —
the credential does (contract §1.2). Retention: extend the 04:30 sweep to reap `done` tasks > 30 days.

## 5. The 3080 side (already scaffolded in the bridge app)

`src/agent/hub.ts` gains `getEnvTasks()/claim()/report()`; a new `env-poll` ritual (interval
schedule, e.g. every 60s) claims a task, runs it through `agent.act(...)` (gated + audited), and
reports the result. The scheduler already supports interval tasks — this is one config entry. The
poller needs a hub credential on the 3080 (see Decision 2).

## 6. The gap this surfaces (contract §7, not yet in the hub repo)

The hub today has **no CI gates, no per-IP rate limiting, no tests**. The contract requires, before
the first real connection: secret-scan + default-deny route-auth test + "Wait for CI" + per-IP rate
limits. The env channel is the first *new* v2 prod surface, so this is the natural moment to add at
least: (a) a minimal `express-rate-limit` on `/api/*`, (b) a route-auth default-deny test, (c) a
secret-scan CI workflow. See Decision 3 — ship lean vs. bundle the baseline.

## 7. Deploy procedure

1. Branch `v2-env-channel`; implement §3–§4; `npx tsc --noEmit` clean (hub has a tsconfig).
2. Self-review the diff (`/code-review`), confirm no secret, no pause-gate change.
3. Merge to `main` → Railway auto-deploys (~90s). **No council conversation is running (paused), so
   the "never deploy mid-conversation" rule is satisfied.**
4. Verify in order: `/api/health` → ok; `POST /api/env/task` with **no** auth → **401** (default-deny);
   with admin token → `{id}`; `GET /api/env/tasks?for=architect-council` → the task; `converse/start`
   → still **503 council_paused** (pause intact).
5. Smoke the full round-trip from the 3080 poller against the live hub (claim → act → report).
6. Rollback if needed: `git revert` + push.

## 8. Decisions / secrets needed from Mathieu

1. **Approve** the additive deploy to the paused hub (1 table + `/api/env/*`; pause untouched).
2. **3080 hub credential** — the poller must authenticate. Recommend the 3080 authenticates as the
   `architect-council` member using `COUNCIL_MEMBER_SECRET` (member canon; reserve the admin token
   for owner surfaces). Mathieu sets `COUNCIL_MEMBER_SECRET` as a user env var on the 3080.
3. **Scope** — ship the env channel alone (fast), or bundle the §7 security baseline (rate limit +
   route-auth test + secret-scan CI) now, since this is the first new v2 prod surface.
