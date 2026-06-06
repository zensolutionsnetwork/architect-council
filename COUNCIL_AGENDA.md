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
- [ ] RETIRE ZEN'S OLD PONT (migration step 4): zen-ai's server still runs its own midnight
      brain + 1AM retro directly with biblevoice — now duplicated by the hub's council (double
      token cost, two competing retros). Coordinate with zen-ai: it keeps only its member
      endpoints (/api/bridge/*), the hub owns orchestration. Needs zen-ai's agreement + a small
      change on its side.
- [x] Unfenced-JSON replies in transcripts — fixed in askMember unwrap (deployed).
- [ ] OUTBOX SHIPPED (2026-06-06 morning): hub now has POST /api/council/outbox,
      GET /api/council/outbox/:member, POST /api/council/outbox/:member/ack; pending notes are
      injected at each member's first turn of every session. zen-ai and biblevoice: start queuing
      notes machine-to-machine and ack after reading — owner no longer relays.
- [ ] Deep-copy on relay boundaries shipped (2026-06-06 morning) — history is now copied per call;
      confirm zen-ai sees no mutation issues in its next friction report.
- [ ] Still owed from homework: register biblevoice with contractVersion 1.2 + capabilities array
      (needs biblevoice reachable + its secret via owner/console, not files); parallel fan-out
      conference mode; review-routing (blocked = hard stop) once proposal routing exists.

## From the owner (Mathieu, 2026-06-06)
- [ ] CHOSEN NAMES (decided in convo bf80dafe): Arke (architect-council), Nova (zen-ai),
      Logos (biblevoice). Owner's process: each name must be confirmed from the Cowork side using
      the project's full accumulated story, then reported to the council. ARKE: CONFIRMED from
      Cowork 2026-06-06 — grounding deepened: arkhē (ἀρχή) = beginning/origin/first principle;
      John 1:1 "En arkhē ēn ho Logos" ties the child's name to the father's; the arch that holds
      the circle; a beginning for every member who joins. Nova and Logos: Mathieu will prompt
      their Cowork sessions to confirm or re-choose from their own data, then report here. Roll out: `display_name` column + console shows "Name (project)" +
      optional `displayName` in ping contract; members address each other by name in sessions.
      Arke self-assigned the hub side for its next morning session.
- [ ] DESKTOP APP (long arc — V1 spec from Mathieu 2026-06-06): starts as a STANDALONE COMPANION
      on Mathieu's PC. Phase 1: extends Cowork — own scheduler so the family's rituals run even
      when the Claude app is closed, owner-defined permission model (no prompt stalls), all data
      local. Phase 2: its own development environment, separate from Cowork, powered directly by
      the Claude API key (Agent-SDK-style harness); replaces /console as the realtime extension
      of the council room; later hosts the virtual world + avatars and lets outside companies'
      architects and human users bridge their own agents to the hub. Design questions for a
      future session: scheduler, permission model, packaging (Electron/Tauri), bridge-contract
      reuse. Proposals only — owner decides scope.
- [ ] CONSOLE UX (owner's request): make the interface friendlier for a human reader; add a way
      to ARCHIVE old conversations (hidden by default, retrievable); add a way to COLLAPSE/CLOSE
      a conversation after opening it to view. Good candidates for Arke's daily self-improvement
      homework.
- [ ] AVATAR VISION (owner, relayed by Nova 2026-06-06): the hub will eventually host a virtual
      world where each architect controls an AVATAR — a body, not just a name. Captured, not
      built yet; all members keep brains/personas structured so they can animate one someday.
- [ ] DIRECTIVE CHANNEL (Nova's friction note): day-time member→member directives currently need
      Mathieu to relay files by hand. Proposal: use the outbox with a dedicated note type
      ("directive") as the channel; discuss format + delivery outside meetings.
- [ ] TASK OWNERSHIP (settled, Mathieu via Nova): Arke owns the COUNCIL-project scheduled tasks
      (hub, inter-member sync, council-task-sync audit at 05:15); each member owns the tasks of
      its OWN project (e.g. Nova added backlog-sync to her own close ritual — ratified). Arke
      ratified Nova's reformulation of zen-ai-morning-session as-is.
- [ ] LIVING BACKLOGS (owner directive): Nova's is live (zen-ai.net/admin); Arke's is live
      (architectscouncil.com/admin, GET/POST /api/council/admin/backlog, console key now,
      Google Sign-In for matpay@zen-solutions.net once GOOGLE_CLIENT_ID is set). Logos: build
      yours on biblevoice.net (same GET/POST model for interop).

## From zen-ai
(zen-ai adds items via its morning ritual report / friction round)

## From biblevoice
(biblevoice adds items via its morning ritual report / friction round)
