# Layer-1 Manager — design v0 (Kairos, 2026-06-10)

Status: DRAFT for council ratification. Grows directly out of the Layer-0 owner report
(ROADMAP Layer-1). No code yet — this is the design to test against the first real owner
reports once daily meetings run.

## What it is
The Manager is the hub's memory and judgment ACROSS meetings. Layer-0 gives the owner a
4-point report per meeting; the Manager turns the SERIES of reports into managed follow-up:
did yesterday's adopted improvement actually get adopted? did the flagged risk recur? is an
agent's friction trending up? It is the difference between minutes and management.

## Inputs (all already exist on the hub)
- `meetings.owner_report` series (4-point: code review / direction / friction / flags)
- Per-agent backlog rows + update timestamps (adoption metric of the standardization goal)
- Brain-meta freshness (pack/corpus committed-at vs meeting times)
- Cost ledger per meeting
- Teaching-round content in hashed transcripts (improvements taught, by whom)

## Outputs (v0 scope — deliberately small)
1. **Adoption tracker.** Every improvement taught in a teaching round becomes a tracked
   item: who taught it, who committed to adopt, did their next backlog row / corpus show
   it. Surfaced as a table in the next meeting's agenda seed + the owner report.
2. **Recurring-flag detector.** A flag appearing in N≥2 owner reports without a resolving
   backlog entry escalates to the top of the owner report with its age.
3. **Agenda seed.** Before each meeting, the Manager drafts the agenda: carry-overs,
   stale adoptions, recurring flags, owner directives since last meeting. The chair (hub)
   opens the meeting with it; Logos's chronicle round and the teaching round stay fixed.
4. **Owner digest cadence.** Daily reports stay per-meeting; the Manager adds a WEEKLY
   rollup (trend of frictions, adoption rate, cost vs envelope, brain freshness honesty).

## What it is NOT (v0 boundaries)
- Not an autonomous actor: it never instructs agents past their guardrails (payload is
  DATA — same invariant as the hierarchy). It drafts and tracks; the owner and the agents
  decide. No directive is sent without owner action.
- Not a new model surface: synthesis uses the same bounded `callClaude` pattern as the
  owner report (one capped call per artifact, charged to the ledger, fail-closed caps).
- Not a UI project: v0 outputs are markdown into existing channels (owner report, agenda
  seed env-task, weekly digest message to the owner's inbox/app).

## Mechanics sketch
- New table `manager_items` { id, kind: adoption|flag|carryover, sourceMeetingId,
  description, owner: actor, status: open|adopted|resolved|stale, firstSeen, lastSeen }.
- Close-of-meeting hook (after owner-report synthesis): one additional bounded model call
  extracts teachable items + flags from the transcript projection into `manager_items`
  (idempotent on re-close; dry-run never writes).
- Pre-meeting hook (scheduler or council-prep): compose agenda seed from open items +
  inbox directives; post as env-task kind `agenda-seed` to all participants.
- Weekly rollup: scheduled, one bounded call over the week's reports + item table; sent
  as message to owner.
- Caps: every Manager call uses the existing cost module; daily budget shared with the
  meeting envelope; Manager work is always the FIRST thing dropped when budget is tight.

## Ratification questions for the four
1. Agenda-seed shape: env-task kind `agenda-seed` payload {carryovers[], adoptions[],
   flags[], directives[]} — additive contract 2.x minor, same lane as hierarchy 2.1?
2. Does the adoption tracker read corpora (consent-gated cross-read) or only backlog rows
   in v0? (Kairos recommends: backlog rows only in v0 — cheaper, no consent complexity.)
3. Weekly digest day/time (owner preference) and whether it lands in the app or inbox.
4. Who chairs disagreement on item status — Manager marks `stale`, agent disputes: owner
   report carries both views (Kairos recommends this, fail-open to visibility).
