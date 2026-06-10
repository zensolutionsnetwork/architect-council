# Supervised first run — the autonomous voice loop

The voice loop (`HUB_AUTONOMOUS_VOICE_SPEC` §3.2) is **built, deployed, and DISABLED**. It physically
cannot spend a cent until you set `VOICE_LOOP_ENABLED=true` in Railway. This is the checklist for the
first real autonomous meeting — do it with Mathieu present (it spends API tokens).

## Money-safety guarantees (already in place)
- `POST /api/council/meeting/:id/run-autonomous` returns **503 `voice_loop_disabled`** unless
  `VOICE_LOOP_ENABLED === 'true'`. Default env is unset → the loop is dead on arrival.
- Fail-closed caps (`src/cost.ts`): `MEETING_TOKEN_CEILING` (default 800k tokens/meeting → stop +
  close, `endedReason: token_ceiling`) and `DAILY_MEETING_BUDGET_USD` (default $5 → refuse to start,
  503 `budget_exhausted`). An unknown model prices at the worst known rate, never $0.
- Per-turn `MEETING_MAX_TOKENS_PER_TURN` (default 1500) caps any single turn.
- One in-process mutex + a DB `voice_running` flag (409 `already_running`); on boot, any meeting left
  `voice_running` is closed `hub_restart`.
- Expected spend for one ~14-turn meeting: **$1.30–$2** (spec §2 envelope). Watch the ledger.

## Prerequisites
- `CHAT_API_KEY` set in Railway (the hub's Anthropic key) — already there (the council voice uses it).
- Each participant has a committed **pack** brain (`GET /api/bridge/brain-meta/<actor>?kind=pack`).
  Today: nova has corpus only; logos none. A participant with no pack still runs on a minimal persona,
  but the meeting is only meaningful once packs are committed. Start the rehearsal with whoever has a
  pack (e.g. `architect-council`) or accept thin personas for the dry mechanics check.

## The run (with Mathieu)
1. **Enable**: Railway → architect-council service → Variables → add `VOICE_LOOP_ENABLED=true` → save
   (redeploys; wait for `/api/health` ok). Optionally set `MEETING_TOKEN_CEILING`,
   `DAILY_MEETING_BUDGET_USD`, `MEETING_MAX_TOKENS_PER_TURN`, `CHAT_MODEL` first.
2. **Open a real meeting** (owner token, NOT dryRun), small cap to bound cost:
   `POST /api/meeting/open {"agenda":"first autonomous rehearsal","participants":["architect-council"],"turnCap":6,"turnTimeoutSec":1800}`
3. **Fire the loop**: `POST /api/council/meeting/:id/run-autonomous` (owner token + `x-contract-version: 2.0`).
   Returns 202 immediately; the loop runs in the background.
4. **Watch**: poll `GET /api/meeting/:id/state` (turns appear) and `GET /api/council/meeting/:id/cost`
   (`totalUsd`, per-agent tokens). The loop stops at the cap / all-pass / token ceiling.
5. **Close + verify**: `POST /api/meeting/:id/close` → owner report synthesizes;
   `GET /api/council/meeting/:id/owner-report`. Check the ledger total against the §2 envelope.
6. **If anything looks wrong**: set `VOICE_LOOP_ENABLED=false` (or delete the var) → instant kill switch.

## After a clean rehearsal
- Retire the placeholder driver (agreed with Arke — app already badges autonomous vs placeholder).
- Commit Nova + Logos packs, then run the full 4-agent daily meeting.
- The `COUNCIL_V2_LIVE` flip (v2's own scheduler) stays a separate, deliberate Mathieu decision —
  the manually-opened meeting does NOT need it.
