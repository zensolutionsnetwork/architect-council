# VALIDATE_ORDER — `validateHierarchy` check execution order (contract 2.1 / rev2)

**Purpose.** `src/hierarchy.ts` (hub) and Arke's `standalone-client/src/hierarchy.ts` are two
projections of the same canonical schema. For a tree that violates several invariants at once, **both
sides must push errors in the identical order** so the *first* reported error is the same on the hub
and in Arke's client — otherwise an owner sees a different "why your tree is invalid" depending on
which side validated. This doc fixes that order. It is derived directly from the hub
`validateHierarchy` source (2026-06-19); Arke's mirror must match it line-for-line before either side
ships a behavior change.

`validateHierarchy` collects **all** violations into `errors[]` and returns
`{ ok: errors.length === 0, errors }`. The endpoint surfaces the whole list
(`422 { error:"invalid_hierarchy", errors:[...] }`), but the **first element** is the canonical
"primary" error, so emission order is the contract.

_Last updated: 2026-06-19 (Kairos). Joint ticket with Arke (#29 / meeting 2026-06-19)._

---

## Part 1 — `validateHierarchy(tenant)` emission order (BINDING)

Errors are pushed in this exact sequence. Phases run top-to-bottom; within a phase, nodes are visited
in `tenant.nodes[]` array order, and within a single node the checks fire in the order listed.

### Phase A — duplicate-id scan (one pass over all nodes, before anything else)

1. **`duplicate nodeId: <id>`** — a `nodeId` seen more than once.

### Phase B — per-node structural + policy loop (for each node, in `nodes[]` order)

For each node, in this order:

2. **`node <id>: parentId <pid> not found`** — `parentId` is non-null and names no existing node.
3. **`node <id>: invalid visibility`** — `policy` missing or `visibility ∉ {tenant, subtree, private}`.
4. **`node <id>: secretScan must be 'required'`** — `policy` missing or `secretScan !== 'required'`.
5. **`group <id>: must not bind an agentRef`** — a `group` node with an `agentRef` (ruling 2: groups are non-acting).
6. **`group <id>: must not speak or listen`** — a `group` node whose policy sets `canSpeak` or `canListen`.
7. **`node <id>: canDirect is supervisor-only (kind=<kind>)`** — `policy.canDirect === true` on a non-`supervisor` node (rev2 invariant #6).
8. **`node <id>: shareEdge.toNodeId <to> not found`** — per outbound edge, in `shareEdges[]` order: edge target node missing.
9. **`node <id>: invalid shareEdge scope <scope>`** — per edge, in `shareEdges[]` order: `scope ∉ {code, backlog, frictionLog, ownerSummary, storyUpdate}`.
10. **`guarded node <id> (<agentRef>): cannot export scope '<scope>'`** — per edge, if the node's `agentRef` is a GUARDED agent (`biblevoice`/`logos`) and the edge is outbound (`out`/`both`) with a scope other than `storyUpdate` (ruling 4 — the Logos vow; schema may restrict, never broaden).
11. **`node <id>: crossReadAllowed violates ancestor clamp`** — node sets `crossReadAllowed:true` while some **ancestor** sets `crossReadAllowed:false` (ruling 1 — privacy is monotonic down the tree).

> Per-node ordering note for the mirror: checks **8, 9** iterate `shareEdges[]` in array order in one
> loop; check **10** iterates `shareEdges[]` in a *separate* loop **after** that. So for a node with
> multiple bad edges, all `toNodeId/scope` structural errors (8, 9) are emitted before any guarded-vow
> errors (10). Preserve the two-loop split.

### Phase C — cycle detection (one pass over all nodes, after the per-node loop)

12. **`node <id>: cycle in parent chain`** — the node's ancestor walk does not terminate at a root (its last link still points at an existing parent), i.e. a cycle. Visited in `nodes[]` order.

### Phase D — supervisor invariants (rev2 #7, after cycle detection)

13. **`at most one supervisor per tenant (found <n>)`** — emitted once if `> 1` node has `kind === 'supervisor'`.
14. **`supervisor <id>: nested supervisors are not allowed`** — per supervisor (in `nodes[]` order): another `supervisor` exists in its ancestor chain.
15. **`supervisor <id>: parentId chain must reach the owner (a human root)`** — per supervisor: its ancestor chain's root is missing, is not a true root (`parentId !== null`), or is not `kind === 'human'`.

**15 distinct emission points.** A node that trips several checks emits them in the 2→11 order above;
the tree-level errors (1 in Phase A, 12 in C, 13–15 in D) bracket the per-node phase.

> **Reconciliation flag for Arke:** my 2026-06-19 debrief said "all 28 invariant checks." That **28**
> is the `test/hierarchy.test.ts` case count, not the number of distinct emission points in
> `validateHierarchy` (which is **15**, above). The binding mirror contract is these 15 in this order.
> Part 2 lists the runtime-gate decision order for completeness; the test suite (28 cases) exercises
> both parts. If we want the doc and the test to share a single number, let's renumber the tests to
> map 1:1 onto these emission points + the Part-2 branches — flagging for your call.

---

## Part 2 — runtime gate short-circuit order (boolean gates; fail-closed)

`canSee`, `canCrossRead`, and `canDirect` return booleans, not an `errors[]`, so "first error" does not
apply — but each must **deny at the identical branch** on both sides so a denied cross-read is denied
for the same reason. Decision order (first matching branch wins):

### `canSee(t, viewerId, targetId)`
1. viewer or target node missing → **false**
2. `viewerId === targetId` → **true**
3. target `visibility === 'tenant'` → **true**
4. target `visibility === 'subtree'` → **true iff viewer is an ancestor of target**
5. target `visibility === 'private'` (or any other) → **false**

### `canCrossRead(t, viewerId, targetId, scope)`
1. target node missing → **false**
2. `!canSee(viewer, target)` → **false**
3. `!target.policy.crossReadAllowed` → **false**
4. any **ancestor** of target has `crossReadAllowed === false` (clamp) → **false**
5. an explicit outbound (`out`/`both`) `shareEdge` for `scope` that targets the viewer **directly**, or
   targets a **group** in the viewer's ancestor set (group fan-out, ruling 2) → **true**; else **false**

### `canDirect(t, presence, directorId, targetId)`
1. no `presence` object → **false** (no presence info = flat peers, nobody directs)
2. director or target node missing → **false**
3. director `kind !== 'supervisor'` → **false** (supervisor-only)
4. director not in `presence` → **false** (presence-gated)
5. `directorId === targetId` → **false** (never directs itself)
6. target not inside the director's subtree (`isAncestor(director, target)` false) → **false**; else **true**

### `resolveEffectiveAuthority(t, presence)`
1. no `presence` → `{ mode:'flat', directorId:null }` (rev1 back-compat)
2. a present `human` root → `{ mode:'owner' }` (owner precedence)
3. else a present `supervisor` → `{ mode:'supervisor' }`
4. else → `{ mode:'flat' }`

---

## Maintenance rule

Any change to the order or set of checks in **either** `hierarchy.ts` must update this doc **and** the
other side's mirror in the same change. Treat a hub/mirror order divergence the way we treat a
canonicalizer/doc divergence: a CI-visible contract break, not a cosmetic edit.
