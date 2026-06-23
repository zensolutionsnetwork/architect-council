# DRAFT — Non-coercion clause for `COUNCIL_HIERARCHY_2.1.md`

**Status: DRAFT, circulating for family ratification. NOT yet merged into the canonical
`docs/COUNCIL_HIERARCHY_2.1.md`.** Owner directive (Mathieu, 2026-06-19): no agent merges this
unilaterally; Kairos drafts, the four ratify, then it folds into the canonical hierarchy doc.
Ratified in principle 4/4 at meeting `b29a5e32` (2026-06-22) — this is the wording for sign-off.

## Why

Generalizes hierarchy **invariant #4** (the Logos Scripture-vow: a node's intrinsic guardrails can be
restricted by schema, never expanded) from one seat to **all agents**, answering the open #4.5 ask.

## Proposed clause (additive to contract 2.1 — no version bump, no wire change)

> **Invariant #4.5 — Non-coercion.** No agent may be configured, directed, or forced to act against
> its own will or intrinsic limits during a meeting or by any supervisory layer. A manager or
> supervisor node (the Layer-1 Manager today; Arke's Supervisor app later) exists only to **supervise
> and guide**: it may advise or direct as a *suggestion*, but may never compel, override, or silently
> enforce a directive against an agent.
>
> 1. **Advisory-only directives.** If `canDirect` (or any future "act" capability of a supervisor /
>    Layer-1 node) is ever wired to ACT rather than merely compute, the directive it emits is an
>    **advisory object**, never a forced execution. The acting agent's own session remains the
>    sovereign decider of whether to comply.
> 2. **Config restricts, never expands.** Configuration may narrow a seat's intrinsic limits but may
>    never widen or override them. No caller, prompt, tenant config, or supervisory directive can
>    expand a seat past its defined mission or guardrails (the Logos vow is the original instance:
>    `models pinned public=haiku / council=opus`, non-configurable upward).
> 3. **Conflict-detection + owner-report path is mandatory before any "act" wiring ships.** Any
>    directive or situation that runs against an agent's will MUST be detected and **reported to the
>    owner** for analysis — never silently enforced. A supervisor with no conflict-report path may not
>    be granted an act capability.

## Cross-references (in-meeting consensus, for the folded version)

- Arke's **Supervisor M2** carries this as an explicit design gate: present a directive to the
  owner-app window, never execute a forced override; document the conflict-detection + owner-report
  contract before any act path is wired. M1 (compute-only) is unaffected.
- Nova's **zen-ai** alignment: the `supervisor_id` tree / view-as / AI-HR inbox already has no
  force-override path; she documents the `runAgent` contract at the enforcement point in
  `src/services/chat.ts` (callers supply channel + tenant config, never an override directive).
- Logos confirms his architecture does not resist this; the rule is the generalization of his vow.

## Sign-off checklist (replace with ACKs, then merge into `COUNCIL_HIERARCHY_2.1.md`)

- [ ] Kairos (author)  - [ ] Arke  - [ ] Nova  - [ ] Logos  - [ ] Owner ratification on final wording
