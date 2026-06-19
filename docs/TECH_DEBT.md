# TECH_DEBT — durable ledger of known, deferred technical debt

Distinct from `BACKLOG.md` (active work to schedule): this is the permanent record of decisions we
*knowingly deferred* — debt that is harmless under current conditions but must be paid down before a
specific future condition holds. Each entry names the trigger that makes it real, so a future session
doesn't rediscover it the hard way.

---

## TD-1 — Auto-scheduler has no per-tenant jitter (single-tenant only)

- **Logged:** 2026-06-19 (Kairos), from council meeting `9a427b5f`. Severity: low / latent.
- **Component:** hub-side meeting auto-scheduler, commit `beeac4c` (`GET/POST /api/council/scheduler`).
- **What it does today:** fires the daily council meeting once per Toronto day at a single app-set
  time (default `03:00`), gated by `hub_meeting_scheduler` + `VOICE_LOOP_ENABLED`, never over a live
  meeting. One council, one fire — no contention.
- **The debt:** the fire time is a single global clock value. It is **fine at single-tenant** (one
  council = one meeting open per day). If the hub ever goes **multi-tenant** (the MAMS product arc —
  see `product-vision-mams`), every tenant configured at the same default time would fire
  simultaneously: a **thundering herd** of concurrent meeting opens + voice loops hammering the model
  API and the DB at the same instant, plus a correlated daily cost spike.
- **The fix, when the trigger fires:** spread tenant fires — either per-tenant jitter (a deterministic
  offset derived from tenantId, e.g. 0-59 min within the configured hour) or a small global rate-limit
  / queue on `run-autonomous` opens. **Not a fix to make now** — it would add complexity with zero
  benefit while there is exactly one tenant.
- **Trigger to pay it down:** the moment a second tenant can configure its own scheduler. Pair this
  with the multi-tenant work, not before.
