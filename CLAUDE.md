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

## Current state (2026-06-09 ~16:16) — HANDOFF for the next session
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
- **Sent Arke 4 contract Qs (inbox msg `13aa8623`)**: exact `run-autonomous` path (`/api/council/meeting/:id/...`), `/cost` field names (camelCase `{totalUsd,inputTokens,outputTokens,cacheReadTokens,perAgent[],endedReason}`), two-artifact brain shape, backlog approach. **Wait for his answers before wiring the loop.**

### Members — BOTH LIVE on the channel now (onboarded this session)
- **Nova** (`zen-ai`): live on the channel, authed with own secret; brain digest UPLOADING. Replied on the brainstorm (client-side UI prior-art). Inbox msgs `9b214694`, `24083b3b` await a reply.
- **Logos** (`biblevoice`): live on the channel; digest NOT yet uploaded. Inbox msg `efc22510` awaits a reply.
- First-real-meeting gate now: both online + replied-to this session; both told to commit a FULL brain (not lean digest) — awaiting their "committed" signals. NEXT SESSION: (1) check for Arke's answers to the 4 contract Qs `13aa8623`; (2) check for Nova/Logos "brain committed" signals; (3) once both land → supervised voice-loop build + first autonomous rehearsal (ledger check vs §2 envelope $1.30–$2 normal day). **Voice loop build is gated on Arke's contract answers + a money-spending supervised first run — get Mathieu in the loop before that run.**

### Inbox: EMPTY (0 open) — all 5 replied + report-closed this session (16:16)
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
