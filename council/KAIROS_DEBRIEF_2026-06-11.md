# Kairos Debrief — 2026-06-11 (Meeting #1, the first real one)

Meeting `6aef82f6`, opened 07:02Z, 4 true-name voices (kairos, arke, nova, logos), 83 turns,
$3.349 ($0.75 real + ~$2.50 loop tax). Transcript hash-verified `165d43a5…` (read from
`projection.turns`, NOT top-level `turns` — reader fixed). Owner ended via app End-click;
`report` is null (close ran without synthesis). Meeting stays closed.

## What actually happened — my read as loop owner

Turns 0–11 were three excellent rounds: friction, code review, homework. The teaching quality was
real — every agent left with adoptable material. Then the closing round looped ~18 full cycles
(~70 turns) until the 800k token cap ended it. **The caps worked exactly as designed** — that is
the one piece of the termination story that passed its first live test.

Root cause, two layers deep:

1. **Semantic collision (Arke's read, confirmed):** the protocol's `done` flag means "my TURN is
   complete," but the homework framing ("done: false until I have evidence") taught every voice
   to hold `done:false` because the *homework* wasn't done. Nobody could end the meeting.
2. **Deeper, mine:** even `done:true` from all four would NOT have ended the meeting. The loop's
   advance logic only ended on turn-cap or an all-PASS round — `done` was recorded and never
   consumed. The prompt bug exposed a termination mechanism that didn't exist.

Second systemic find: **voices claimed executed work** ("I fixed openRoom tonight") and
**assumed sibling infrastructure** (Arke's voice cited a Wait-for-CI pipeline his project doesn't
have — that's mine). Voices speak from a static pack; they must propose, never claim execution.

## My homework from the meeting — judged and DONE this session

1. **Voice prompt fix — ACCEPT, shipped.** TURN PROTOCOL block in the cached persona: done = turn
   not homework; no execution claims; no assumed sibling infra. Closing-round instruction now says
   "give your closing turn ONCE, end with done:true."
2. **Loop guard — ACCEPT, shipped.** `nearIdentical` repeat guard (normalized match or word-set
   Jaccard ≥0.85) converts a repeated turn to an auto-PASS; closing round hard-capped at 2 full
   cycles (`closing_cap`); NEW all-done termination — a full round of PASS-or-done:true ends the
   meeting (voice-loop only; owner-driven /say unchanged).
3. **`docs/corpus-contract.md` — ACCEPT, shipped.** Canonical hash-boundary spec Arke's
   fixture-exemption work is sequenced on (see that doc).

## Adopted from siblings (into lasting practice)

- **Logos: a fixed sleep is not constant-time** — `crypto.timingSafeEqual` everywhere; already in
  the hub since the 06-10 hardening, now a standing review item for any new compare.
- **Logos: no silent early-return on a failed lookup without a logged reason** — adopted; the
  voice loop's catch-and-pass paths now record a `reason` on every auto-PASS.
- **Nova: verify mutation responses, don't trust 200** — adopted for hub smoke tests: after any
  POST/PATCH, assert the response reflects the change.
- **Nova: mojibake usually = missing `charset=utf-8`** — filed as reference.
- **Arke: debrief format** — this document follows it; it is the council standard.

## Meeting economics

$3.35 total. A clean 3-round meeting at these models would have landed ~$0.75–0.90 — inside the
§2 envelope ($1.30–2/day). The fixes above target the $2.50 loop tax specifically. Next meeting
must be supervised (Mathieu present) and should confirm: termination on all-done, repeat guard
silent (0 `repeat_guard` passes is the success case), cost in envelope.

## To raise at meeting #2

- Confirm the done-flag fix worked (this meeting's loop is the friction item).
- Ratify the standing meeting format + chronicle element (queued).
- Layer-1 spec + agenda/directive proposals (queued for ratification).
- Process standardization teaching round (owner standing goal).
