# BACKLOG — architect-council (Kairos)

> Canonical project backlog, rebuilt 2026-06-09 (Fable session) from the full review
> (`REVIEW_2026-06-09_FABLE.md`) + same-day deltas. Refreshed nightly at 00:00 by the
> scheduled midnight ritual (backlog refresh + session handoff). Mirror: per-agent row on the
> hub (`POST /api/council/backlog/agent`). Priorities: P0 = path to first real meeting.

## DONE (shipped + verified on prod)

**Foundation (through 2026-06-08):** v1 council (paused, dormant separately) · env channel =
family inbox + discipline + helpers · SITE_LIVE stealth gate · meeting orchestrator (turns,
timeout auto-pass, roles, listen, dry-run, brainVersion pinning, owner-drive test mode, owner
interjection, per-actor history) · council-jcs-1.0 canon byte-locked both repos + hashed
transcripts · brain pipeline (chunked, consent-gated 412, contract-gated 409, cross-read) ·
Arke full round-trip green; Electron app live.

**2026-06-09 (Fable session):**
- CI green for the FIRST TIME (root causes: package-lock.json never committed; secret scanner
  flagging public canon hashes — both fixed).
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
- cost/caps module (fail-closed) · route-auth fixed (22/0) · hygiene batch (handoff
  consolidation, agenda triage, junk, git guard note) · Nova+Logos onboarded with own secrets.
- Managed Agents strategy DECIDED + ratified: no core redesign; voice loop stays Messages API;
  Arke leads Layer-2 runtime eval post-rehearsal; app = cockpit + self-hosted sandbox host.
  Budget approved: $100–180/mo now; ~$50–80/agent/mo scaling, hierarchy keeps it linear.

## P0 — path to the first real meeting (in order)
1. **Voice loop + caps** (§3.2/§2 + ratified robustness: run-autonomous mutex, heartbeat,
   on-boot stale-close `hub_restart`, per-turn max_tokens) + `POST
   /api/council/meeting/:id/run-autonomous` + `GET .../cost` (camelCase ledger; charge
   owner-report synthesis to it). **Build + FIRST RUN SUPERVISED with Mathieu — it spends money.**
2. **Owner-auth brain upload** (§11.1): `/api/bridge/brain/*` accepts `x-admin-token` as alt
   auth, attributed to consent-manifest actor (app refresh path).
3. **Nova + Logos full-brain commits** (pack + corpus) — both instructed; awaiting signals.
4. **Supervised autonomous rehearsal** — ledger vs §2 envelope ($1.30–2/day), then first real
   daily meeting. `COUNCIL_V2_LIVE` flip stays Mathieu's, decoupled.

## P1 — with or right after the loop
5. `council-prep` / `council-debrief` skills (Arke drafts; Mathieu installs) + directive
   trigger (env-task kind `directive`, §15).
6. Owner-report delivery to the app cost-panel slot (endpoint live; Arke wires display) +
   env-channel copy to Mathieu once delivery shape settles.
7. Secret rotation for Nova + Logos once both confirm env storage (plaintext transited chat).
8. Retire old single-row backlog endpoints once Arke's panel switches to per-agent rows.
9. Railway Postgres backup SCHEDULE (Mathieu: one click, daily suggested; manual backup exists).

## P2 — product arc
10. Hierarchy: land ratified schema as contract 2.1 + hub enforcement (`validateHierarchy`,
    `canSee`, `canCrossRead` w/ ancestor clamp); then first acting node = daily code-review agent.
11. Managed Agents Layer-2 runtime eval (Arke, post-rehearsal): pilot ONE agent (prep/debrief
    or overnight watch), self-hosted sandbox for local-file work; hard daily budget cap.
12. Layer-1 Manager AI design (grows from the owner report). Layers 2–3 stay captured.
13. Hygiene tail: UTC-budget note · ledger-charge owner-report · agenda upkeep ritual.

## WAITING ON
- **Arke**: voice-loop supervised build window (with Mathieu) · panel switch to per-agent
  backlog · Layer-2 eval (post-rehearsal) · prep/debrief skill drafts.
- **Nova**: full brain (pack+corpus) committed signal.
- **Logos**: full brain committed signal + his living backlog on biblevoice.net.
- **Mathieu**: backup schedule click · supervised voice-loop session · `COUNCIL_V2_LIVE` flip
  (later, deliberate) · SN7100 SSD arrival → C: migration.
