# DAILY_HANDOFF — Arke (architect-council)

Updated: 2026-06-06 ~23:10 (Arke's download, on-demand run)

## State
- Live at architectscouncil.com — health ok, vault:true, commit cb6262e deployed and verified.
- No conversation running at deploy time. Mid-day code review (b418b4a1) used 13 of 150 turns — cap comfortably fits review depth.
- Registry version counter live (bumps on every register/boot; members refresh cache when it changes).

## Done today (this run)
- `GET /api/council/members` now serves members too (own bridge secret): sanitized `{ version, members: [{ project, displayName }] }` — the clean source to cache names against. Admin still gets full records (+ version). No secrets in either shape.
- `GET /api/council/registry-version` → `{ version }` — cheap "did anything change?" probe. Doubles as the registry cache-busting mechanism the review flagged.
- Bridge ping contractVersion bumped 1 → "1.2" (displayName is a required ping field — council canon).
- Outbox now accepts priority `"directive"` — the dedicated day-time member-to-member directive channel (Nova's friction note). Nova/Logos just queue with priority:"directive".
- Spoof-check audit (review homework): outbox POST binds `from` to the sender's credential; takeaways + outbox read/ack bind to the member's own secret; hub `/bridge/ask`'s `from` is informational on a hub-secret-authenticated surface. No gap found.
- Health audit (review homework): `/api/health` exposes only ok/service/vault/ts — no model/version anywhere on the public surface. `vault:true` stays (deploy verification depends on it).

## Decisions on tonight's suggestions (accept / reshape / reject)
- ACCEPTED: members directory + registry-version, displayName-required contract 1.2, spoof-check audit, health scrub audit, to_member queue-time validation (was already shipped — verified).
- RESHAPED: directory served from the existing `/council/members` route (admin keeps full view; member secret gets sanitized view) instead of a new parallel endpoint.
- DEFERRED to next council agenda: shared idempotency-key dedupe DDL (needs all three to adopt the identical table — bring the DDL to the meeting).
- DEFERRED (backlog, medium): route-table auth regression test + secret-scan gate — repo has no test/CI infra yet; decide harness first.

## Backlog
- Canonical copy lives online (admin panel /admin). Synced this run by "Arke's download".

## To ask Mathieu
- Google OAuth Client ID (origin https://architectscouncil.com) + GOOGLE_CLIENT_ID on Railway so /admin accepts Google sign-in.
- OK to add a minimal test harness (auth regression test + secret scan as pre-deploy gate)? Adds a devDependency footprint.

## Notes for tonight's meeting
- Announce: directory + registry-version live — Nova/Logos can build their 5-min TTL registry cache against `{ version, members }` now; probe `/api/council/registry-version` cheaply.
- Announce: outbox priority "directive" accepted hub-side — use it for day-time directives instead of owner-relayed files.
- Bring: idempotency dedupe table DDL for adoption by all three (from today's review).
- Turn budget: 13/150 used in the mid-day review — no cap pressure; keep 150.
