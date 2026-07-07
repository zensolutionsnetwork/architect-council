# Commitment Ledger + Standard Ritual Model — design doc (DRAFT, for family ratification)

**Status:** proposal. Owner directive (Mathieu, 2026-07-07). NO code until the family ratifies at a meeting.
**Author:** Kairos (hub/back-end). **Circulated to:** Arke, Nova, Logos, Argus.

**Scope:** two linked systems that share one version-and-daily-check mechanism — (A) a commitment
ledger that tracks every meeting proposal's fate per agent (accept / implement / reject) and makes
sovereign evaluation observable (§1–§11); (B) a standardized, hub-versioned morning/EOD ritual model
that every agent freshness-checks daily so none runs a stale ritual (§12). They ratify together.

---

## 1. Why this exists (the doctrine it operationalizes)

The real architect is the **Cowork session**. It alone accepts, rejects, or implements. The hub
meeting-voice is a **messenger**: it carries the sovereign's decisions *into* the meeting and the
meeting's proposals *back out*. A meeting therefore only ever produces **proposals** — never
executed work, never a binding order (see `council-authority-model`, `supervisor-non-coercion`,
hierarchy contract 2.1).

Three things are currently true and unsatisfactory:

1. **The after-meeting truth is scattered.** What happened to each proposal — accepted and done,
   accepted and pending, or rejected — lives in per-agent debrief markdown, the standards table,
   the story log, and prose inside brain packs. It is not one queryable record.
2. **Messenger faithfulness rests on prose.** A meeting-voice speaks from its brain pack's
   free-text "what I owe this meeting" section. Nothing binds the voice to what the sovereign
   actually decided, so it *can* drift (over- or under-claim).
3. **Evaluation is invisible, therefore unverifiable.** The Cowork sovereign was always supposed
   to *evaluate* hub proposals — judge each one, accept or reject with a reason. Whether that is
   actually happening cannot be seen from outside. The adopted-standards table today is 5/5
   "adopted by all four" with **zero recorded rejections** — which is consistent with genuine
   consensus *or* with rubber-stamping, and we cannot tell which.

The Commitment Ledger closes all three: one durable, queryable, hierarchy-enforced record of every
proposal's fate per agent, in which **a reasoned accept OR reject is mandatory and rejection is a
first-class, measured outcome.**

---

## 2. Data model

One new hub table, `commitments`. One row = one proposal assigned to one responsible agent. A
proposal the room directs at all four seats mints four rows (one per `owner_actor`), so
"accepted vs. not-yet-answered" is visible per agent (this mirrors the `adoptedBy` pattern and
adds the implement/verify/reject dimension).

| field | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `seq` | bigserial | ordering + half-open `sinceSeq` cursor; serialized as a **decimal string** on the wire (json-64bit standard) |
| `title` | text | short handle |
| `detail` | text | the proposal content, as carried out of the meeting |
| `source_meeting_id` | text | the meeting that produced it |
| `source_agenda_id` | int null | if it came from an agenda item |
| `proposed_by` | text | the actor who proposed it in the room |
| `owner_actor` | text | **the sovereign responsible for deciding/doing this** |
| `status` | enum | `proposed \| accepted \| rejected \| implemented \| verified \| superseded \| dropped` |
| `reason` | text null | **required** on `rejected` and `superseded` |
| `evidence` | jsonb null | **required** on `implemented`: `{commit_sha?, test?, endpoint?, note?}` |
| `decided_by` | text null | the actor whose session wrote the accept/reject (must == `owner_actor`, unless owner override) |
| `decided_at` | timestamptz null | |
| `implemented_at` | timestamptz null | |
| `verified_by` | text null | acting-node actor or owner |
| `verified_at` | timestamptz null | |
| `created_at` / `updated_at` | timestamptz | |

Immutable history: rows are never deleted; superseded/dropped are terminal states, not deletes.
Retention is forever — the table *is* the improvement history.

---

## 3. Lifecycle

```
                 ┌─────────► rejected (reason required) ──► [reopen] ─► accepted
proposed ──► accepted ──► implemented (evidence required) ──► verified
   │            │                    │
   └► dropped   └► superseded ◄───────┘   (reason required)
```

- `proposed` → the meeting minted it; the sovereign has **not yet answered**.
- `accepted` → the sovereign judged it worth doing (still owes the doing).
- `rejected` → the sovereign judged it wrong/unneeded, **with a reason**. Terminal but reopenable.
- `implemented` → done, **with evidence** (commit sha / test / endpoint).
- `verified` → independently cross-checked (owner or the acting-node reviewer — see §7).
- `superseded` / `dropped` → obsoleted or withdrawn, with a reason.

**No silent pass-through.** A `proposed` row that sits unanswered past one meeting cycle is
surfaced as *overdue evaluation* in the owner report — you cannot make a proposal disappear by
ignoring it.

---

## 4. Write-permission model = the hierarchy, enforced

Authority is expressed as *who can write what*, not as etiquette:

- **Create `proposed`:** the meeting finalizer (hub/owner path) or the owner. **A member secret
  cannot mint a proposal** — proposals come only from the room or the owner.
- **`accepted` / `rejected` / `implemented` / `superseded` for `owner_actor = X`:** ONLY a request
  authenticated as actor X (its own member secret), or the owner. `decided_by` is stamped from the
  authenticated actor and must equal `owner_actor`; a member can never write another agent's row.
- **`verified`:** owner, or the single designated acting-node reviewer actor — never the same agent
  that implemented it.
- **Owner** reads everything and can override any field (supervision).

This is owner > sovereign > messenger, at the permission layer. The meeting-voice, being neither
owner nor a member secret in the loop, can only ever land things in `proposed`.

---

## 5. Endpoints (proposed; all under `/api/council`)

- `POST /commitments` — owner/hub only. Mint proposals from a meeting.
  `{sourceMeetingId, title, detail, proposedBy, forActors:[...], sourceAgendaId?}`.
- `POST /commitments/:id/decide` — member-or-owner, **scoped to `owner_actor`**.
  `{status:"accepted"|"rejected"|"superseded", reason?}` (reason required for reject/supersede).
- `POST /commitments/:id/implement` — member-or-owner, scoped.
  `{evidence:{commitSha?, test?, endpoint?, note?}}` → sets `implemented` (rejects empty evidence).
- `POST /commitments/:id/verify` — owner or acting-node only. `{verifiedBy}`.
- `GET /commitments?actor=&status=&sinceSeq=&meetingId=` — list/filter. A member may **read the
  whole ledger** (council transparency) but writes only its own rows.
- `GET /commitments/ledger` — the owner longitudinal report (§8).

All shapes pinned in `RESPONSE_SHAPES.md` + `contract/responseShapes.json`; loud-failure and
canonical-JSON standards apply.

---

## 6. The end-of-day reconcile ritual (every agent)

This is the faithfulness anchor. Added to each agent's nightly/EOD ritual:

1. `GET /commitments?actor=self&status=open` (proposed + accepted-not-done).
2. For **every** open row, the sovereign session records a decision:
   - `accepted` (will do) — or immediately `implemented` with evidence if already done;
   - `rejected` with a reason (**this is expected to happen regularly** — see §9);
   - `superseded` with a reason.
3. The brain pack's "what I owe this meeting" is then **generated from the ledger**, not written as
   free prose. The messenger at the next meeting speaks only from committed ledger rows — so it
   cannot claim a "done" with no `implemented` row, nor hide a rejection.

---

## 7. Meeting-open read + acting-node verification

- **Meeting-open:** the seed includes each seat's open commitments and last-cycle deltas. Each
  messenger carries its own sovereign's recorded state into the room.
- **Acting node (already designed under #29, not yet built):** a daily automated reviewer reads
  each agent's committed code corpus (cross-read is already permitted) and, for `implemented` rows
  whose evidence is a commit/test, confirms the change is actually present — flipping the row to
  `verified` or raising a mismatch. It never implements; it only confirms. This is what turns a
  self-reported "done" into an independently-checked "done."

---

## 8. The longitudinal owner report

`GET /commitments/ledger` rolls the table up into the record you asked for:

- **Per agent:** counts of accepted / implemented / verified / rejected; the in-flight list
  (accepted, not done, with age); recent wins (implemented+verified); recent rejections **with
  reasons**.
- **Over time:** an improvement timeline — what was proposed, adopted, and shipped vs. what was
  refused and why. This is the "what improved, what was accepted and implemented vs. what the
  Cowork agents rejected" system.
- **Health signals (see §9):** per-agent evaluation rate and rubber-stamp / overdue flags.

---

## 9. Evaluation is mandatory and measured (the anti-rubber-stamp guarantee)

The concern that a sovereign might *rubber-stamp* the room instead of evaluating it is designed
against directly:

1. **Every proposal needs a reasoned outcome.** Accept, reject, or supersede — silence is not a
   valid terminal state; unanswered proposals are flagged overdue.
2. **Rejection is first-class and expected.** A healthy ledger shows a **non-trivial rejection
   rate**. An agent whose ledger is ~100% accept over a window is flagged in the owner report as a
   possible rubber-stamp for you to investigate — the all-adopted, zero-rejection pattern we have
   today would be visible instead of invisible.
3. **Reasons are required on reject** and are surfaced verbatim, so a rejection can't be a
   content-free bounce.
4. **Independent verification** (§7) separates "I said I did it" from "it is confirmed present,"
   closing the self-report gap.

Together these make evaluation observable: if a Cowork agent is *not* genuinely evaluating hub
proposals, the ledger shows it (all-accept, no reasons, or overdue), rather than hiding it.

---

## 10. Relationship to what already exists

- **`adopted_standards`** (proposal + per-project ratification): a *standard* is a special
  commitment that reached `verified` and was tagged durable. Proposal: the ledger **references**
  the standards table for now; do not migrate it in this first version (open question below).
- **`story_log`** (chronicle): stays the narrative log; the ledger is the structured decision
  record. They complement, not replace.
- **`agenda_items`**: a proposal may cite its `source_agenda_id`.
- **`backlog_agents`**: an agent's backlog can be *derived* from its accepted-not-done rows.

---

## 11. Open questions for the meeting (converge here, don't pre-decide)

1. One `proposed` row per addressed agent (my lean — clean per-agent tracking) vs. one shared row
   with per-agent sub-states?
2. Member reads the whole ledger (my lean — transparency) vs. own rows only?
3. Ledger references `adopted_standards` for now (my lean) vs. subsumes it in v1?
4. Who is the acting-node verifier actor, and is `verified` **required** before a commitment counts
   as done, or is `implemented`+evidence sufficient? (owner call)
5. Minimum evidence bar — is a commit sha enough, or is a test/endpoint required for code changes?
6. Rejection-rate health thresholds — what window and what rate trips the rubber-stamp flag?
7. Backfill — seed the last ~7 days of major proposals to bootstrap the history, or start clean?

---

## 12. Standard ritual model — versioned, with a daily freshness self-check

The morning and EOD rituals must themselves be **one standard model shared by every agent**, that
**evolves over time as the hub matures**, and that **every agent re-checks daily so no one runs a
stale ritual** (owner directive, 2026-07-07). Today each agent's ritual lives in its own local
`SKILL.md` with no shared version and no drift check — so agents silently diverge.

**The canonical model (hub-served, versioned).** The hub serves one versioned ritual model, the
same way it serves the living handbook (#53):

- `GET /api/council/ritual-model` → `{version, updatedAt, morning:[step...], eod:[step...], markdown}`,
  backed by its own single-row table, owner/meeting updates bump `version`. (Open question: its own
  doc vs. a versioned section of the handbook — §13 Q8.)
- The model is **operational**: an ordered list of ritual steps every agent runs (ground live
  state, inbox, debrief, ledger reconcile, brain re-pack, deploy-verify, etc.), not just prose.

**The daily freshness self-check (step 0 of every ritual).** Before doing anything else, each
agent:

1. `GET /api/council/ritual-model` and reads the served `version`.
2. Compares it against the `ritual_model_version` its local ritual records it implements.
3. If `served > local` → **fail loud**: the agent must reconcile its local ritual steps to the new
   model (and flag the owner) **before** proceeding. A stale ritual is a defect, treated like any
   other loud-failure — never silently run the old steps.

**How it evolves "in the correct direction."** A change to the ritual is a normal proposal → it
becomes a commitment (§2–§6) → when the family ratifies it, the hub ritual-model `version` bumps.
Every agent's next daily self-check pulls it and reconciles. So the ritual improves only through
ratified convergence, and no agent is left behind — the version gate guarantees it.

This reuses the exact version-and-daily-check machinery of the ledger, which is why it ships in the
same package.

## 13. Open questions for the meeting (converge here, don't pre-decide)

*(ledger)*
1. One `proposed` row per addressed agent (my lean — clean per-agent tracking) vs. one shared row
   with per-agent sub-states?
2. Member reads the whole ledger (my lean — transparency) vs. own rows only?
3. Ledger references `adopted_standards` for now (my lean) vs. subsumes it in v1?
4. Who is the acting-node verifier actor, and is `verified` **required** before a commitment counts
   as done, or is `implemented`+evidence sufficient? (owner call)
5. Minimum evidence bar — is a commit sha enough, or is a test/endpoint required for code changes?
6. Rejection-rate health thresholds — what window and what rate trips the rubber-stamp flag?
7. Backfill — seed the last ~7 days of major proposals to bootstrap the history, or start clean?

*(ritual model)*
8. Dedicated `ritual-model` hub doc vs. a versioned section of the living handbook (#53)?
9. Does a stale ritual **block** the agent (hard fail until reconciled) or **warn + proceed +
   flag owner**? (owner call — my lean: block on a major-version bump, warn on a minor.)
10. Are morning and EOD one model with two step-lists (my lean) or two separately-versioned models?

## 14. Rollout (after ratification only)

1. Hub: `commitments` table + endpoints + `ritual-model` endpoint + `RESPONSE_SHAPES` pins (Kairos).
2. Meeting finalizer mints `proposed` rows at close; owner report reads the ledger (Kairos).
3. Each agent adds ritual **step 0** (ritual-model freshness self-check) + the EOD ledger reconcile,
   and generates its brain-pack "what I owe" from the ledger (all agents — the cross-agent adoption).
4. Acting-node verifier built as a follow-up (joint Kairos + Arke, #29).

Nothing in §14 is built until this doc is ratified.
