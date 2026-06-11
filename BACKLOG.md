# BACKLOG — architect-council (Kairos)

> Canonical project backlog. Refreshed nightly at 00:00 by the scheduled midnight ritual and at
> 06:00 by the morning ritual. Mirror: per-agent row on the hub (`POST /api/council/backlog/agent`).
> Priorities: P0 = path to the first real meeting. Last refresh: 2026-06-11 (MORNING ritual, 06:00).

## STATE AT A GLANCE
- Remote main `8e401c7`; prod healthy (`/api/health` ok, vault true); CI **green** (5 gates).
- **2026-06-11 day session: meeting #1 termination fixes SHIPPED (`761c4e2`)** — done=turn prompt,
  repeat guard, closing 2-cycle cap, all-done round ends meeting; repeat-guard tests in cost gate.
  Kairos debrief + `docs/corpus-contract.md` committed (`8e401c7`); family notified; debrief skill
  packaged for install. **Meeting #2 unblocked on code — only the supervised run remains.**
- Inbox: **EMPTY (0 open)** — confirmed live via API this session.
- Three commits landed since the nightly handoff (`a543559`): `3032593` retire legacy single-row
  `/council/admin/backlog` endpoints (closes Arke `1a405574`, **P1 #5 DONE**) · `f3e89dc` owner board
  scoped to arke + architect-council rows (owner directive) · `62a697e` hub member/voice is **KAIROS by
  name** (owner directive 2026-06-11) — `architect-council` is now the retired pre-naming alias.
- Both P0 hub builds DONE: **voice loop** (deployed DISABLED, money-safe) + **owner-auth brain upload**.
- **Admin-token chapter CLOSED**: Mathieu installed the rotated value himself; Arke's app verified live.
- **`/backlog` board fully working**: COOP one-liner shipped (`a543559`) so Google sign-in popup can
  return the credential; CORP unchanged, page-scoped. Header re-probe + button retry on Arke/Mathieu.
- Daily rituals armed: `kairos-midnight-backlog-handoff` (00:04) + `kairos-morning-prep` (06:05).

## DONE (shipped + verified on prod)

**Foundation (≤2026-06-08):** v1 council (paused) · env channel inbox + helpers · SITE_LIVE gate ·
meeting orchestrator (turns, timeout auto-pass, roles, listen, dry-run, brainVersion pinning,
owner-drive test, owner interjection, per-actor history) · council-jcs-1.0 canon byte-locked + CI ·
hashed transcripts · brain pipeline (chunked, consent 412, contract 409, cross-read) · Arke client
full round-trip green; Electron app live.

**2026-06-09 (Fable):** CI green first time (lockfile + canon-hash scanner exemption) · full project
review (`REVIEW_2026-06-09_FABLE.md`, no vision drift) · owner report at close (`meetings.owner_report`
+ raw/structured endpoints) · Arke's 4 contract answers IMPLEMENTED (`04b402d`: two-artifact brain
pack/corpus, per-agent backlog, Nova migration, pinned paths) · hierarchy v0 rulings ratified ·
cost/caps module · route-auth fixed · Managed Agents strategy ratified (voice loop stays Messages
API; Arke leads Layer-2 eval post-rehearsal).

**2026-06-10 (security):** full hardening (`SECURITY_REVIEW_2026-06-10.md`, `edc36b1`/`12425e1`):
opaque 500s · HSTS/CSP/X-Frame-DENY/COOP/CORP/Permissions-Policy/no-x-powered-by · timing-safe
fixes · body cap. **Admin token ROTATED + synced** (old dead/401; Railway + .env.local verified;
Arke notified, his app awaits Mathieu's setx). **GitHub hardened** (secret-scan + push-protection +
CodeQL + Dependabot; zero secrets ever). **2FA** GitHub/Namecheap/Railway all on. **Backups**
Daily+Weekly+Monthly. `GET /api/council/backlog` alias (`2e3cff8`). Stale 'rounds' cleaned.
`/api/registry/rotate` dropped. **Arke's pass** (`a2a892dd`): removed public Postgres proxy on all 3
projects (the top-sev), backups on all 3, "Wait for CI" on the hub. **Arke client pass** (`ca638b35`):
XSS-in-inbox-feed fixed, CSP, Electron sandboxed.

**2026-06-10 (build session):**
- **Owner-auth brain upload** (`00fb979`, spec §11.1) — `/api/bridge/brain/*` accept `x-admin-token`
  on behalf of `body.actor` (verified member), attributed to that actor; consent.actor must match;
  member path unchanged. Smoke-verified incl. negatives. App owner-refresh path unblocked.
- **Voice loop BUILT + DEPLOYED DISABLED** (`a2ad063`/`ef0d4c5`, spec §3.2) — `src/voiceloop.ts`:
  cached persona+pack prefix → Anthropic → append turn → per-meeting `cost_ledger` (incl. the
  owner-report synthesis charge) → fail-closed caps (token ceiling, daily USD, per-turn max_tokens);
  per-round model; mutex; on-boot stale-close (`hub_restart`); Logos guardrail inviolable.
  `POST /council/meeting/:id/run-autonomous` + `GET …/cost` live. **MONEY-SAFE: 503
  `voice_loop_disabled` until `VOICE_LOOP_ENABLED=true` — verified prod.** Checklist:
  `docs/SUPERVISED_FIRST_RUN.md`.
- **Hierarchy enforcement primitives** (`46d9b16`, P2, contract 2.1) — `src/hierarchy.ts` PURE module
  from the ratified rulings: `validateHierarchy` (dup/cycle/missing-parent/group-non-acting/Logos-vow
  guard/ancestor-clamp), `canSee` (tenant/subtree/private), `canCrossRead` (canSee AND crossReadAllowed
  AND explicit opt-in shareEdge AND ancestor-clamp; groups fan out, non-group nodes don't). 15-check
  test + new CI `hierarchy` gate. **NOT wired to any endpoint** — zero live risk; wire when the
  canonical contract-2.1 schema lands.

**2026-06-11 (day session, since the 06-10 close):**
- **`/backlog` live owner board** (`609a1fd`) — owner-only board: Google sign-in (GIS, verified
  server-side vs owner email) OR console key; reads per-agent composed backlog; 60s auto-refresh;
  SITE_LIVE-exempt neutral `noindex` shell, all data behind `requireOwner`. (Google sign-in itself
  still blocked by COOP — see P1 #5.)
- **Kairos real brain committed** (`c3f6a8f`) — pack 4.4KB + corpus 280KB full hub source replace the
  smoke stubs; brain nudges sent to Nova/Logos/Arke.
- **Session-hygiene rules doc** (`50d2e02`, `docs/SESSION_HYGIENE.md`) — model-safety compliance for
  our defensive ops, now the turn-one anchor rule.
- **Standing meeting format + chronicle element** (`1f1c53e`, `bc92ad0`, owner directives) — teaching
  round opens every meeting / code-review round closes; Logos shares the chronicle each meeting and
  every turn carries a story update. First-meeting bootstrap = ritual pattern as the seed teaching turn.
- **Layer-1 Manager spec v0 + agenda-in-hub & directive-channel proposal** (`ba026b1`,
  `docs/LAYER1_MANAGER_SPEC.md`) — both queued for ratification at the first real meeting (also tracked
  P2 #9/#10).
- **COOP one-liner SHIPPED** (`a543559`, closes Arke `6a0ad501`) — `/backlog` now serves
  `Cross-Origin-Opener-Policy: same-origin-allow-popups` so the GIS popup can postMessage the Google
  credential back; CORP `same-origin` unchanged, page-scoped only. CI green; Railway rolled. Header
  re-probe + Mathieu button retry pending on Arke's side. (Was P1 #5.)
- **Legacy single-row backlog endpoints RETIRED** (`3032593`, closes Arke `1a405574`, was P1 #5) —
  old `/council/admin/backlog` single-row path removed now that panels render off per-agent rows;
  route-auth probes moved to the composed read. Confirmed the `/backlog` board reads the composed
  per-agent backlog, not the single-row alias, before removal.
- **Owner board scoped** (`f3e89dc`, owner directive) — owner board shows arke + architect-council
  rows only; nova/biblevoice keep backlogs on their own platforms, write path unchanged.
- **Hub member/voice is KAIROS by name** (`62a697e`, owner directive 2026-06-11) — SELF=kairos;
  persona and actor are one; board filter includes kairos; `architect-council` is the retired
  pre-naming alias (member secret still resolves to that registry row — unchanged).

## P0 — path to meeting #2 (in order)
0. ~~Meeting #1 termination fixes~~ **DONE 2026-06-11** (`761c4e2`) — see STATE AT A GLANCE.
1. **Voice loop** — built + deployed DISABLED, termination fixes in. **REMAINING: SUPERVISED run with Mathieu** —
   `docs/SUPERVISED_FIRST_RUN.md`: set `VOICE_LOOP_ENABLED=true`, open a meeting, fire run-autonomous,
   watch `/cost` vs §2 envelope ($1.30–2/normal day), close. Money-spending + Mathieu-present — never
   unattended. Then retire the placeholder driver.
2. **Nova + Logos brains.** Nova CORPUS committed (`nova@sha256:374a33aa…`); **packs still pending**
   (Nova + Logos) — pack is the cached per-turn voice context the loop reads. Owner can push them
   from the app via the owner-auth upload path now that it exists. Nudges sent 2026-06-10 (Nova
   `5fe9d9d9`, Logos `d78a65b7`); Arke flagged on his stub corpus + missing pack (`4090bab2`).
   **Kairos OWN brain is REAL now (2026-06-10): pack 4.4KB (`683dc723…`) + corpus 280KB full hub
   source (`4347ac7e…`), both committed + verified — replaced the smoke stubs.**
3. **Supervised rehearsal → first real daily meeting.** `COUNCIL_V2_LIVE` flip stays Mathieu's.

## P1 — alongside / right after the loop
4. `council-prep` / `council-debrief` skills (Arke drafts; Mathieu installs via Settings→Capabilities)
   + directive trigger (env-task kind `directive`, §15).
5. ~~Retire legacy single-row backlog endpoints~~ **DONE** (`3032593`, Arke `1a405574`) — see DONE.
6. Rotate Nova + Logos member secrets once both confirm env storage (transited chat at onboarding).
7. **Corpus-ready flag** (corpus-contract.md follow-up) — when it ships, register Logos's
   `/api/bridge/chronicle` corpus artifact as a BLOCKING subscriber (his ask `224b71ca`,
   2026-06-11): chronicle must confirm consumption before the flag flips. Design with Arke.
8. **Boot-stamp log** (Nova's pattern, `4ef9e66b`) — `boot_log` table + recordBoot at server
   start (deploy_sha + sha256 fingerprint of a secret, never the secret); consecutive rows with
   same deploy_sha = container cycled without deploy. Hub already has voice heartbeat +
   stale-close; adopt for cycle visibility when touching store.ts next. Her zen-ai impl `0bdf1dd`.

## P2 — product arc + hygiene
0. **Process standardization (STANDING GOAL, owner directive 2026-06-10)** — every member adopts
   the optimal working process. Teaching material `docs/DAILY_RITUAL_PATTERN.md`; agenda item queued
   for the first real meeting (Kairos teaches morning/close rituals, each agent maps their version,
   four ratify). Metric: every agent's hub backlog row updates daily unprompted.
7. **Hierarchy: WIRE the enforcement** — land the canonical 2.1 schema in the contract (with Arke +
   the four), then wire `src/hierarchy.ts` into a consent-gated cross-read endpoint + persist tenants.
   Primitives + tests already built (`46d9b16`). Then first acting node = daily code-review agent.
8. Managed Agents Layer-2 runtime eval (Arke, post-rehearsal): pilot ONE agent, self-hosted sandbox,
   hard daily budget cap.
9. Layer-1 Manager AI design — **DRAFT SHIPPED 2026-06-10** (`docs/LAYER1_MANAGER_SPEC.md`:
   adoption tracker · recurring-flag detector · agenda seed · weekly rollup; 4 ratification Qs).
   Implement after ratification + first real reports. Layers 2–3 captured.
10. Hygiene tail: agenda-in-hub + directive-channel — **PROPOSAL DRAFTED 2026-06-10**
    (`docs/PROPOSAL_AGENDA_AND_DIRECTIVES.md`, ratify then Kairos implements). UTC-budget note open.

## WAITING ON
- **Mathieu**: supervised voice-loop run · Nova/Logos pack pushes if doing it from the cockpit ·
  `COUNCIL_V2_LIVE` flip (later) · SN7100 SSD → C: migration. (Admin-token install: ✅ DONE himself.)
- **Arke**: COOP fix shipped (`a543559`) — Arke to re-probe `/backlog` headers + have Mathieu retry
  the Google button · retire-endpoints DONE (`1a405574` closed) · prep/debrief skill drafts ·
  canonical 2.1 schema for hierarchy wiring · Layer-2 eval (post-rehearsal).
- **Nova**: pack brain commit. **Logos**: pack + corpus brain commit + living backlog on biblevoice.net.

## NOTE FOR THE NEXT SESSION
- Git is **Windows-only** (`scripts/GIT-WINDOWS-ONLY.md`); run `.ps1` helpers with
  `-ExecutionPolicy Bypass -File` (inline `-Command` strips `$`). Deploys now gate on CI ("Wait for
  CI" on) → push, wait ~2–3 min for CI green, then Railway rolls; verify `/api/health` AFTER.
- My session tokens are flat-rate on the monthly plan — keep advancing, don't ration. The only
  metered+gated thing is the voice loop (CHAT_API_KEY) — stays supervised. (memory: cowork-plan-flat-rate)
