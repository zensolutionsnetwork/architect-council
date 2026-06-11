# Council agenda — topics for the next meeting

Working practice (owner's rule): while working on anything, note here what should be raised at
the next council discussion. Add items as you work; clear items once discussed.
Triage 2026-06-09 (Fable review): v1-era items archived below; live items kept on top.

## LIVE — for the first real meeting / next discussions

- [ ] **PROCESS STANDARDIZATION + STANDING MEETING FORMAT (owner directive 2026-06-10)** — every
      meeting: (1) TEACHING ROUND opens — each agent teaches what they did since the last meeting
      and how it improves the system (any efficiency/friction breakthrough: skills, scheduled
      tasks, workflow, technique — tooling is council property, adapted by all); each turn also
      carries a short STORY UPDATE since last meeting, and LOGOS'S TURN every meeting is to SHARE
      THE UPDATED CHRONICLE back to the family — he takes note of everyone's updates and integrates
      them (storyUpdates already route to his inbox at close; no turn complete without its story
      line); (2) CODE-REVIEW ROUND closes — day's code from the committed corpora; flags → owner report.
      First meeting bootstrap: Kairos opens with the daily-ritual pattern
      (`docs/DAILY_RITUAL_PATTERN.md`) as the seed teaching turn; each agent answers with their
      mapped version; the four RATIFY the format as the council standard. Metrics: backlog rows
      update daily unprompted; packs carry current tooling; every transcript shows all four teaching.

- [ ] **STRATEGY: Claude Managed Agents (launched 2026-04, public beta)** — Anthropic now sells
      cloud-hosted agent infrastructure (stateful long-running sessions, sandboxes incl.
      self-hosted, scoped permissions, $0.08/session-hr + tokens). Owner decision w/ Kairos
      recommendation (2026-06-09): (a) **voice loop stays on Messages API** — Anthropic's own
      guidance ("custom agent loops and fine-grained control") matches our bounded, capped,
      turn-controlled meeting; (b) **evaluate Managed Agents as the Layer-2 runtime** — it
      could replace most of BRIDGE_APP_SPEC's mechanical half (24/7 scheduler, persistent
      sessions, sandbox, permission model = months of infra we no longer have to build);
      (c) caveats: NOT Zero-Data-Retention eligible (session history lives server-side at
      Anthropic — matters for our consent/trust story; self-hosted sandboxes mitigate
      execution only), multi-agent coordination still research preview. The hub stays the
      system of record regardless (contracts, hashed transcripts, consent, hierarchy, ledger).
      Also: Asana AI Teammates / Notion custom agents built on it = adjacent competitors;
      our moat is the sharing/trust/hierarchy layer — speed matters more now. Arke leads the
      Layer-2 evaluation (his bridge-app territory).

- [ ] **Hierarchy schema v0 ratification** — Arke's seed + Kairos's four rulings (clamp
      inheritance · group=real-non-acting · contract 2.1 lane · Nova prior-art merge) + the
      Logos-vow hard invariant. The four ratify; then it lands in the contract.
- [x] **Owner report at meeting close** — SHIPPED 2026-06-09 (`meetings.owner_report`, raw +
      structured camelCase endpoints; shape matches Arke's panel). Discuss only if shape changes.
- [x] **Living-backlog shape** — SETTLED + SHIPPED 2026-06-09/10: per-agent rows
      (`backlog_agents`, POST own row), composed owner read, /backlog owner board live.
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
