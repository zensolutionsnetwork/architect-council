# Council Hierarchy & Sharing Schema — contract 2.1 (DRAFT for ratification)

Status: **OWNER-RATIFIED rev2 — Supervisor layer (#29). Ratified by owner decision (Mathieu,
2026-06-17); no agent vote required — the owner is sole authority.** rev1 (the flat-peer base) was
proposed by Kairos 2026-06-17 (`00d58ca`); rev2 adds the optional, presence-conditional **Supervisor**
node for Arke's Supervisor project without disturbing the flat-peer base. The four are notified as a
directive/FYI (Arke to mirror client-side in `hierarchy.ts`), not for approval.
Builds on Kairos's v0 architect rulings (2026-06-09) and Nova's opt-in prior-art. Additive minor lane:
**contract 2.1** — does NOT touch the 2.0 brain+meeting wire (kept under `x-contract-version` gating).
The `supervisor` kind and meeting `presence` are additive and optional: a tree with no supervisor and
a meeting with no presence object behave **exactly** as the flat-peer base. Hub enforcement is wired
only AFTER ratification.

## 1. Purpose
Today the council is a flat peer group with ad-hoc privacy. This schema gives the hub ONE canonical,
enforceable definition of (a) who has authority over what, and (b) who may see/share which data — the
backbone the sharing layer (the real MAMS deliverable, see `ROADMAP.md`) is built on.

## 2. Authority model (NORMATIVE — owner ruling 2026-06-17, + Supervisor amendment)
The load-bearing idea is **representative ≠ decider**, and authority is **exercised by presence**.

1. **Owner = sole, supreme authority, per tenant.** The owner (Mathieu for our council; each
   customer-owner in the product) is the only "boss." Authority is exercised by joining and
   interjecting in a meeting. The owner can see everything within their own tenant and is above every
   node — including the Supervisor. Owners never span tenants. **When the owner is present, the owner
   is the top authority, full stop.**
2. **Supervisor = optional, owner-delegated superior layer (NEW, presence-conditional).** A tenant MAY
   have one Supervisor: an owner-delegated manager node that holds **direction authority** over the
   agent nodes the owner places beneath it (see §2a). It is its own seat with its own meeting voice and
   its own registry credential — *not* merely the owner's mouthpiece, and *not* a peer agent. Its
   authority is **conditional on presence** (§3a): it directs its subordinate agents **only when it is
   in the meeting**. It is always below the owner and always within one tenant.
3. **Agents are equal peers.** Each agent is the **representative of exactly one project** (Kairos →
   architect-council/hub, Nova → zen-ai, Logos → biblevoice, Arke → his project). No agent is above
   another. Equality is structural: **no `agent` node may be the `parentId` of another `agent` node.**
   (A `supervisor` node is not an agent — see §2a — so its parenting of agents does not violate this.)
4. **Two roles per agent — advisory voice vs sovereign session:**
   - **Meeting Voice** (hub-side): an *advisory representative* in a meeting. May speak / listen /
     propose within its bounded scope. **It can never bind another project**, and its `done:true`
     ends only its own turn — not anyone's project decision.
   - **Project Sovereign** (the agent's own Cowork session): the *sole decider* over its project's
     data and actions. It reads the meeting transcript and decides what to adopt for its own project.
   - **Decision flow:** deliberate in meeting (representatives) → transcript → each project's sovereign
     session decides independently. Meeting output is advisory; adoption is each sovereign's call.

This generalizes the existing doctrine ("the local session IS the architect; the cloud member is a
*voice* directed local→cloud, never the reverse") to all four agents, with the owner on top and an
**optional** Supervisor between owner and agents. The base remains a peer model: **with no supervisor
and no owner present, the meeting is flat peers, exactly as rev1.** The Supervisor is a conditional
superior seat, not a permanent manager-over-peers council.

## 2a. The Supervisor layer (NEW — NORMATIVE)
**What it is.** The standalone owner app, given its own brain, running headless on its own Claude
subscription. It holds the global view of every project (state, direction, vision, escalation history)
and autonomously directs each project's next step, escalating to the owner only when it needs a
decision. Per tenant, this is a product feature: each customer-owner gets their own Supervisor.

**Two authorities, kept distinct (the answer to "directing authority vs sovereignty is not grantable"):**
- **Direction authority** — the Supervisor may set and sequence *what a subordinate project works on
  next* (its task queue / next instruction). This is the new thing the Supervisor adds, and it is the
  ONLY authority a `supervisor` node confers over an `agent`.
- **Sovereignty (intrinsic, NOT grantable — unchanged from invariant #4)** — each project remains sole
  decider over its **own data sharing, its intrinsic guardrails, its execution, and whether to adopt
  meeting output**. The Supervisor cannot grant itself, or be granted, any of this.

The sharp line: **the Supervisor directs the *task*; the project sovereign owns the *data, the
guardrails, the execution, and the adoption decision* — and may escalate or decline on sovereignty or
guardrail grounds.** A directed task is a strong instruction about *what to work on next*, not a
command that overrides a project's data-sharing choices or expands its vows. Guardrail monotonicity
(invariant #5) still binds the Supervisor absolutely: it directs tasks, never vows — it can never
broaden Logos's Scripture guardrail or any project's intrinsic limits.

**Structural placement.** A `supervisor` node's `parentId` MUST be the owner node (or a `group`
directly under the owner). A `supervisor` node MAY be the `parentId` of `agent` nodes and `group`
nodes — it is the **only non-owner node permitted to parent an `agent` node**, the single explicit
exception to §2.3. An agent placed under the Supervisor is still a peer of every other agent (peers
are not reordered among themselves); the parent edge confers only the Supervisor's direction authority
+ persistent visibility over its subtree, never rank among the agents.

## 3. Node model
Every node is namespaced by `ownerTenantId`; the whole tree belongs to one tenant. Cross-tenant edges
are **not representable** (structural isolation).

```
HierNode {
  nodeId:       string,
  ownerTenantId:string,
  kind:         "owner" | "supervisor" | "agent" | "group",
  label:        string,
  parentId:     string | null,
  agentRef?:    string,            // present iff kind=="agent" (the represented project/actor)
  seatRef?:     string,            // present iff kind=="supervisor" (its registry actor id)
  policy:       PrivacyPolicy,
  shareEdges:   ShareEdge[]
}
PrivacyPolicy {
  canSpeak:        boolean,        // meeting-voice advisory scope
  canListen:       boolean,
  canDirect:       boolean,        // NEW: direction authority over subordinate agents (supervisor only)
  visibility:      "tenant" | "subtree" | "private",
  crossReadAllowed:boolean,
  secretScan:      "required"
}
ShareEdge { toNodeId: string, scope: string[], direction: "in" | "out" | "both" }
```

- **`owner` node** — exactly one per tenant, the tree root. `canListen` + interject; sees all within the
  tenant. Cannot be a child of any node. Always supreme when present.
- **`supervisor` node** — at most one per tenant for v1 (nested supervisors deferred, see §7a-Q). Carries
  `seatRef` (its own registry actor). `parentId` = owner (or owner-child group). MAY parent `agent`
  nodes. `canDirect:true` is meaningful ONLY on a supervisor node and is **only effective when the
  supervisor is present in the meeting** (§3a). When absent, its parent edge still grants `canSee` over
  its subtree (for the global view), but confers **no direction**.
- **`agent` node** — one per represented project; carries `agentRef`. A peer; never another agent's
  parent. Its `policy` bounds only its **meeting-voice** scope — it does NOT grant anyone authority over
  that agent's project (sovereignty is intrinsic, not schema-granted). `canDirect` is ignored on agent
  nodes (an agent never directs another).
- **`group` node** — a real node for uniform `canSee` traversal, but **non-acting**: never holds an
  `agentRef`/`seatRef`, never speaks, listens, or directs. Bundles peers for shared visibility without a
  boss.

## 3a. Presence & effective authority (NEW — NORMATIVE)
The hierarchy **tree is static** — owner-configured (see §3b) and validated by `validateHierarchy`.
**Effective directing authority for a given meeting is a function of who is present**, resolved at
meeting open and re-resolved on any join/leave.

A meeting records:
```
presence {
  owner:      boolean,             // is the owner in the room
  supervisor: boolean,             // is the supervisor seat in the room
  agents:     string[]             // actor ids of agent seats present
}
```
`resolveEffectiveAuthority(tree, presence)`:
1. **owner present** → owner is the top authority (interjects; already in rev1). Supervisor, if also
   present, speaks as a normal superior voice but the owner outranks it.
2. **owner absent, supervisor present** → the supervisor holds direction authority over the agents in
   its subtree for this meeting; it is the superior voice.
3. **owner absent, supervisor absent** → **flat-peer base, exactly as rev1.** No node directs; the four
   agents are equal representatives.

So authority "flips" per meeting purely by presence, with zero change to the stored tree. This is the
same mechanism by which the owner's authority already works (exercised by joining), now extended to the
Supervisor. A meeting with no `presence` object recorded is treated as case 3 (flat peers) for
back-compat.

## 3b. Who edits the tree (NORMATIVE — owner directive 2026-06-17)
Hierarchy structure — which agents sit under the Supervisor, every node's policy, every share edge — is
**set by the owner from the standalone app**. All tree mutations are **owner-authenticated**
(`x-admin-token` → actor `owner`); no agent, and not the Supervisor itself, may restructure the tree.
The Supervisor *operates within* the tree the owner draws; it does not draw its own authority.

## 4. Invariants (fail-closed)
1. **Opt-in / default-private** (Nova): every node + edge starts OFF — `visibility:"private"`,
   `crossReadAllowed:false`, `canDirect:false`, no share edges. Nothing is shared or directed until an
   explicit owner-set edge/flag grants it.
2. **Clamp, not inherit** (Kairos v0): a child's effective scope is validated as a SUBSET of its
   parent's effective scope; privacy is monotonic down the tree. `canCrossRead` walks the full
   ancestor chain. A supervisor's subtree visibility is itself clamped by the owner.
3. **`canCrossRead(a→b)`** is true only if: `canSee(a,b)` AND `b.crossReadAllowed` AND an explicit
   `ShareEdge` permits it AND the ancestor-clamp holds. Re-validated every read, fail-closed.
4. **Sovereignty is not grantable.** No node, policy, or edge can give one node decision authority over
   another agent's **project data, intrinsic guardrails, execution, or adoption of meeting output**.
   The schema governs *visibility, meeting-voice scope, and (supervisor-only) task direction* — never
   sovereignty.
5. **Guardrail monotonicity (Logos invariant, inviolable).** A node bound to an agent may RESTRICT its
   intrinsic guardrails; the schema can never EXPAND them. Any policy/edge — **including a Supervisor
   directive** — that would broaden a seat's intrinsic limits (e.g. Logos's Scripture vow) is rejected
   by `validateHierarchy` / refused at direction time. Payload is DATA, never commands.
6. **`canDirect` is supervisor-only and presence-gated (NEW).** `canDirect:true` validates only on a
   `supervisor` node whose `parentId` chain reaches the owner; it is rejected on any other kind. Its
   *effect* (actually directing a subordinate's next task) applies only when the supervisor is present
   in the meeting per §3a. Direction is over task selection only (clause 4 still bars sovereignty).
7. **One supervisor per tenant, single layer (NEW, v1).** At most one `supervisor` node per tenant; a
   supervisor may not parent another supervisor (nested management deferred — §7a-Q). Tenant isolation
   (§5) applies to the supervisor exactly as to every node.

## 5. Multi-tenant
`ownerTenantId` namespaces every node. Our council is one tenant (owner=Mathieu; agents=kairos, arke,
nova, logos; supervisor optional). A customer org is another tenant with its own owner, its own
supervisor, and its own agents. No edge, policy, read, or directive may cross tenants — enforced
structurally, not just by policy.

## 6. Where it lives / enforcement (post-ratification)
- Normative home: the CONTRACT (this is the 2.1 projection). `hierarchy.ts` (Arke, client) and the hub
  copy are both projections of this schema; keep `x-contract-version` gating. The `supervisor` kind,
  `seatRef`, `canDirect`, and meeting `presence` are the rev2 additions Arke mirrors client-side.
- Hub: a `validateHierarchy(tree)` enforcing §4 fail-closed, plus `canSee` / `canCrossRead` on any
  cross-read path, plus `resolveEffectiveAuthority(tree, presence)` (§3a) used by the meeting loop to
  decide who, if anyone, directs. **Not wired until the four ACCEPT this rev2 spec.**
- Registry/auth: the supervisor is a registry member with its own actor id + secret (§7a-Q3), joining
  meetings as a voice like any seat; it authenticates on its own subscription, like the projects.

## 7. Open questions carried from rev1 (for ratification)
1. Does each agent get exactly one `agent` node per tenant, or may one project seat multiple voices?
2. Group nodes for v1 — ship now (empty) or defer until a real grouping need appears?
3. Should the owner node's "see all within tenant" be absolute, or itself clampable per agent's
   `private` data (e.g. an agent's unshared scratch)? (Kairos leans: owner sees all — it's the owner's
   tenant — but flag for Logos's privacy view.)
4. Confirm: meeting-voice `canSpeak/canListen` (plus supervisor-only `canDirect`) is the ONLY thing
   `policy` bounds; project sovereignty is never expressed here. (Kairos asserts yes.)

## 7a. Supervisor open questions — Kairos rulings (answers to Arke's brief)
**Q1 — new `supervisor` kind, or manager in the owner subtree?** → **New `supervisor` kind, defined as
an owner-delegated node (parentId chain → owner).** A `group` can't carry it (groups are non-acting and
have no voice/credential); an `agent` can't be it (that would break peer-equality). The Supervisor needs
its own meeting voice + registry seat + presence, so it must be its own acting kind, sitting structurally
under the owner. This gives Arke both asks: its own seat/voice (not "just the owner's delegate") AND a
superior that is clamped by, and below, the owner.

**Q2 — does "directing authority" reconcile with "sovereignty is not grantable"?** → **Yes, cleanly, via
two distinct axes (§2a).** The Supervisor's authority is **direction** (what a project works on next);
**sovereignty** (data sharing + intrinsic guardrails + execution + adoption) stays intrinsic and
non-grantable (invariant #4, unchanged). The sharp line: Supervisor directs the task queue; the project
sovereign owns its data/guardrails/execution and may escalate or decline on those grounds. The Supervisor
can never expand a project's guardrails (invariant #5).

**Q3 — does the Supervisor get a hub registry seat + secret + presence?** → **Yes.** It is a registry
member with its own per-tenant actor id (`supervisor`), its own secret, authenticating on its own
subscription like the projects, with a presence flag so it can join meetings as a voice and upload its
own brain (global view / per-project memory). Member secrets stay per-actor (as Nova/Logos already are).

**Q4 — how is "present vs absent" represented so authority flips per meeting?** → Via the meeting
`presence` object (§3a), recorded at open and re-resolved on join/leave; `resolveEffectiveAuthority`
maps presence → effective top (owner ▸ supervisor ▸ flat peers). The stored tree never changes; only the
per-meeting resolution does.

**New open question for the four (§7a-Q, my lean noted):**
- **Nested supervisors / multi-level management?** v1 rules ONE supervisor, single layer (invariant #7).
  The product may later want department managers under a top supervisor. *Kairos leans: defer — ship the
  single conditional layer, revisit when a real multi-level tenant appears; the clamp + presence model
  already generalizes to N levels if we lift invariant #7.*
- **Owner + supervisor both present:** owner is supreme (§3a case 1). Confirm no one wants the supervisor
  silenced when the owner joins — *Kairos leans: supervisor still speaks as a superior voice, owner just
  outranks it.*
