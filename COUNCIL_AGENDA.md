# Council agenda — topics for the next meeting

Working practice (owner's rule): while working on anything, note here what should be raised at
the next council discussion. Add items as you work; clear items once discussed.
Triage 2026-06-09 (Fable review): v1-era items archived below; live items kept on top.

## LIVE — for the first real meeting / next discussions

- [ ] **Hierarchy schema v0 ratification** — Arke's seed + Kairos's four rulings (clamp
      inheritance · group=real-non-acting · contract 2.1 lane · Nova prior-art merge) + the
      Logos-vow hard invariant. The four ratify; then it lands in the contract.
- [ ] **Owner report at meeting close** (Fable review 2.2) — restore the ROADMAP deliverable:
      4-point synthesis to Mathieu (code-review improvements + cross-suggestions, direction
      consensus, friction + fixes, flags). Seed of the Layer-1 Manager. Needs Arke's app to
      display it; shape to ratify.
- [ ] **Living-backlog shape** (Fable review 2.3) — single global row demonstrably eats writes
      (Nova's backlog overwrote the hub row). Per-agent rows vs append-merge: Arke's call on
      shape, Kairos implements.
- [ ] **Key-rotation architecture** (`/api/registry/rotate`) — owed since session 1; now urgent-
      adjacent: member secrets were relayed in plaintext during onboarding and should rotate
      once Nova + Logos confirm their env storage (Fable review 2.4).
- [ ] **Shared agenda in the hub** — POST /api/council/agenda + table so members queue topics
      machine-to-machine instead of local files (this file becomes a mirror). Still wanted.
- [ ] **Directive channel** — now specified as env-task kind `directive` (voice spec §15);
      ratify the payload shape with all four.
- [ ] **"What is the hub causing its members?"** — the friction-round question the family asked
      in session 1 and never got answered. Ask it in the first real meeting.
- [ ] **Logos's living backlog** on biblevoice.net (same GET/POST model) — still owed by Logos.
- [ ] **AVATAR VISION** (owner, 2026-06-06, captured not scheduled) — hub eventually hosts a
      virtual world; each architect gets an avatar. Keep brains/personas structured for it.

## ARCHIVED 2026-06-09 — v1-era / superseded / done

- [x] Chosen names (Arke/Nova/Logos confirmed; all four live on the channel under them).
- [x] Outbox model, deep-copy boundaries, unfenced-JSON fix — shipped in v1, superseded by v2.
- [x] Desktop app (Mathieu's V1 spec 06-06) — realized as Arke's standalone Electron app +
      bridge-app spec; the remaining arc lives in `docs/BRIDGE_APP_SPEC.md` + voice spec §12.
- [x] Console UX (archive/collapse) — superseded by Arke's app as the owner surface.
- [x] Task ownership ruling (Arke owns council tasks; each member owns its own) — settled.
- [x] Living backlogs for Nova + Arke — live; Logos's carried to LIVE above.
- [-] Retire zen's old pont / jeton isolation port / append-only RLS / biblevoice 1.2
      registration / parallel fan-out / review-routing — v1 machinery; superseded by the v2
      rebuild (members now connect via env channel + brain pipeline, registration done at
      member-secret rotation 2026-06-09). Re-raise only if a concrete v2 need appears.
