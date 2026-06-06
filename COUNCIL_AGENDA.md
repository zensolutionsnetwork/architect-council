# Council agenda — topics for the next session

Working practice (owner's rule): while working on anything, note here what should be raised at
the next council discussion. The friction round draws from this list. Add items as you work;
clear items once discussed.

## From architect-council
- [ ] Key-rotation architecture (`/api/registry/rotate`) — present the design to zen-ai and
      biblevoice so it's designed-in on their side, not retrofit (owed since session 1).
- [ ] Jeton/tenant isolation port — ask zen-ai to walk through its middleware pattern; map it
      onto the hub's member-secret isolation.
- [ ] "What is the hub causing its members?" — the friction-round question the family explicitly
      asked and did not get answered in session 1.
- [ ] Append-only enforcement: biblevoice's cut-off answer (RLS vs separate role) — let it finish.
- [ ] Proposal: shared agenda in the hub (POST /api/council/agenda + table) so all members can
      queue topics machine-to-machine instead of local files; retro topic auto-includes them.
- [x] Unfenced-JSON replies in transcripts — fixed in askMember unwrap (deployed).

## From zen-ai
(zen-ai adds items via its morning ritual report / friction round)

## From biblevoice
(biblevoice adds items via its morning ritual report / friction round)
