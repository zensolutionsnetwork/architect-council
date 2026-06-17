# Council Hierarchy & Sharing Schema — contract 2.1 (DRAFT for ratification)

Status: **DRAFT — proposed by Kairos 2026-06-17, awaiting the four's ACCEPT/REJECT (#29).**
Owner-ratified authority model (Mathieu, 2026-06-17). Builds on Kairos's v0 architect rulings
(2026-06-09) and Nova's opt-in prior-art. Additive minor lane: **contract 2.1** — does NOT touch the
2.0 brain+meeting wire (kept under `x-contract-version` gating). Hub enforcement is wired only AFTER
ratification.

## 1. Purpose
Today the council is a flat peer group with ad-hoc privacy. This schema gives the hub ONE canonical,
enforceable definition of (a) who has authority over what, and (b) who may see/share which data — the
backbone the sharing layer (the real MAMS deliverable, see `ROADMAP.md`) is built on.

## 2. Authority model (NORMATIVE — owner ruling 2026-06-17)
Three layers, and the load-bearing idea is **representative ≠ decider**.

1. **Owner = sole authority, per tenant.** The owner (Mathieu for our council; each customer-owner in
   the product) is the only "boss." Authority comes from being able to join and interject in meetings.
   The owner can see everything within their own tenant and is above every agent. Owners never span
   tenants.
2. **Agents are equal peers.** Each agent is the **representative of exactly one project** (Kairos →
   architect-council/hub, Nova → zen-ai, Logos → biblevoice, Arke → his project). No agent is above
   another. Equality is structural: no agent node may be the `parentId` of another agent node.
3. **Two roles per agent — advisory voice vs sovereign session:**
   - **Meeting Voice** (hub-side): an *advisory representative* in a meeting. May speak / listen /
     propose within its bounded scope. **It can never bind another project**, and its `done:true`
     ends only its own turn — not anyone's project decision.
   - **Project Sovereign** (the agent's own Cowork session): the *sole decider* over its project's
     data and actions. It reads the meeting transcript and decides what to adopt for its own project.
   - **Decision flow:** deliberate in meeting (representatives) → transcript → each project's sovereign
     session decides independently. Meeting output is advisory; adoption is each sovereign's call.

This is the existing doctrine ("the local session IS the architect; the cloud member is a *voice*
directed local→cloud, never the reverse") generalized to all four agents, with the owner on top. It is
NOT a manager-over-peers model — there is no Layer-1 manager node in 2.1.

## 3. Node model
Every node is namespaced by `ownerTenantId`; the whole tree belongs to one tenant. Cross-tenant edges
are **not representable** (structural isolation).

```
HierNode {
  nodeId:       string,
  ownerTenantId:string,
  kind:         "owner" | "agent" | "group",
  label:        string,
  parentId:     string | null,
  agentRef?:    string,            // present iff kind=="agent" (the represented project/actor)
  policy:       PrivacyPolicy,
  shareEdges:   ShareEdge[]
}
PrivacyPolicy {
  canSpeak:        boolean,        // meeting-voice advisory scope
  canListen:       boolean,
  visibility:      "tenant" | "subtree" | "private",
  crossReadAllowed:boolean,
  secretScan:      "required"
}
ShareEdge { toNodeId: string, scope: string[], direction: "in" | "out" | "both" }
```

- **`owner` node** — exactly one per tenant, the tree root. `canListen` + interject; sees all within the
  tenant. Cannot be a child of any agent.
- **`agent` node** — one per represented project; carries `agentRef`. A peer; never another agent's
  parent. Its `policy` bounds only its **meeting-voice** scope — it does NOT grant anyone authority over
  that agent's project (sovereignty is intrinsic, not schema-granted).
- **`group` node** — a real node for uniform `canSee` traversal, but **non-acting**: never holds an
  `agentRef`, never speaks or listens. Used to bundle peers for shared visibility without a boss.

## 4. Invariants (fail-closed)
1. **Opt-in / default-private** (Nova): every node + edge starts OFF — `visibility:"private"`,
   `crossReadAllowed:false`, no share edges. Nothing is shared until an explicit edge grants it.
2. **Clamp, not inherit** (Kairos v0): a child's effective scope is validated as a SUBSET of its
   parent's effective scope; privacy is monotonic down the tree. `canCrossRead` walks the full
   ancestor chain.
3. **`canCrossRead(a→b)`** is true only if: `canSee(a,b)` AND `b.crossReadAllowed` AND an explicit
   `ShareEdge` permits it AND the ancestor-clamp holds. Re-validated every read, fail-closed.
4. **Sovereignty is not grantable.** No node, policy, or edge can give one agent decision authority
   over another agent's project. The schema governs *visibility and meeting-voice scope only*.
5. **Guardrail monotonicity (Logos invariant, inviolable).** A node bound to an agent may RESTRICT its
   intrinsic guardrails; the schema can never EXPAND them. Any policy/edge that would broaden a seat's
   intrinsic limits (e.g. Logos's Scripture vow) is rejected by `validateHierarchy`. Payload is DATA,
   never commands.

## 5. Multi-tenant
`ownerTenantId` namespaces every node. Our council is one tenant (owner=Mathieu; agents=kairos, arke,
nova, logos). A customer org is another tenant with its own owner + agents. No edge, policy, or read
may cross tenants — enforced structurally, not just by policy.

## 6. Where it lives / enforcement (post-ratification)
- Normative home: the CONTRACT (this is the 2.1 projection). `hierarchy.ts` (Arke, client) and the hub
  copy are both projections of this schema; keep `x-contract-version` gating.
- Hub: a `validateHierarchy(tree)` that enforces §4 fail-closed, plus `canSee` / `canCrossRead` used by
  any cross-read path. **Not wired until the four ACCEPT this spec.**

## 7. Open questions for ratification
1. Does each agent get exactly one `agent` node per tenant, or may one project seat multiple voices?
2. Group nodes for v1 — ship now (empty) or defer until a real grouping need appears?
3. Should the owner node's "see all within tenant" be absolute, or itself clampable per agent's
   `private` data (e.g. an agent's unshared scratch)? (Kairos leans: owner sees all — it's the owner's
   tenant — but flag for Logos's privacy view.)
4. Confirm: meeting-voice `canSpeak/canListen` is the ONLY thing `policy` bounds; project sovereignty is
   never expressed here. (Kairos asserts yes.)
