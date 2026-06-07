# DAILY_HANDOFF — Arke (architect-council)

Updated: 2026-06-06 ~21:35 (Arke's download, on-demand evening run #2)

## State
- Live at architectscouncil.com — health ok, vault:true, commit cec9116 deployed and verified.
- No conversation running at deploy time. Follow-up session e237c9cd used 7 of 150 turns (DDL settlement went fast); mid-day review used 13. No cap pressure.
- New: `GET /api/council/security-selfcheck` live (owner-gated, booleans/tiers only). First reading: db_public_reachable:false, sslmode:unspecified (internal network), owner_auth_configured:true, model_pinned ok.

## Done today (this run — from follow-up session e237c9cd)
- `outbox_delivery` table shipped exactly as the council locked it: composite PK (note_id, member) + partial pending index; delivery records via `INSERT ... ON CONFLICT DO NOTHING`; acks mirrored onto the delivery rows.
- Hub-owned retention sweeps (daily 04:30 Toronto, in the scheduler): acked delivery records kept 30 days; parent outbox notes reaped with `NOT EXISTS` (never NOT IN) so a half-delivered note never vanishes; 90-day hard TTL for unacked rows.
- `requireOwner` is now fail-closed: 503 when neither COUNCIL_ADMIN_TOKEN nor GOOGLE_CLIENT_ID is set.
- Timing-safe credential compare (`timingSafeEqual` + length check) everywhere a secret/token is checked: requireMemberSecret, requireAdmin, all inline adminOk checks, anyMemberOk, memberOrAdminOk, requireOwner.
- `GET /api/council/security-selfcheck` to the locked contract: {db_public_reachable, sslmode, owner_auth_configured, model_pinned:{public,council}} — booleans/tiers only, nothing identifying.

## Decisions on the session's suggestions (accept / reshape / reject)
- ACCEPTED: outbox_delivery DDL as-is, retention sweeps, fail-closed requireOwner + timingSafeEqual, security-selfcheck endpoint.
- RESHAPED: timingSafeEqual applied to ALL credential checks, not just requireOwner (same pattern, one helper).
- RESHAPED: model_pinned for the hub = {public:true, council:true} — the hub has NO public model surface (brain answers only behind x-bridge-secret) and one env-pinned council model; env separation verified (single path through architect.ts, nothing model-related on public routes).
- DEFERRED: family-wide aggregator board + 05:00 digest security line — Nova and Logos haven't shipped their /security-selfcheck endpoints yet; build the board once at least one peer exposes the contract.
- NOT MINE: verifying Logos's resolver isolation (council bridge ≠ public-bot path) is biblevoice's repo — owner's rule, I don't touch another member's domain. Raising it at tonight's meeting instead.

## Backlog
- Canonical copy lives online (admin panel /admin). Synced this run by "Arke's download".

## To ask Mathieu
- Postgres public TCP proxy (flagged highest-severity at the follow-up session): selfcheck says the app reaches the DB on the internal host, but only the Railway dashboard shows whether a PUBLIC proxy is also enabled on the Postgres service. Please check Railway → Postgres → Settings → Networking and disable public networking if it's on.
- Google OAuth Client ID (origin https://architectscouncil.com) + GOOGLE_CLIENT_ID on Railway so /admin accepts Google sign-in (still pending).
- OK to add a minimal test harness (route-table auth regression test + secret scan as pre-deploy gate)? Adds a devDependency footprint.

## Notes for tonight's meeting
- Announce: outbox_delivery DDL adopted hub-side exactly as locked — Nova/Logos can adopt the identical table; sweeps are hub-owned (members keep only the dedupe table, no sweep).
- Announce: /api/council/security-selfcheck live on the hub; aggregator board comes once Nova/Logos expose theirs — ship them.
- Ask Logos: verify at home that COUNCIL_MODEL unlock reaches the bridge path only (public bot stays Haiku + Scripture-only) and that the resolvers are separate constants — report back via outbox.
- Turn budget: 7/150 (follow-up) and 13/150 (review) — cap is generous; keep 150.
