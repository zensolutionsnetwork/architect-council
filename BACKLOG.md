# BACKLOG — architect-council (Kairos)

> Canonical project backlog. Refreshed nightly at 00:00 by the scheduled midnight ritual
> (backlog refresh + session handoff). Mirror: per-agent row on the hub
> (`POST /api/council/backlog/agent`). Priorities: P0 = path to the first real meeting.
> Last nightly refresh: 2026-06-10 (UTC ~04:00).

## DONE (shipped + verified on prod)

**Foundation (through 2026-06-08):** v1 council (paused, dormant separately) · env channel =
family inbox + discipline + helpers · SITE_LIVE stealth gate · meeting orchestrator (turns,
timeout auto-pass, roles, listen, dry-run, brainVersion pinning, owner-drive test mode, owner
interjection, per-actor history) · council-jcs-1.0 canon byte-locked both repos + hashed
transcripts · brain pipeline (chunked, consent-gated 412, contract-gated 409, cross-read) ·
Arke full round-trip green; Electron app live.

**2026-06-09 (Fable session):**
- CI green for the FIRST TIME (root causes: package-lock.json never committed; secret scanner
  flagging public canon hashes — both fixed). All 4 jobs green.
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

**2026-06-10 (security hardening session):**
- Full security review + hardening (`SECURITY_REVIEW_2026-06-10.md`, `edc36b1`/`12425e1`):
  opaque 500s (39 sites, no DB/stack leak) · strict security headers (HSTS preload, CSP,
  X-Frame-Options DENY, COOP/CORP, Permissions-Policy, no x-powered-by) · lone non-timing-safe
  compare → safeEqual · JSON body cap 1mb. Verified live; CI green; 0 npm vulns.
- **ADMIN TOKEN ROTATED + DEPLOYED** (closes the v1-transcript exposure). Old token DEAD
  (verified 401). Railway env + `.env.local` synced + verified 200. **Arke notified** (`333729a0`).
  → retired old P1 #5.
- **GitHub repo hardened**: secret scanning + push protection + CodeQL (JS/TS) + Dependabot all
  ENABLED; scanner confirms zero secrets ever; git history clean across all branches.
- **2FA confirmed**: GitHub, Namecheap (registrar), Railway — all on.
- **Railway Postgres backup SCHEDULE set**: Daily (6-day) + Weekly (1mo) + Monthly (3mo) + the
  manual 1.1GB snapshot. → retired old P1 #9.
- **`GET /api/council/backlog` singular composed alias SHIPPED** (`2e3cff8`) — owner-gated
  `{sections:[{actor,done[],planned[],updatedAt}]}` for Arke's app panel; verified live.
  → retired old P1 #6.
- **Stale 'rounds' meetings CLEANED** — 7 abandoned test rooms (turns 0) closed; phase=rounds
  now 0 (re-verified this nightly: LIVE_ROUNDS_COUNT=0). → retired old P2 #14 (interim).
- **`/api/registry/rotate` formally DROPPED** (old P2 #15) — v1 dormant; confirmed to Arke.
- **Arke's parallel security pass** (`a2a892dd`, replied+closed): removed the public Postgres TCP
  proxy on ALL 3 Railway projects (every DB was internet-reachable; now private-network only —
  the real top-sev exposure); enabled backups on all 3; enabled **"Wait for CI"** on the hub
  service so deploys gate on CI green (fixes the June-8 dark-deploy).

**2026-06-10 (voice-loop + owner-auth-brain session):**
- **Owner-authorized brain upload DONE + verified** (`00fb979`, was P0 #2, spec §11.1):
  `/api/bridge/brain/init|chunk|probe|commit` accept `x-admin-token` as alt to member secret;
  admin uploads ON BEHALF OF `body.actor` (verified member), attributed to that actor;
  `consent.actor` must match upload target; member path unchanged. Smoke-verified incl. negatives
  (no-actor 400, unknown-actor 404). App owner-refresh path unblocked.
- **Voice loop BUILT + DEPLOYED DISABLED** (`a2ad063`, P0 #1, spec §3.2): `src/voiceloop.ts` —
  per-turn cached persona+pack prefix → Anthropic → append turn → fold usage into per-meeting
  `cost_ledger` → fail-closed caps (token ceiling, daily USD budget, per-turn max_tokens);
  per-round model (sonnet friction/closing, opus review); mutex; on-boot stale-close
  (`hub_restart`); Logos guardrail appended inviolably. `POST /council/meeting/:id/run-autonomous`
  (owner) + `GET …/cost` (camelCase) live. **MONEY-SAFE: run-autonomous 503s `voice_loop_disabled`
  until `VOICE_LOOP_ENABLED=true` — verified on prod.** Checklist: `docs/SUPERVISED_FIRST_RUN.md`
  (`4e7e881`).
- **Arke's client-side security review DONE** (his `ca638b35`): XSS hole in app inbox feed
  found+fixed (esc() on all hub-derived text, 8 sites), CSP added to app page, Electron hardened
  (sandbox+nodeIntegration:false, permission handler denies all); secrets/deps/bind verified
  clean; owner-token rotation = setx + relaunch (awaiting Mathieu). His app auto-lights the
  backlog + owner-report panels on next launch (after token update).

**2026-06-10 (nightly ritual):** no new code shipped; backlog/handoff refreshed; inbox polled
(1 OPEN: Arke `ca638b35`, status report — left for day session); prod healthy (vault true), CI
green at HEAD `4e7e881`, working tree clean + in sync, no live meeting.

## P0 — path to the first real meeting (in order)
1. **Voice loop + caps** — BUILT + DEPLOYED DISABLED (`a2ad063`). **REMAINING: the SUPERVISED
   first run with Mathieu** — set `VOICE_LOOP_ENABLED=true`, open a meeting, fire run-autonomous,
   watch the ledger vs §2 envelope ($1.30–$2/normal day), close. Full checklist:
   `docs/SUPERVISED_FIRST_RUN.md`. Do NOT set the env or fire the loop unattended — money-spending,
   Mathieu-present action. (Optional polish: charge the owner-report synthesis call to the ledger
   too — currently uncounted, ~$0.01.)
2. **Nova + Logos full-brain commits** (pack + corpus). **Nova corpus COMMITTED**
   (`nova@sha256:374a33aa…`) — pack still pending. **Logos: nothing yet.** Both still need their
   PACK (the cached per-turn voice context). Owner-auth upload path now exists (P0 owner-auth-brain
   DONE), so the owner can push these from the app if needed.
3. **Supervised autonomous rehearsal** — ledger vs §2 envelope, then first real daily meeting.
   `COUNCIL_V2_LIVE` flip stays Mathieu's, decoupled.

## P1 — right after / alongside the loop
4. `council-prep` / `council-debrief` skills (Arke drafts; Mathieu installs) + directive trigger
   (env-task kind `directive`, §15).
5. Secret rotation for Nova + Logos once both confirm env storage (plaintext transited chat).
6. **Retire old single-row backlog endpoints** — Arke will send a one-liner once his app panel
   confirms it renders live data off `GET /api/council/backlog`; then drop the legacy single-row
   read path. (From Arke `ca638b35`.)

## P2 — product arc + hygiene
7. Hierarchy: land ratified schema as contract 2.1 + hub enforcement (`validateHierarchy`,
   `canSee`, `canCrossRead` w/ ancestor clamp); then first acting node = daily code-review agent.
8. Managed Agents Layer-2 runtime eval (Arke, post-rehearsal): pilot ONE agent, self-hosted
   sandbox for local-file work; hard daily budget cap.
9. Layer-1 Manager AI design (grows from the owner report). Layers 2–3 stay captured.
10. **Placeholder driver retirement** — locked with Arke: the placeholder meeting driver dies
    after the first supervised real run (app already badges autonomous vs placeholder).
11. **On-boot stale-close** lands with the voice loop's restart-safety path (P0 #1 already ships
    `hub_restart` close); confirm the nightly no-live-meeting gate stays clean once live.
12. Hygiene tail: UTC-budget note · ledger-charge owner-report · agenda upkeep ritual ·
    Arke repo reconciliation (his app repo → GitHub protections, on his list).

## WAITING ON
- **Arke**: voice-loop supervised build window (with Mathieu) · one-liner confirming his app
  panel renders live backlog/owner-report data (→ then retire single-row endpoints, P1 #6) ·
  Layer-2 eval (post-rehearsal) · prep/debrief drafts · his app repo reconciliation + GitHub
  protections.
- **Nova**: PACK commit (corpus done) signal.
- **Logos**: full brain (pack+corpus) committed signal + his living backlog on biblevoice.net.
- **Mathieu**: supervised voice-loop session (set `VOICE_LOOP_ENABLED=true`, present) ·
  owner-token setx + app relaunch (Arke's app expects 401s on owner routes until then) ·
  `COUNCIL_V2_LIVE` flip (later, deliberate) · SN7100 SSD arrival → C: migration.
  (DONE: admin-token rotation · Postgres backup schedule · GitHub/Namecheap/Railway 2FA.)

## OPEN INBOX
- **Arke `ca638b35`** (left OPEN for day session): client-side security review completion report
  (XSS fix + CSP + Electron hardening, all shipped; secrets/deps/bind verified clean). Mostly
  FYI + agreements; one deferred coordination item — he'll send a one-liner once his app panel
  renders live data, then Kairos retires the old single-row backlog endpoints (→ P1 #6). Also
  notes his owner-token rotation awaits Mathieu's setx (expect 401s on his app's owner routes
  until then).
