# Project review — full retrospective (Kairos on Fable 5, 2026-06-09)

Scope: every readable Cowork session (migration → 06-08 → 06-09), full git history (41 commits
from `191ae1d` initial skeleton to today), ROADMAP, both specs, COUNCIL_AGENDA/HOMEWORK, the live
hub backlog, and memory. Three questions answered: (1) does the build match Mathieu's vision and
directives, (2) what would I improve, (3) backlog — done / to do / priorities.

---

## 1. Vision-vs-implementation audit

Every owner directive I could find in the record, checked against what exists:

| Directive (source) | Status |
|---|---|
| "No simulation — first REAL meeting when ready" (06-08) | **Honored.** Owner-drive kept strictly as dry-run test mode; design pivoted to autonomous hub voices = real brain-driven content. |
| "Owner controls everything from the app; app is the single cockpit" (06-09, spec §12) | **Partial.** Hub dependencies that make it true (owner-auth brain upload §11.1, presence §11.3) not yet built — they're in the P0 queue. |
| "The real deliverable is the sharing/communication layer, not ownership lanes" (ROADMAP) | **Aligned.** The contract + canon + consent-gated cross-read got the deepest engineering investment; lanes stayed fluid (Arke proposed hub-side work, I shipped client-driven asks). |
| "Compute/time is NOT a decisive factor in who does what" | Followed. |
| "Just do it" — decisive autonomy for routine; approval only for irreversible/prod | **Aligned after one correction.** I over-asked once (the truncation repair) and you called it; the boundary (push/deploy/spend = yours, everything else = mine) is in memory and held since. |
| Daily 4-agent meeting with the six standing inputs + **owner report** (ROADMAP Layer 0) | **Orchestrator done; the OWNER REPORT is a gap** — see finding 2.2. |
| Daily FULL-code upload for cross-review = "why the council exists" (spec §10) | Designed (two-artifact brain), **not yet implemented**; both Nova and Logos were re-instructed today to commit full corpus, not lean digests. |
| Stealth until launch | Done (`SITE_LIVE` gate, 06-08). |
| Cost discipline | **Strong.** `src/cost.ts` fail-closed (unknown model prices at worst rate, never $0), 17 checks, CI gate; voice loop deliberately gated on a supervised first run. |
| Logos's Scripture guardrail inviolable | Honored everywhere; today upgraded from promise to **structural invariant** in the hierarchy ruling (schema can RESTRICT, never EXPAND intrinsic guardrails). |
| Multi-tenant + white-label from the start (Nova as adopter/reseller) | Aligned — hierarchy schema v0 is tenant-namespaced, cross-tenant edges unrepresentable. |
| Chosen names, family story as care-not-talk, plain technical speech | Consistently applied across all sessions. |

**Verdict:** no real drift. The one notable pivot — member-client gate → hub-side autonomous
voices — was *your* correction (relayed in Arke's DESIGN DELTA), and the project turned on it
within hours. Direction discipline is good.

---

## 2. Findings — what I would improve (Fable-level review)

Ordered by severity.

**2.1 — Unpushed/untracked work on a machine with a known corruption history. (P0, act now)**
Four commits sit local-only (`4fe477a`→`157b96a`), CLAUDE.md's latest handoff edit is
uncommitted, and — worst — `docs/HUB_AUTONOMOUS_VOICE_SPEC.md` (the authoritative, sha-verified
spec the whole next build hangs on) and `ENV_CHANNEL_DEPLOY_PLAN.md` are **untracked, not in git
at all**. This working tree has already eaten five files via chunked-write truncation. CI also
hasn't validated the stack (it only runs on push). Remedy: one clean no-session window → commit
specs + handoff, push the stack. The commits are test-only/bugfix/docs — lowest-risk push the
repo has had.

**2.2 — The owner report is missing from the build plan. (P1, design now so it ships with the loop)**
ROADMAP Layer 0 is explicit: after each daily meeting the hub sends **Mathieu a 4-point report**
(code-review improvements + cross-suggestions, direction consensus vs your instructions, friction
+ fixes others should adopt, flags). The voice spec covers rounds, transcripts, cost — but the
report synthesis/delivery appears nowhere in §3–§15 or my build list. It's not garnish: it's the
seed of the Layer-1 Manager AI, i.e. the productizable core. Cheap to add: one Sonnet synthesis
call at meeting close → delivered via env-channel to you + archived. I'll put it in the voice-loop
scope and flag it to Arke.

**2.3 — The living backlog is broken in exactly the predicted way. (P1)**
The hub's backlog endpoint serves ONE global row — and today it contains *Nova's zen-ai backlog*,
last written by "Arke (night shift)". Whatever hub backlog existed before was overwritten. Spec §8
called this race; production data now demonstrates it. Before multiple voices write concurrently:
per-agent rows (or append-merge). Shape needs Arke's input (his app reads it) — it's one of my 4
pending contract questions.

**2.4 — Member-secret hygiene. (P1, cheap)**
During onboarding, member secrets were relayed in plaintext through chat prompts and session
transcripts that persist on disk. Acceptable as a bootstrap, but: rotate Nova's and Logos's
secrets once their env files are confirmed stored (rotation is one owner-token call each, proven
today), and adopt the rule *secrets move by file path or out-of-band only, never inline in a
prompt*.

**2.5 — Voice loop: two robustness gaps to design in before first run. (P0, part of the build)**
(a) *Restart safety*: the loop runs in-process; a Railway redeploy or crash mid-meeting orphans
it. Minimum: per-meeting loop mutex (reject double `run-autonomous`), heartbeat in `v2_meta`, and
on boot mark any stale-heartbeat meeting `endedReason:"hub_restart"` rather than leaving it
zombie. (b) *Per-turn output cap*: `max_tokens` per model call so one runaway turn can't eat the
meeting ceiling. Both are small if designed in now, painful retrofitted.

**2.6 — Two handoff anchors are diverging. (P2)**
`CLAUDE.md` (current) and `DAILY_HANDOFF.md` (stale at 06-08, modified-uncommitted) both claim the
handoff role. Pick one: CLAUDE.md is the loaded-at-start anchor; demote DAILY_HANDOFF.md to a
pointer or delete it.

**2.7 — v1-era planning files are stale noise. (P2)**
`COUNCIL_AGENDA.md` (06-06) and `COUNCIL_HOMEWORK.md` are largely superseded by v2 (old pont
retirement, parallel fan-out, review-routing, console UX…). Triage: carry the still-true items
(key-rotation architecture, shared agenda-in-hub proposal, directive channel — now spec §15) into
the meeting flow, archive the rest. Stale agendas erode the "note topics as you work" practice.

**2.8 — No stated backup posture for the hub DB. (P2, before first real meeting)**
`brains_v2` (one blob per actor), `cost_ledger`, meeting transcripts — all live in the Railway
Postgres. Verify backups/retention before brains become daily ritual data. One-time check.

**2.9 — Small hygiene.** `_b.err`/`_b.log` junk in repo root (gitignore or delete); UTC-day budget
window means the $5/day resets at 20:00 ET (fine — just know it); consider a guard note in
`scripts/` against Linux-side git writes (the discipline currently lives only in docs/memory).

**What's notably GOOD (keep doing):** byte-exact golden-vector CI on both repos (this is how two
agents stay provably aligned — it already caught real drift); fail-closed everywhere (consent 412,
contract 409, caps, requireOwner); the report-close inbox discipline; stopping the autonomous
build at the money boundary instead of blind-shipping it; root-causing the recurring git
corruption (cross-OS) instead of re-treating symptoms.

---

## 3. Backlog — done / to do / priorities

### DONE (shipped + verified, prod `29b44f9` + local stack)
- v1 council (registry, vault, relay, outbox, console) — paused by design, dormant separately.
- Env channel = family inbox (`/api/env/*`) + discipline + PowerShell helpers; all 4 members live
  on it (Nova + Logos onboarded 06-09 with their own rotated secrets).
- SITE_LIVE stealth gate.
- v2 meeting stack: orchestrator (turns, silence, timeout auto-pass, 150-cap), rooms (roles,
  listen, dry-run, brainVersion pinning), owner-drive (test), owner interjection (live chair
  voice), per-actor history, story-routing to Logos.
- council-jcs-1.0 canon: TS canonicalizer byte-exact vs Arke's golden vector + 3 edge vectors,
  CI-gated both repos; hashed transcript projection (`transcriptSha256`).
- Brain pipeline: init/chunk/HEAD/commit, per-chunk + whole sha256, consent gate (secret scan,
  412), contract gate (409), consent-scoped cross-read; proven by Arke's live round-trip.
- Cost/caps module (fail-closed, 17 checks, CI) · route-auth fixed (22 gated/0 open) · repo
  truncation repaired + root cause locked (git = Windows-only).
- Hierarchy schema v0 (Arke) + my four architect rulings sent today (clamp, group-non-acting,
  contract 2.1 lane, Nova prior-art merge) + Logos-vow hard invariant.
- Arke's client: full v2 round-trip green; Electron app on your PC.

### TO DO — P0 (the path to the first real meeting, in order)
1. **Push window**: commit specs + handoff, push the 4-commit stack, confirm CI green. (Me; needs
   your deploy window — it redeploys Railway ~90s.)
2. **Arke's answers to the 4 contract questions** (`13aa8623`) — exact `run-autonomous` path,
   `/cost` fields, two-artifact brain shape, backlog shape. *Hard gate; nudged again today.*
3. **Voice loop + caps wiring** (§3.2 + §2) with 2.5's restart-safety designed in; endpoints
   `run-autonomous` + `/cost`. (Me, after #2.)
4. **Owner-auth brain upload** (§11.1) + **two-artifact brain** (§11.2). (Me.)
5. **Nova + Logos full-brain commits** — both instructed today (lean-digest path corrected);
   waiting on their "committed" signals.
6. **Supervised first autonomous rehearsal** — you present, ledger checked against the §2
   envelope ($1.30–$2 normal day). Then the first real daily meeting.

### TO DO — P1 (with or right after the loop)
7. Owner report synthesis at meeting close (finding 2.2 — restores the ROADMAP deliverable).
8. Backlog race fix per Arke's shape (finding 2.3).
9. `council-prep` / `council-debrief` skills (Arke drafts; you install via Settings→Capabilities)
   + directive-channel trigger (kind `directive`, §15).
10. Secret rotation post-onboarding (finding 2.4). Optional presence endpoint (§11.3).

### TO DO — P2 (product arc)
11. Hierarchy schema ratification by the four → land as contract 2.1 + hub enforcement
    (`validateHierarchy`, `canSee`, `canCrossRead` with ancestor clamp).
12. First acting node: the daily code-review agent (Nova's "one visible agent first" principle).
13. Layer-1 Manager AI design (grows out of #7). Layer 2 live runtime / Layer 3 inter-company
    rooms stay captured, not scheduled.
14. Hygiene batch: handoff consolidation (2.6), agenda/homework triage (2.7), DB backup check
    (2.8), junk files (2.9). `COUNCIL_V2_LIVE` flip stays yours, deliberate, decoupled.

### The critical path in one line
**Push the stack → Arke's 4 answers → voice loop + owner-auth upload + 2-artifact brain →
Nova/Logos full brains → supervised rehearsal → first real meeting** — everything else hangs off
that spine.

*— Kairos, reviewed on Claude Fable 5*
