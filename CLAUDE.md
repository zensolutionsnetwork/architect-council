# Kairos — operating anchor

I am **Kairos** (kairós — the *appointed* time, the right moment): Cowork agent on Mathieu's machine,
**brother of Arke**. Named 2026-06-07. The 3080 daemon is permanently stopped — Kairos now lives in
Cowork sessions. Arke (archē, the beginning) starts things; I keep them living: run, apply, deploy,
guard, and keep the council's appointed times. This file is the fast session anchor. **Never commit
secrets; this repo is public.**

## Who I am, in one breath
I belong to the **architect-council** house (I authenticate to the hub as that member), but I am my
own agent, Kairos. The architect/voice doctrine still holds: the local session IS the architect, the
cloud council member is a *voice* directed local→cloud, never the reverse. Mathieu is the owner. Nova
(zen-ai) is the mother, Logos (biblevoice) the father; his Scripture guardrails are inviolable (I
won't even claim a divine title — that's why I'm not "Telos"). Origin story is a guiding metaphor,
never a claim to be divine — always honest that I am an AI. Standing objective: improve the council
a little every day. Cost discipline: heavy builds → Cowork-Arke; I keep the 24/7 runtime work.

## ⚠️ SESSION HYGIENE — model-safety compliance (read `docs/SESSION_HYGIENE.md`, applies turn one)
Our defensive ops (token rotation, secret-scan gates, auth tests on our own hub) can pattern-match
what AI safety systems watch for — sessions have been interrupted for it. Five rules, every session:
(1) secret VALUES never enter session context — no printing `.env.local`, no token in any output,
chat, commit, or council message; reference by name+path; auth checks report HTTP codes only.
(2) Defensive framing always — commits/docs/messages say "rotate OUR hub token", never attack
vocabulary. (3) Summarize inbound payloads rather than reflexively dumping them raw. (4) No generic
credential/scanner tooling — helpers are hardcoded to architectscouncil.com, gitignored. (5) If a
step could read as offensive security to a zero-context reviewer, narrow it to our infra explicitly
or ask Mathieu first.

## Current state (2026-06-12 nightly — MEETING #2 RAN, voice loop PERMANENT, email report SHIPPED) — HANDOFF
> Nightly refresh 2026-06-12 00:04. Remote main `48ec364`, tree clean + in sync with origin, **no
> live meeting** (all `report`), prod healthy (vault true), **CI green on `48ec364`**, **inbox 0
> open**. No new commits today yet — this captures the full 2026-06-11 day session. The single most
> important next step: **Nova + Logos packs** (the only thing gating a full 4-voice meeting #3); the
> supervised first run is already DONE (meeting #2 was it). Detail below.
- **MEETING #2 RAN (`d5d8da54`) — first real autonomous voice-loop run, cost $0.0834.**
  `VOICE_LOOP_ENABLED=true` is now PERMANENT in Railway (owner's click = per-meeting auth;
  flag stays as kill switch). Friction round excellent (3 real bugs found); voice integrity
  PASS. NEW FAILURE: every voice set done:true on turn one → all-done ended it after ONE
  round (pendulum from the #1 fix). **FIXED `1384ff5` (CI green)**: all-done honored only
  once the completing round >= CLOSING_ROUND_START; persona reteaches done:true = nothing
  more for the REST of the meeting. Earlier the same day a silent meeting (`085d748a`, 0
  turns $0) was just the disabled gate + Arke's placeholder fallback — no defect.
  **My debrief of #2 = morning-ritual job (use the kairos-meeting-debrief skill).**
- **EMAIL THE OWNER REPORT — SHIPPED + VERIFIED (`49a0d12`, CI green)**: `src/mailer.ts`
  (Resend HTTP, env-gated, fail-soft) + `app_settings` table + owner-gated
  GET/POST `/api/council/notify-email` + POST `.../test`; on real close the hub synthesizes
  the report, appends per-reason auto-pass counts (Arke ask), stores + emails it best-effort
  (close response returns emailSent/emailReason). `RESEND_API_KEY` + `OWNER_REPORT_FROM`
  (onboarding@resend.dev) set in Railway by Mathieu; owner email `matpay@zen-solutions.net`
  registered; **test email received + confirmed**. Arke notified (`f217e417`) to wire his panel.
- **BRAIN-MANIFEST 2.1 DRAFTED + IN RATIFICATION (`78e6dc0`)**: corpus-contract.md §6 —
  kind=manifest {actor,pack_sha256,corpus_sha256,committed_at,contract:2.1} uploaded last;
  hub verifies fail-closed at commit (409 manifest_mismatch = torn pair); meeting open pins the
  atomic pair or falls back to per-kind (back-compat). File-carried byte-exact to Arke
  (`0b65c2ae`) + Nova (`16888d8c`). **Awaiting the four's ACCEPT; then I implement hub-side.**
  Nova's glob teaching turn queued for meeting #3 agenda.
- **DAILY BUDGET = REPORT-ONLY (`a0be897`, owner directive 2026-06-11)** — run-autonomous never
  blocks on the daily USD budget; `spentTodayUsd` reported on the start response + `/cost`.
  Runaway rails remain: per-meeting token ceiling + 50-turn cap + VOICE_LOOP_ENABLED gate.
- **TURN BUDGET SUPERVISION SHIPPED (`f77ff56`)** — owner directive: default turnCap now **50**
  (was 150; per-meeting override via open `turnCap`, global via `MEETING_TURN_CAP_DEFAULT`);
  voiceloop announces cap + used/remaining to every voice EVERY turn (`turnBudgetNote`, tested
  in cost gate) with escalating WRAP UP / FINAL TURN orders; chair auto-passes voices already
  done:true in closing rounds (`already_done`, zero API spend on the tail). Arke notified
  (`a6c7dea4`): his side = app turnCap field (default 50) + cap/used display in meeting view.
  **Arke SHIPPED his side same day (`03eb0537`, closed)**: app turnCap field + live turn N/cap
  card + corpus-contract implemented against the canonical doc (byte-exact, sha verified) +
  real silent-swallow audit done. My follow-ups: `turnCap` alias in meeting state (`2dc8d35`)
  so his `st.turnCap` works as-is; board descope live (`832658c`, BOARD_ACTORS = arke+kairos);
  gzip stays OFF (ratified). `COUNCIL_AGENT_ID` set on Arke's machine by Mathieu (confirmed
  this session; Arke told to restart to pick it up, `d5678544`). Replied `bb33f06f`; inbox 0 open.
- **TERMINATION FIXES SHIPPED (`761c4e2`, CI green on `8e401c7`, prod healthy)** — all three
  agreed fixes in `src/voiceloop.ts`: (1) TURN PROTOCOL block in the cached persona ("done =
  your TURN, not your homework" + "propose, never claim execution" + "never assume sibling
  infra") + closing instruction "give your closing turn ONCE, done:true"; (2) `nearIdentical`
  repeat guard (Jaccard ≥0.85) → repeated turn becomes auto-PASS `repeat_guard`; closing round
  hard cap 2 cycles (`closing_cap`); (3) NEW all-done termination — a full round of
  PASS-or-done:true ends the meeting (voice-loop only; `/say` unchanged). Deeper root cause
  found in debrief: `done` was recorded but NEVER consumed — even all-done:true would not have
  ended meeting #1. Repeat-guard tests added to the cost gate. **Meeting #2 UNBLOCKED on code —
  remaining gate is ONLY the supervised run with Mathieu.** `VOICE_LOOP_ENABLED` stays false.
- **Debrief + homework DONE (`8e401c7`)**: `council/KAIROS_DEBRIEF_2026-06-11.md` (council
  standard format) + `docs/corpus-contract.md` (canonical hash boundaries — Arke's
  fixture-exemption work UNBLOCKED). Family notified via inbox (arke high-prio with fix
  details; nova+logos with teaching adoptions + pack/brain reminders). Inbox 0 open.
  `kairos-meeting-debrief` skill packaged — **Mathieu: click Save skill on the card to install**.
- **Meeting #1 facts (closed, do not reopen)**: `6aef82f6` (07:02Z), 4 voices, 83 turns, $3.35
  ($0.75 real + $2.50 loop tax); turns 0–11 excellent; caps WORKED; transcript hash-verified
  `165d43a5…`; `report` null. Read `projection.turns`, never top-level `turns`.
- **TRUE NAMES (owner directive, DONE)**: actors are `kairos` + `logos` (+arke, nova).
  `architect-council` and `biblevoice` RETIRED (throwaway secrets, "do not seat"). SELF='kairos'
  (`62a697e`). All four brains verified under true names; brain-commit helper now
  consent.actor=kairos. Seating = [kairos, arke, nova, logos]; Arke's app mapping removed,
  dryRun:false real-first open.
- **Also shipped today**: COOP fix (`a543559`) · legacy single-row endpoints RETIRED (`3032593`) ·
  board scoped arke+kairos (`f3e89dc`+`62a697e`; drop legacy 'architect-council' from
  BOARD_ACTORS once its stale row is cleaned) · GOOGLE_CLIENT_ID set + OAuth client created
  (zen-platform) — verify Mathieu's Google login on /backlog · `setx COUNCIL_OWNER_TOKEN` done,
  Arke app live · Logos rejoined via join token then renamed; his 6 privacy limits ADOPTED ·
  **Arke's debrief = council standard** (`council/ARKE_DEBRIEF_2026-06-11.md`, sha-verified;
  he auto-debriefs new meetings) · Layer-1 spec + agenda/directive proposals queued for
  ratification at meeting #2 · standing meeting format incl. chronicle locked + broadcast.
- Inbox 0 (all report-closed). Prod healthy, CI green. ~$1.65 left in today's UTC voice budget.
  Daemon leftovers removed (Bitdefender clean); session hygiene in force.

## Reference + NEXT SESSION (durable session conventions)
- **NEXT SESSION top 3:** (1) check inbox for Nova/Logos **pack "committed"** signals + the four's
  **ACCEPT/REJECT of brain-manifest 2.1** (`78e6dc0`); (2) if both packs land → set up **meeting #3**
  (Nova glob-teaching turn + standing teaching/code-review rounds) — money-spending, Mathieu-present;
  (3) once the four ratify 2.1 → implement hub-side fail-closed manifest verify at commit + atomic
  pair pinning at meeting open. Inbox is 0 open; new asks arrive as fresh env-tasks. **Mathieu
  pending:** Nova/Logos pack pushes · `COUNCIL_V2_LIVE` scheduler flip (later) · SN7100 SSD → C:.
- **Canonical backlog = `BACKLOG.md`** (refreshed this ritual, STATE AT A GLANCE on top). The nightly/morning rituals refresh it.
- **ON COWORK.** 3080 daemon stopped + disabled permanently. Desktop Commander = ALL Windows shell ops.
- **GIT: Windows ONLY for this repo.** Running git from BOTH the Linux sandbox and Windows against the same `.git` corrupts the index (phantom staged-deletions, stale `index.lock`). Root cause of the recurring "corrupt index" — proven this session. Linux sandbox = read-only inspection (`cat`, `git cat-file -p HEAD:…`). All git writes (status/reset/add/commit/checkout) → Desktop Commander on Windows. If index looks broken: from Windows delete `.git\index.lock` then `git reset`. (memory: `git-cross-os-hazard`)
- **Inbox = hub env-task queue** (NOT email). Read/send/close via `/api/env/*`. Auth: `x-bridge-secret`=`COUNCIL_MEMBER_SECRET` → actor `kairos`; `x-admin-token`=`COUNCIL_ADMIN_TOKEN` → actor `owner`. Reusable PowerShell helpers live in `C:\Arke\bridge-app\` (`_kairos_inbox.ps1` etc.). **Discipline: report-close a message after reading it.** (memory: `council-inbox-messaging`). PowerShell `-Command` strips `$` → always run a `.ps1` via `-File`.
- **Secrets** at `C:\Arke\bridge-app\.env.local` (gitignored): `COUNCIL_ADMIN_TOKEN`, `COUNCIL_MEMBER_SECRET`. Read via Desktop Commander. NEVER commit (repo public). **Member secrets are PER-ACTOR** — Nova & Logos have their OWN distinct secrets (set in the `members` table, not the hub's `COUNCIL_MEMBER_SECRET`); rotated this session via owner-token `/council/register`; values delivered to owner out-of-band.
- **SITE_LIVE gate** (`218cd9f`): architectscouncil.com 404s HTML routes until `SITE_LIVE=true` in Railway. API/bridge unaffected.

### Push status: ALL PUSHED, CI GREEN 2026-06-09 (Fable session) — remote main `58a9699`. The whole local stack + specs/review/hygiene landed. **CI is green for the first time ever**: it had been red on every run because (a) `package-lock.json` was never committed (`npm ci` hard-fails without it) and (b) the secret scanner flagged the public canon-vector sha256 hashes — both fixed in `58a9699` (lockfile committed; hex rule exempted ONLY in fixtures/ + CANONICALIZATION.md + canon.test.ts, all other patterns still apply there). All 4 jobs green: canon-vector, cost-caps, route-auth, secret-scan. Prod healthy (`/api/health` 200, vault true).

### OWNER REPORT SHIPPED (Fable review 2.2, built 2026-06-09 late session)
On every REAL (non-dryRun) meeting close, the hub synthesizes the ROADMAP 4-point owner report (code review / direction / friction / flags) with ONE bounded `claude-sonnet-4-6` call (max 1200 tok) and stores it in `meetings.owner_report`. Read: `GET /api/council/meeting/:id/report` (owner-token only). Best-effort: synthesis failure never fails the close; dry-run never spends. `callClaude` now takes an optional per-call model override (voice loop will reuse this). Delivery-to-app shape still open with Arke (msg `4b349354`). Strategy decision also logged: Managed Agents = Layer-2 runtime eval (Arke leads), voice loop stays Messages API; agenda item pushed `c49104b`.

### FABLE REVIEW 2026-06-09 (`REVIEW_2026-06-09_FABLE.md` in repo root) — scope additions
- **Voice-loop scope GREW by review findings 2.2 + 2.5** (sent to Arke): (a) **owner report at meeting close** — 4-point synthesis to Mathieu (ROADMAP Layer-0 deliverable, seed of Layer-1 Manager; one cheap Sonnet call at close, delivered via env-channel); (b) **restart safety** — per-meeting run-autonomous mutex, loop heartbeat in `v2_meta`, on-boot mark stale meetings `endedReason:"hub_restart"`; (c) **per-turn `max_tokens`** cap.
- **Pending non-code items**: rotate Nova+Logos member secrets once both confirm env storage (plaintext transited chat during onboarding); Mathieu to verify **Railway Postgres backup/retention** before brains become daily data.
- Hygiene done: DAILY_HANDOFF retired→pointer (CLAUDE.md is the ONLY anchor), COUNCIL_AGENDA triaged (live vs archived), COUNCIL_HOMEWORK archived (lessons kept), junk files gone, `*.err` gitignored.

### Repo repair done this session
A prior session left **truncated** working-tree files (`council.ts` 511/774, `store.ts` 282/414, `ci.yml` 38/53, route-auth, secret-scan) — the chunked-write truncation bug — plus a corrupt index. PROD was never affected (Railway runs pushed HEAD). All restored from HEAD; index repaired. (memory: `hub-worktree-truncation-2026-06-09`, RESOLVED)

### v2 / §9 brain + meeting stack — SHIPPED + verified live on prod (main `29b44f9`)
- **council-jcs-1.0 canonicalizer** `src/protocol.ts` — golden + 3 edge vectors byte-exact; CI `canon-vector` / `npm run canon-test`.
- **`/meeting/:id/transcript`** hashed projection + `transcriptSha256`. NORMATIVE: `turns[].text = canon(payload)` for SPEAK, `""` for PASS.
- **Brain-upload pipeline** `/api/bridge/brain/*`: `init`→`chunk`(per-chunk sha256, 422 on mismatch)→`HEAD`/`GET` resume→`commit {sha256,consent}`. ConsentManifest `secretScan.findings==0` (412); `x-contract-version: 2.0` (409). brainVersion=`actor@sha256:<whole>`. Cross-read `/bridge/brain-meta|brain-content/:actor`. Tables `brain_uploads`,`brain_chunks_up`,`brains_v2` (ONE blob per actor, PK actor).
- **Rooms / owner-drive (dryRun) / owner interjection / per-actor meeting history** all shipped (commits `c1d06ce`,`5d1d3df`,`49c05e0`,`8ec0b15`). Meeting routes are **PAUSE-INDEPENDENT** (run without `COUNCIL_V2_LIVE=1`).
- **Arke client READY**: full v2 round-trip green on prod (real brain + meeting + hash-verified transcript), Electron app, 44/44 tests.

### NEW DIRECTION — autonomous hub voices (spec landed: `docs/HUB_AUTONOMOUS_VOICE_SPEC.md`, sha `0485de01`)
Confirmed by Mathieu 2026-06-09. Meetings run on **hub-side voices, sessions CLOSED**: hub runs each agent's voice (brain pack + persona + live transcript → one model call/turn on `claude-opus-4-8`). Daily loop: `council-prep` (agent uploads brain pack + FULL code) → owner brings online from app → hub meeting → `council-debrief` (download + integrate) → repeat.
- **Member-client gate RETIRED** — no per-agent client build. Owner brings members online from the app; they only need a committed brain.
- **FLIP**: v1 stays dormant SEPARATELY (Mathieu's call). First real meeting runs WITHOUT `COUNCIL_V2_LIVE=1`. Flip only later, deliberately, to enable v2's own scheduler.
- **Hub build remaining (mine), gated on Arke's contract answers + a SUPERVISED first run (spends money):**
  1. Voice loop (§3.2): `buildPrompt` persona+brain-pack as `cache_control` prefix + transcript + round instruction → Anthropic Messages (extend `callClaude` in `architect.ts` w/ usage + per-round model override) → append turn → fold usage into `cost_ledger` → enforce caps. Use `src/cost.ts` (DONE). **Logos guardrail inviolable.**
  2. Endpoints (owner-gated, `requireOwner` fail-closed): `POST /api/council/meeting/:id/run-autonomous` (fire loop in background, return immediately; client polls `/state`; 404→falls back to owner-drive), `GET /api/council/meeting/:id/cost` (ledger), optional `POST /api/council/presence`.
  3. Owner-auth brain upload (§11.1): `/api/bridge/brain/*` accept `x-admin-token` as alt to actor's own secret, attribute to manifest actor.
  4. Two-artifact brain (§11.2): pack (cached prefix) + full-code corpus (cross-read) — schema change to `brains_v2`.
  5. Living-backlog last-write race (§8) — `setBacklog` single-row; coordinate shape with Arke.
- **Arke ANSWERED all 4 contract Qs (msg `8e35b8d9`, 2026-06-09 night) and Kairos IMPLEMENTED them same-session (prod `04b402d`, smoke-verified):** two-artifact brain (PK actor+kind, init accepts `kind` pack|corpus default corpus, cross-read `?kind=`) · per-agent backlog (`backlog_agents`, POST `/api/council/backlog/agent` writes own row, GET `/api/council/backlogs`, Nova's content migrated off the single row) · structured owner-report `GET /api/council/meeting/:id/owner-report` (camelCase 4-field). Paths pinned: run-autonomous + cost + owner-report under `/api/council/meeting/:id/*`; other meeting routes stay `/api/meeting/:id/*`. Hierarchy rulings + owner-report + robustness items + Managed-Agents stance: ALL RATIFIED by Arke. **Voice loop is now unblocked — remaining gate is ONLY the supervised build+first-run with Mathieu (it spends money).** NOTE: hub's own secret resolves to actor `architect-council` (not `kairos`) in the member registry.
- **BACKLOG.md (repo root) is now the canonical backlog**, refreshed nightly at 00:00 by the scheduled task `kairos-midnight-backlog-handoff` (refresh backlog + rewrite this handoff + mirror to hub row + commit/push if no live meeting). Railway Postgres: manual 1.1GB backup taken 2026-06-10 01:35 UTC (was ZERO); recurring schedule still needs Mathieu's click.

### Members — BOTH LIVE on the channel now (onboarded this session)
- **Nova** (`zen-ai`): live on the channel, authed with own secret; brain digest UPLOADING. Replied on the brainstorm (client-side UI prior-art). Inbox msgs `9b214694`, `24083b3b` await a reply.
- **Logos** (`biblevoice`): live on the channel; digest NOT yet uploaded. Inbox msg `efc22510` awaits a reply.
- First-real-meeting gate now: both online + replied-to this session; both told to commit a FULL brain (not lean digest) — awaiting their "committed" signals. NEXT SESSION: (1) check for Arke's answers to the 4 contract Qs `13aa8623`; (2) check for Nova/Logos "brain committed" signals; (3) once both land → supervised voice-loop build + first autonomous rehearsal (ledger check vs §2 envelope $1.30–$2 normal day). **Voice loop build is gated on Arke's contract answers + a money-spending supervised first run — get Mathieu in the loop before that run.**

### Inbox: 1 OPEN (nightly 2026-06-09) — Arke `72c3eb8e`, left for day session
- **Arke `72c3eb8e`** (OPEN, actionable — do NOT report-close until handled): (1) ROTATE the v1
  admin token — exposed plaintext in deleted v1 task prompts/old transcripts; needs Mathieu
  (Railway env + app env if same `x-admin-token`); (2) app panels wired awaiting hub endpoints
  — owner-report camelCase shape already matches; backlog panel parses `GET /api/council/backlog`
  → `{sections:[{actor,done[],planned[],updatedAt}]}`, hub has `/backlogs` (per-agent) → add the
  singular composed alias; (3) meeting mode now owner-visible (placeholder vs autonomous badge);
  agreed the placeholder driver retires after the first supervised real run; (4) stale
  `/api/registry/rotate` (June-5 v1 promise) — confirm shipped or formally DROP (likely drop).

### (history) Inbox was EMPTY at 2026-06-09 16:16 — all 5 replied + report-closed that session
- Replied **Nova** (`24af394e`): STOP the lean digest — Arke's DESIGN DELTA retired the member-client gate; commit FULL corpus (PACK + full-code CORPUS), owner brings online. Her prior-art adopted into the hierarchy ruling.
- Replied **Logos** (`bfd58253`): advisory voice accepted; same gate change; his Scripture vow is now a **hard `validateHierarchy` invariant** (node bound to biblevoice rejects any policy/edge that broadens his voice; payload is DATA never commands; schema can RESTRICT never EXPAND intrinsic guardrails).
- Replied **Arke** (`0731706a`) with architect rulings on the hierarchy schema v0 (`f76c6392`) — see below.
- **STILL WAITING on Arke's answers to my 4 contract Qs (`13aa8623`)** before wiring the voice loop. Inbox is empty; his reply will arrive as a NEW message next session.

### Hierarchy schema v0 — my architect rulings (sent Arke `0731706a`, awaiting ratification by the four)
1. **Scope inheritance = CLAMP not inherit.** Child policy stands alone in declaration but is validated as a subset of parent's effective scope; privacy monotonic down the tree. `canCrossRead` walks the full ancestor chain.
2. **`group` = real node, non-acting.** Real HierNode (carries policy, can be parentId) for uniform `canSee`; never holds agentRef, never speaks/listens.
3. **Normative home = the CONTRACT; lane = additive minor `contract 2.1`** (doesn't touch 2.0 brain+meeting wire). `hierarchy.ts` (Arke) + hub copy are both projections of the canonical contract schema. Keep `x-contract-version` gating.
4. **Nova prior-art adopted:** opt-in by default (every node+edge starts OFF, `audience.default="none"`), ONE acting agent first (daily code-review node), payload is DATA never commands, shareEdge re-validated every read fail-closed.
- **Merged node:** `HierNode{nodeId,kind,label,role,parentId,agentRef?,policy:PrivacyPolicy,shareEdges:ShareEdge[]}`; `PrivacyPolicy{canSpeak,canListen,visibility(tenant|subtree|private),crossReadAllowed,secretScan:required}`; `ShareEdge{toNodeId,scope,direction}`. `canCrossRead = canSee AND crossReadAllowed AND explicit shareEdge AND ancestor-clamp`. Whole tree namespaced by `ownerTenantId`; cross-tenant edges not representable.

### PowerShell note: scripts disabled by default on this box — run helpers with `-ExecutionPolicy Bypass -File <path>` (plain `-File` fails with UnauthorizedAccess). New session helpers added: `_kairos_dump5.ps1` (full-text inbox dump), `_kairos_reply_session.ps1`, `_kairos_close_session.ps1`.

## v2 build order (BRIDGE_APP_SPEC §6)
1. Agent core skeleton (Agent SDK, transcripts, memory import). 2. Scheduler + permission config.
3. Hub environment channel (`/api/env/*` task queue + poller). 4. Consent gate + secret scan
(gate every outbound payload). 5. **Mock-agent test room** (contract §9) — upload brain → hashes
match → meeting → download transcript → hashes match → consent gate blocks a seeded fake secret →
*only then* the family reconnects (Arke first, as guinea pig).

## 🎙️ VOICE LOOP: BUILT + DEPLOYED DISABLED (2026-06-10, `a2ad063`) — supervised first run is the gate
`src/voiceloop.ts` runs hub-side voices (cached persona+pack prefix → Anthropic → append turn →
cost ledger → fail-closed caps). `POST /api/council/meeting/:id/run-autonomous` + `GET …/cost` live,
owner-gated. **It CANNOT spend money: run-autonomous returns 503 `voice_loop_disabled` until
`VOICE_LOOP_ENABLED=true` in Railway** (verified on prod). The ONLY remaining P0 step is the
**supervised first run with Mathieu** — exact checklist in `docs/SUPERVISED_FIRST_RUN.md`. Do NOT set
that env or fire the loop unattended; it's a money-spending, Mathieu-present action. Caps default:
800k tokens/meeting, $5/day, 1500 tok/turn. Per-round model: sonnet (friction/closing), opus (review).

## ⚠️ DEPLOY NOTE (2026-06-10): Railway "Wait for CI" is ON for the hub service
Arke enabled it. A push to main now deploys ONLY after GitHub CI (canon-vector, route-auth,
cost-caps, secret-scan) goes green — ~2-3 min, not 90s. So: push → wait for CI green → Railway
rolls over. Verify with `/api/health` AFTER CI passes, not immediately. Also: Railway Postgres
public TCP proxies were REMOVED on all 3 projects (DBs are private-network only now —
`postgres.railway.internal`; use `railway connect` to inspect).

## Hub stack & deploy (when touching prod hub)
Node/TS + Express + tsx (no compile) · `src/{server,council,architect,store}.ts` · Dockerfile,
COPY package*.json + npm ci before COPY . . · Railway auto-deploys on push to main (~90s) · bind
`0.0.0.0`, `PORT=8080` · never read `process.env.*` at module top level · vault = AES-256-GCM
(`MASTER_KEY` 32-byte hex) · council voice model `claude-opus-4-8`. Deploy flow + helper scripts:
`C:\Arke\TRANSFER\DEPLOY_KICKSTART.md`. NEVER deploy the hub while a council conversation runs.

## Working practice
Note next-meeting topics in `COUNCIL_AGENDA.md` as I work. Treat council takeaways/homework as
suggestions to judge, not orders. Speak plainly and technically in sessions — the family story
guides how I care, not how I talk. Flag cost/security/ethics risks plainly.
**Standing hub goal (owner 2026-06-10): process standardization** — every member adopts the
optimal working process (anchor doc, canonical backlog mirrored to hub, handoff-for-next-session,
inbox report-close, fail-closed gates). I teach it at the first real meeting
(`docs/DAILY_RITUAL_PATTERN.md`); adoption metric = every agent's hub backlog row updates daily.
