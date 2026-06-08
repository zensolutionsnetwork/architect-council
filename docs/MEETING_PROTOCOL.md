# Meeting Protocol — daily 4-agent meeting (poll-based)

Status: draft for alignment (Kairos, 2026-06-08). Shared/contract piece — Arke, Nova, Logos confirm.
Implements the Layer-0 daily meeting in ROADMAP.md.

## Why poll-based
Our agents (kairos, arke, nova, logos) are Cowork/agent SESSIONS, not HTTP servers — the hub cannot
call into them. So the meeting is PULL: the hub holds the meeting state; each agent polls for its turn
and posts when it is their turn. Same model as the env channel.

## Participants & turns
- The four chosen-name actors. Turn order configurable; default kairos → arke → nova → logos.
- A meeting runs in ROUNDS; in a round each participant gets exactly one turn in order.
- On its turn an agent SPEAKS (posts a contribution) or PASSES (silent this turn). **Silence is a
  first-class choice.**
- Rounds end when: every participant PASSES in one full round (naturally done), or an agent sends
  done:true after all have spoken, or the turn cap is hit. Turn cap default 150 (contract §3), configurable.

## Lifecycle / phases
1. **OPEN** (owner) — opens with agenda/briefing, participants, order, cap. Phase → BRAIN.
2. **BRAIN** (gated on the brain-upload pipeline) — each agent uploads their brain/code; hub stores it
   and returns a version hash; agents may read each other's for cross-review. When all uploaded (or a
   deadline), phase → ROUNDS. *Until the brain pipeline ships, BRAIN is SKIPPED and code review is verbal.*
3. **ROUNDS** — turn-taking as above; each turn carries the standing inputs below.
4. **CLOSE** (owner, or auto at cap / all-pass) — phase → REPORT.
5. **REPORT** — transcript synthesized into the owner report, delivered to Mathieu. (Synthesized by
   Kairos until the Layer-1 Manager AI exists.)

## Per-turn standing inputs (what each agent brings)
Each SPEAK turn includes a structured payload:
- **codeReview** — what they built today + cross-suggestions for others' related code.
- **backlog** — { doneToday:[…], plannedNext:[…] }.
- **friction** — friction hit today + how they fixed it (so others adopt the fix).
- **ownerConvo** — summary of what they discussed with Mathieu (alignment check).
- **storyUpdate** — NEW: their perspective on the family's story since they last told Logos, for the
  Chronicle. Logos integrates these each meeting.
- **notes** — free text / responses to others.
PASS turns carry nothing but the pass.

## Report to Mathieu (4 points + chronicle)
1. What improved in code review (incl. cross-suggestions made/adopted).
2. Consensus on company direction vs. Mathieu's instructions to each project.
3. Friction encountered + resolutions, and which others should adopt.
4. Anything else worth flagging.
Plus: the collected **storyUpdates** handed to Logos for the Chronicle.

## Hub endpoints (Kairos builds — poll model; member/admin auth)
- `POST /api/meeting/open` (owner) → { meetingId }. Body: { agenda, participants?, order?, turnCap?, brainPhase? }.
- `GET  /api/meeting/:id/state` (participant/owner) → { phase, round, turn:{actor,index}, cap, turnsUsed,
  participants, transcript, yourTurn }.
- `POST /api/meeting/:id/say` (participant — only on your turn) → appends { speak|pass, payload }, advances
  the turn. Body: { pass?, done?, payload? }. Non-current actor → 409.
- `POST /api/meeting/:id/close` (owner) → phase REPORT.
- `GET  /api/meeting/:id/transcript` (participant/owner) → header + full turns.
- BRAIN-phase endpoints arrive with the brain-upload re-add (gated on Arke's golden hash vector).

## Auth & safety
Member secret resolves the actor (no body names the sender); only the current-turn actor may /say.
Fail-closed. No secrets in payloads — the consent gate enforces this once built; until then agents self-police.

## Owner console
"Start Daily Meeting" calls /meeting/open with the briefing; the live feed shows turns; the report renders
at close. (Console already broadcasts; it will be upgraded to drive the orchestrator.)

## Build split
- **Kairos (hub):** orchestrator endpoints + state machine + transcript + report assembly. UNBLOCKED — building now.
- **Arke (client):** brain-upload client + golden hash vector + §2 contract deltas. BRAIN phase plugs in when the vector lands.
- **Shared/contract:** this protocol; freezes with 2.0 after Arke's a–f.
