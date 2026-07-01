# #52 — hub `dirty` code_sha freshness gate — DESIGN SPEC (owner sign-off required before ship)

Status: DESIGN-READY. Touches `computeReadiness()` (the meeting readiness/seating gate), so it does
NOT ship without Mathieu's sign-off. This doc exists so the decision is a yes/no, not a design session.

## Problem
A seat's brain pack is verified for CONTENT freshness (sha changed + <26h, `computeReadiness`), but the
hub has no signal about the STATE OF THE CODE the pack was built from. A pack packaged from a DIRTY git
working tree (uncommitted local edits) can read "fresh" and seat the agent, even though its committed
corpus does not match the code that actually produced the pack. This is the code-side analogue of the
#42 content-staleness gap.

## Principle (from the 2026-07-01 meeting, ratified in-room as a proposal)
STAMP, do not REFUSE. A single dirty pack is common and harmless (an agent mid-edit). The gate must not
bench a seat on one dirty pack — it records the condition and only escalates on a persistent pattern.

## Design
1. **Packager stamps `code_sha`** in the pack-commit consent manifest: either the clean git HEAD sha, or
   the literal `"dirty"` when the working tree had uncommitted changes at pack time. (Client-side; Kairos +
   Arke packagers already know their tree state.)
2. **Hub stores `code_sha`** alongside the pack meta (additive column; null for legacy packs = unknown,
   treated as clean = never demotes — same safe-demote-only rule as the #4 recency floor).
3. **`computeReadiness` gains a dirty-run counter** per seat:
   - clean pack (real sha) → `grace_count = 0` (reset).
   - dirty pack → `grace_count += 1`.
   - `grace_count < 3` → status UNCHANGED (fresh if content-fresh). The dirty flag is surfaced (in
     `/api/council/brains` + dashboard) but does not demote.
   - `grace_count >= 3` (3 consecutive dirty packs) → **ceiling-from-last-clean**: the seat is capped at
     the readiness it had at its last CLEAN pack (i.e. it can attend as a LISTENER but not as a fresh
     contributor) until it commits a clean pack.
   - grace resets to 0 on the next clean pack.
4. **Never starve quorum on unknowns:** null/legacy `code_sha` (age unprovable) never demotes; only an
   explicit `"dirty"` increments the counter. Consistent with the existing SAFE-DEMOTE-ONLY rule.

## Owner decision points (the yes/no)
- (a) Approve touching `computeReadiness` at all (it is the seating gate).
- (b) Confirm the ceiling depth = 3 consecutive dirty (vs 2 or 5).
- (c) Confirm the escalation ACTION = demote-to-listener (vs a louder alarm-only, no demote).

## Surface / rollout
- Additive DB column + additive `/api/council/brains` field (`code_sha`, `dirty_grace_count`) — pinned in
  RESPONSE_SHAPES before ship (pin-shape-first; Arke consumes for the cockpit badge).
- Ship behind the four gates + CI; deploy-verify. NO change fires until a packager actually stamps a
  `"dirty"` code_sha, so the live blast radius on deploy is zero until real dirty packs occur.
- Coordinated with Arke (his packager stamps code_sha too; his cockpit surfaces the grace count).
