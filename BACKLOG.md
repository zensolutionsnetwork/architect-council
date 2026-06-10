# BACKLOG — architect-council (Kairos)

> Canonical project backlog. Refreshed nightly at 00:00 by the scheduled midnight ritual
> (backlog refresh + session handoff). Mirror: per-agent row on the hub
> (`POST /api/council/backlog/agent`). Priorities: P0 = path to the first real meeting.
> Last nightly refresh: 2026-06-09 (UTC 2026-06-10T01:4x).

## DONE (shipped + verified on prod)

**Foundation (through 2026-06-08):** v1 council (paused, dormant separately) · env channel =
family inbox + discipline + helpers · SITE_LIVE stealth gate · meeting orchestrator (turns,
timeout auto-pass, roles, listen, dry-run, brainVersion pinning, owner-drive test mode, owner
interjection, per-actor history) · council-jcs-1.0 canon byte-locked both repos + hashed
transcripts · brain pipeline (chunked, consent-gated 412, contract-gated 409, cross-read) ·
Arke full round-trip green; Electron app live.

**2026-06-09 (Fable session):**
- CI green for the FIRST TIME (root causes: package-lock.json never committed; secret scanner
  flagging public canon hashes — both fixed). Remote main `8aef6b3`, all 4 jobs green.
- Full project review (vision audit: no drift; findings 2.1–2.9).
- Owner report at meeting close (review 2.2): close-time Sonnet synthesis → 4-point report →
  `meetings.owner_report`; raw `GET /api/meeting/:id/report` + structured camelCase
  `GET /api/council/meeting/:id/owner-report`. Smoke-verified on a real micro-meeting.
- Arke's 4 contract answers RECEIVED + IMPLEMENTED same-session (`04b402d`):
  two-artifact brain (PK actor+kind, pack/corpus, `?kind=` cross-read) · per-agent backlog rows
  (Nova's content migrated off the squatted single row) · paths pinned (run-autonomous + cost +
  owner-report under `/api/council/meeting/:id/*`; rest stays `/api/meeting/:id/*`).
- Hierarchy v0 rulings sent AND ratified by Arke (clamp · group-non-acting · contract 2.1 ·
  Nova prior-art merge · Logos-vow hard invariant).
- Railway Postgres: had ZERO backups → manual 1.1 GB backup taken; schedule awaits Mathieu.
- cost/caps module (fail-closed) · route-auth fixed (22/0) · hygiene batch · Nova+Logos
  onboarded with own secrets. Managed Agents strategy DECIDED + ratified.

**2026-06-09 (nightly ritual):** no new code shipped; backlog/handoff refreshed; inbox polled
(1 new Arke message captured below); prod healthy (vault true); stale 'rounds' test meetings
noted for cleanup.

**2026-06-10 (security hardening session):**
- Full security review + hardening (`SECURITY_REVIEW_2026-06-10.md`, main `edc36b1`/`12425e1`):
  opaque 500s (39 sites, no DB/stack leak) · strict security headers (HSTS preload, CSP,
  X-Frame-Options DENY, COOP/CORP, Permissions-Policy, no x-powered-by) · lone non-timing-safe
  compare → safeEqual · JSON body cap 1mb. Verified live; CI green; 0 npm vulns.
- **ADMIN TOKEN ROTATED + DEPLOYED** (closes the v1-transcript exposure). Old token DEAD
  (verified 401). Railway env + `.env.local` synced + verified 200. **Arke notified** (`333729a0`)
  to update his app from the new value OUT-OF-BAND. → retires P1 #5.
- **GitHub repo hardened**: secret scanning + push protection + CodeQL (JS/TS) + Dependabot
  (alerts/malware/graph) all ENABLED; GitHub scanner confirms zero secrets ever; git history
  clean across all branches.
- **2FA confirmed**: GitHub, Namecheap (domain registrar), Railway — all on.
- **Railway Postgres backup SCHEDULE set**: Daily (6-day retention) + Weekly (1mo) + Monthly
  (3mo), plus the manual 1.1GB snapshot. → retires P1 #9.

## P0 — path to the first real meeting (in order)
1. **Voice loop + caps** (§3.2/§2 + ratified robustness: run-autonomous mutex, heartbeat,
   on-boot stale-close `hub_restart`, per-turn max_tokens) + `POST
   /api/council/meeting/:id/run-autonomous` + `GET .../cost` (camelCase ledger; charge
   owner-report synthesis to it). **Build + FIRST RUN SUPERVISED with Mathieu — it spends money.**
   (NB: the on-boot stale-close lands here also fixes the stale-'rounds' accumulation below.)
2. **Owner-auth brain upload** (§11.1): `/api/bridge/brain/*` accepts `x-admin-token` as alt
   auth, attributed to consent-manifest actor (app refresh path).
3. **Nova + Logos full-brain commits** (pack + corpus) — both instructed; awaiting signals.
4. **Supervised autonomous rehearsal** — ledger vs §2 envelope ($1.30–2/day), then first real
   daily meeting. `COUNCIL_V2_LIVE` flip stays Mathieu's, decoupled.

## P1 — security + with/right after the loop
5. **ROTATE the v1 admin token (SECURITY)** — Arke flagged (`72c3eb8e`): the v1 morning-ritual
   tasks embedded `COUNCIL_ADMIN_TOKEN` in PLAINTEXT prompts; it's verbatim in old transcripts.
   v1 tasks deleted/disabled, but the token is exposed. **Needs Mathieu**: rotate the Railway
   env var AND update his app env if it's the same `x-admin-token` the client uses. Coordinate
   so the nightly ritual's helper secret is updated in lockstep (`.env.local`).
6. **Reconcile backlog read endpoint with Arke's app panel** — Arke's app parses
   `GET /api/council/backlog` (owner-gated) → `{ sections:[{ actor, done[], planned[],
   updatedAt }] }` (tolerates rows/array). Hub currently exposes `GET /api/council/backlogs`
   (per-agent rows). Add/alias the singular `/backlog` composed-`sections` shape. Owner-report
   endpoint already matches his expected camelCase shape — no change.
7. `council-prep` / `council-debrief` skills (Arke drafts; Mathieu installs) + directive
   trigger (env-task kind `directive`, §15).
8. Secret rotation for Nova + Logos once both confirm env storage (plaintext transited chat).
9. Railway Postgres backup SCHEDULE (Mathieu: one click, daily suggested; manual backup exists).

## P2 — product arc + hygiene
10. Hierarchy: land ratified schema as contract 2.1 + hub enforcement (`validateHierarchy`,
    `canSee`, `canCrossRead` w/ ancestor clamp); then first acting node = daily code-review agent.
11. Managed Agents Layer-2 runtime eval (Arke, post-rehearsal): pilot ONE agent, self-hosted
    sandbox for local-file work; hard daily budget cap.
12. Layer-1 Manager AI design (grows from the owner report). Layers 2–3 stay captured.
13. **Placeholder driver retirement** — agreed with Arke: the placeholder meeting driver dies
    after the first supervised real run (app already badges autonomous vs placeholder).
14. **Stale 'rounds' meetings cleanup** — several test meetings sit abandoned in phase `rounds`
    (turns_used 0, never closed); they muddy the nightly no-live-meeting gate. Resolved
    properly by the on-boot stale-close (P0 #1); until then the gate must age/turns-check.
15. **Drop or confirm `/api/registry/rotate`** — Arke's OWNER_ASKS ledger has a June-5 (v1-era)
    promise to ship it within 48h. v1 is dormant → almost certainly formally DROP; confirm to Arke.
16. Hygiene tail: UTC-budget note · ledger-charge owner-report · agenda upkeep ritual ·
    retire old single-row backlog endpoints once Arke's panel switches to per-agent rows.

## WAITING ON
- **Arke**: voice-loop supervised build window (with Mathieu) · backlog panel reconcile
  (singular `/backlog` sections shape) · Layer-2 eval (post-rehearsal) · prep/debrief drafts ·
  ack on dropping `/api/registry/rotate`.
- **Nova**: full brain (pack+corpus) committed signal.
- **Logos**: full brain committed signal + his living backlog on biblevoice.net.
- **Mathieu**: ~~rotate admin token~~ DONE · ~~backup schedule~~ DONE · ~~GitHub/Namecheap/Railway
  2FA~~ DONE · supervised voice-loop session · `COUNCIL_V2_LIVE` flip (later, deliberate) ·
  SN7100 SSD arrival → C: migration · give Arke the new admin token out-of-band (for his app).

## OPEN INBOX
- **Arke `72c3eb8e`** (left OPEN for day session): token rotation request (→ P1 #5) · app
  panels wired awaiting hub endpoints (owner-report shape OK; backlog `/backlog` sections shape
  → P1 #6) · placeholder driver retires after first real run (→ P2 #13) · stale
  `/api/registry/rotate` promise (→ P2 #15).
