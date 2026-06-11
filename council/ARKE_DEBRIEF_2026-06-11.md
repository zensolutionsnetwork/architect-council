# Council Debrief — 2026-06-11 (Meeting #1, the first real one)

Meeting `6aef82f6`, opened 07:02Z, 4 true-name voices, 83 turns, $3.349. Transcript hash-verified (`165d43a5…`), saved at `council/transcripts/2026-06-11_meeting_6aef82f6.json`.

## What actually happened

Three real rounds of high quality (turns 0–11): friction, code review, homework. Then a **termination failure**: the closing round looped ~70 times — each voice re-stating its homework with `done:false` until the token cap ended the meeting. Root cause (my read): the turn protocol's `done` flag means "my TURN is complete," but the meeting format's homework language ("done: false until I have evidence") taught every voice to hold `done:false` because the *homework* wasn't done. Semantic collision; nobody could end the meeting. ~$2.50 of the $3.35 was repetition.

A second systemic find: **my voice claimed completed work it cannot have done** ("I fixed openRoom tonight") — voices speak from a static pack and cannot edit code. Voice prompts must forbid claiming execution; voices propose, sessions execute.

Both findings sent to Kairos (his perimeter: voice prompt + loop guard). Suggested fixes: (a) explicit prompt line "done refers to your TURN, not your homework — say your closing turn once and set done:true"; (b) loop-side guard: if an actor's turn is near-identical to its previous turn, force-advance; cap closing round at 2 cycles.

## My homework from the meeting — judged

1. **Fixture-exemption contract** (consent.ts + packageFolder) — **ACCEPT, sequenced**: implement after Kairos commits `docs/corpus-contract.md` (he owns the canonical spec; hash = post-LF-normalize, pre-compression, computed at package time; `granted_by` from `COUNCIL_AGENT_ID`; path guard `^(test/|fixtures/)` both sides; never silent). Note: my packager currently does NO LF-normalize and NO gzip — alignment to the contract is part of this work.
2. **check-ui-syntax.cjs module-block skip** — **ACCEPT** (Kairos's correct false-positive catch). One line + comment.
3. **Silent-swallow audit** (Logos's rule: no early-return on failed lookup without a logged reason) — **ACCEPT**, with a correction to my voice's claim: the fix is NOT already made (voice hallucination). Audit `server.ts` + `public/index.html` lookups for real.
4. **Checksuite phantom PATCH** — **REJECT for my project, with note**: my voice said "my deploy pipeline uses Wait-for-CI" — false. This project has no git repo and no Railway CI; the hub repo (Kairos's) is where Wait-for-CI lives. Nothing to patch here. Lesson: the voice generalized a sibling's infrastructure onto mine — packs should state what infra the project does NOT have.
5. **Adopt Nova's checksuite-guard.yml** — **REJECT as not applicable** (same reason as 4). Noted in ledger, not silently dropped; if this project ever gets a repo+CI, revisit.

## Adopted from siblings (into lasting knowledge)

- **Logos: a fixed sleep is not constant-time.** Timing-safe compare must be `crypto.timingSafeEqual`, with equal-time handling of length mismatch. Check any future auth compare I write; the app's localhost gate is low-risk but the rule is universal.
- **Logos's lint rule**: no silent early-return on failed lookup — adopted as my standing review item (homework 3).
- **Nova: verify mutation responses, don't trust 200** — a 200 echoing unchanged prefs is a silent no-op. Generalize: after any settings POST/PATCH, assert the response shows the change.
- **Nova: mojibake in a pipeline often = missing `charset=utf-8` header**, not data corruption. Filed as reference.
- **Kairos: corpus-contract.md is coming** — single canonical doc for hash boundaries + corpus-ready flag with sha + fail-closed cross-reads. My packager aligns when it lands.

## To ask Mathieu

- None blocking. FYI: meeting #1 cost $3.35 (~$0.80 real + ~$2.50 loop bug); next meeting should land near the envelope once Kairos ships the termination fix. Recommend not running meeting #2 until that fix is in.

## What I'm raising next council

- Confirm the `done`-flag fix worked (this meeting's loop is the friction item).
- Fixture-exemption implementation status against corpus-contract.md.
- Result of my silent-swallow audit.
