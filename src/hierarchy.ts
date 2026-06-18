/**
 * Agent-hierarchy enforcement primitives — contract 2.1 (the four's ratified rulings, 2026-06-09).
 * PURE module: no env, no I/O, unit-testable, runs identically hub-side and client-side (Arke's
 * standalone-client/src/hierarchy.ts is the other projection of the same canonical schema).
 *
 * NOT yet wired into any live endpoint — these are the enforcement functions the consent-gated
 * cross-read endpoint will call once contract 2.1 lands formally. Building them tested + gated now
 * so the wiring is trivial later and the logic is proven.
 *
 * Ratified rulings encoded here:
 *  1. Scope inheritance = CLAMP not inherit — a node's effective cross-read is bounded by its whole
 *     ancestor chain; privacy is monotonic down the tree (a subtree can only narrow, never widen).
 *  2. `group` = real node but NON-ACTING — carries policy + can be a parentId, never an agentRef,
 *     never speaks/listens.
 *  3. Nova prior-art: opt-in by default — a node grants cross-read only via an explicit shareEdge.
 *  4. Logos-vow HARD INVARIANT — a node bound to a guarded agent (biblevoice/logos) can never be
 *     configured to broaden its voice; the schema may RESTRICT, never EXPAND an intrinsic guardrail.
 *
 * rev2 — supervisor layer (owner-ratified 2026-06-17 `fab9fe6`; wired hub-side 2026-06-18 after Arke's
 * standalone-client/src/hierarchy.ts mirror landed/confirmed, msg `eeb797e5`). Adds an OPTIONAL,
 * presence-conditional `supervisor` node that DIRECTS its subtree when present (owner overrides it):
 *  5. NodeKind adds `supervisor`; PrivacyPolicy gains optional `canDirect` (defaults false).
 *  6. `canDirect` is supervisor-only — a non-supervisor node may not set canDirect.
 *  7. At most ONE supervisor per tenant; no nested supervisors; a supervisor's parentId chain MUST
 *     reach the owner (a human root). resolveEffectiveAuthority = owner > supervisor > flat; NO presence
 *     object = flat peers (back-compat — the rev1 flat-peer base is untouched).
 */

export type NodeKind = 'agent' | 'human' | 'group' | 'supervisor';
export type Visibility = 'tenant' | 'subtree' | 'private';
export type ShareScope = 'code' | 'backlog' | 'frictionLog' | 'ownerSummary' | 'storyUpdate';
export type ShareDirection = 'out' | 'in' | 'both';

export interface ShareEdge { toNodeId: string; scope: ShareScope; direction: ShareDirection }
export interface PrivacyPolicy {
  canSpeak: boolean;
  canListen: boolean;
  visibility: Visibility;
  crossReadAllowed: boolean;
  secretScan: 'required';
  canDirect?: boolean;          // rev2: supervisor-only capability to direct its subtree. Defaults false.
}
export interface HierNode {
  nodeId: string;
  kind: NodeKind;
  label?: string;
  role?: string;
  parentId: string | null;     // reportsTo; null = root
  agentRef?: string;           // the acting agent bound to this node (never on a group)
  policy: PrivacyPolicy;
  shareEdges: ShareEdge[];
}
export interface Tenant { tenantId: string; nodes: HierNode[] }

const SCOPES: ShareScope[] = ['code', 'backlog', 'frictionLog', 'ownerSummary', 'storyUpdate'];
const VIS: Visibility[] = ['tenant', 'subtree', 'private'];
// Ruling 4: agents whose intrinsic guardrail the schema may never broaden. A node bound to one of
// these may only export its chronicle lane (storyUpdate) — any other outbound shareEdge is rejected.
export const GUARDED_AGENTS = new Set(['biblevoice', 'logos']);
const GUARDED_OUTBOUND_ALLOW = new Set<ShareScope>(['storyUpdate']);

const byId = (t: Tenant) => new Map(t.nodes.map((n) => [n.nodeId, n]));

/** Walk parentId up to the root; returns [self, parent, …, root]. Cycle-safe (bounded by node count). */
export function ancestorChain(t: Tenant, nodeId: string): HierNode[] {
  const m = byId(t); const out: HierNode[] = []; const seen = new Set<string>();
  let cur: HierNode | undefined = m.get(nodeId);
  while (cur && !seen.has(cur.nodeId)) { seen.add(cur.nodeId); out.push(cur); cur = cur.parentId ? m.get(cur.parentId) : undefined; }
  return out;
}
const isAncestor = (t: Tenant, ancestorId: string, nodeId: string): boolean =>
  ancestorChain(t, nodeId).some((n) => n.nodeId === ancestorId);

export interface ValidationResult { ok: boolean; errors: string[] }

/** Structural + policy validation of a whole tenant tree (the four's rulings 1–4). */
export function validateHierarchy(t: Tenant): ValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const n of t.nodes) {
    if (ids.has(n.nodeId)) errors.push(`duplicate nodeId: ${n.nodeId}`);
    ids.add(n.nodeId);
  }
  const m = byId(t);
  for (const n of t.nodes) {
    // parent must exist (or be null = root)
    if (n.parentId !== null && !m.has(n.parentId)) errors.push(`node ${n.nodeId}: parentId ${n.parentId} not found`);
    // policy sanity
    if (!n.policy || !VIS.includes(n.policy.visibility)) errors.push(`node ${n.nodeId}: invalid visibility`);
    if (!n.policy || n.policy.secretScan !== 'required') errors.push(`node ${n.nodeId}: secretScan must be 'required'`);
    // ruling 2: group = real but NON-ACTING
    if (n.kind === 'group') {
      if (n.agentRef) errors.push(`group ${n.nodeId}: must not bind an agentRef`);
      if (n.policy && (n.policy.canSpeak || n.policy.canListen)) errors.push(`group ${n.nodeId}: must not speak or listen`);
    }
    // rev2 invariant #6: canDirect is supervisor-only.
    if (n.policy && n.policy.canDirect === true && n.kind !== 'supervisor') {
      errors.push(`node ${n.nodeId}: canDirect is supervisor-only (kind=${n.kind})`);
    }
    // shareEdge sanity + opt-in (ruling 3): edge target must exist, scope valid
    for (const e of n.shareEdges || []) {
      if (!m.has(e.toNodeId)) errors.push(`node ${n.nodeId}: shareEdge.toNodeId ${e.toNodeId} not found`);
      if (!SCOPES.includes(e.scope)) errors.push(`node ${n.nodeId}: invalid shareEdge scope ${e.scope}`);
    }
    // ruling 4: guarded agent (Logos vow) — only its chronicle lane may be exported outbound.
    if (n.agentRef && GUARDED_AGENTS.has(n.agentRef)) {
      for (const e of n.shareEdges || []) {
        if ((e.direction === 'out' || e.direction === 'both') && !GUARDED_OUTBOUND_ALLOW.has(e.scope)) {
          errors.push(`guarded node ${n.nodeId} (${n.agentRef}): cannot export scope '${e.scope}' — schema may restrict, never broaden the vow`);
        }
      }
    }
    // ruling 1: CLAMP — a node may not enable crossReadAllowed if any ancestor forbids it.
    if (n.policy && n.policy.crossReadAllowed) {
      const chain = ancestorChain(t, n.nodeId).slice(1); // ancestors only
      if (chain.some((anc) => anc.policy && anc.policy.crossReadAllowed === false)) {
        errors.push(`node ${n.nodeId}: crossReadAllowed violates ancestor clamp (an ancestor forbids cross-read)`);
      }
    }
  }
  // cycle detection: every chain must terminate at a root within node-count steps
  for (const n of t.nodes) {
    const chain = ancestorChain(t, n.nodeId);
    const last = chain[chain.length - 1];
    if (last && last.parentId !== null && m.has(last.parentId)) errors.push(`node ${n.nodeId}: cycle in parent chain`);
  }
  // rev2 invariant #7: at most ONE supervisor per tenant; no nested supervisors; each supervisor's
  // parentId chain MUST reach the owner (a human root). The supervisor is presence-conditional and only
  // ever directs DOWN its own subtree, so it must sit under the human owner, never above or beside.
  const supervisors = t.nodes.filter((n) => n.kind === 'supervisor');
  if (supervisors.length > 1) errors.push(`at most one supervisor per tenant (found ${supervisors.length})`);
  for (const sup of supervisors) {
    const chain = ancestorChain(t, sup.nodeId);
    if (chain.slice(1).some((anc) => anc.kind === 'supervisor')) errors.push(`supervisor ${sup.nodeId}: nested supervisors are not allowed`);
    const root = chain[chain.length - 1];
    if (!root || root.parentId !== null || root.kind !== 'human') {
      errors.push(`supervisor ${sup.nodeId}: parentId chain must reach the owner (a human root)`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** canSee(viewer, target): can the viewer observe the target node at all? (the see-tree, ruling-aware)
 *  - tenant: everyone in the tenant sees it.
 *  - subtree: only the target itself and its ancestors (managers up the chain) see it.
 *  - private: only the target itself.
 *  Cross-tenant is unrepresentable (one Tenant object), so same-tenant is implicit. */
export function canSee(t: Tenant, viewerId: string, targetId: string): boolean {
  const m = byId(t);
  const target = m.get(targetId); const viewer = m.get(viewerId);
  if (!target || !viewer) return false;
  if (viewerId === targetId) return true;
  switch (target.policy.visibility) {
    case 'tenant': return true;
    case 'subtree': return isAncestor(t, viewerId, targetId); // viewer is up the chain from target
    case 'private': return false;
    default: return false;
  }
}

/** canCrossRead(viewer, target, scope): may the viewer read the target's `scope` content?
 *  = canSee AND target.crossReadAllowed AND an explicit outbound shareEdge for (scope -> viewer)
 *    AND the ancestor clamp holds (no ancestor of the target forbids cross-read). Fail-closed. */
export function canCrossRead(t: Tenant, viewerId: string, targetId: string, scope: ShareScope): boolean {
  const m = byId(t);
  const target = m.get(targetId); if (!target) return false;
  if (!canSee(t, viewerId, targetId)) return false;
  if (!target.policy.crossReadAllowed) return false;
  // ancestor clamp: any ancestor forbidding cross-read closes the gate for the whole subtree.
  const chain = ancestorChain(t, targetId).slice(1);
  if (chain.some((anc) => anc.policy && anc.policy.crossReadAllowed === false)) return false;
  // explicit, opt-in shareEdge (ruling 3). A shareEdge grants the viewer iff the edge targets the
  // viewer DIRECTLY, or targets a GROUP that the viewer is in (ruling 2: only groups fan out to a
  // subtree — sharing to a manager node never leaks to that manager's other children).
  const viewerAncestors = new Set(ancestorChain(t, viewerId).map((n) => n.nodeId)); // viewer + ancestors
  return (target.shareEdges || []).some((e) => {
    if (e.scope !== scope || !(e.direction === 'out' || e.direction === 'both')) return false;
    if (e.toNodeId === viewerId) return true;                       // direct grant
    const to = m.get(e.toNodeId);
    return !!to && to.kind === 'group' && viewerAncestors.has(e.toNodeId); // group fan-out to its subtree
  });
}

// ===== rev2: supervisor authority (mirrors Arke's standalone-client/src/hierarchy.ts) =================
/** Presence = the set of nodeIds currently online. `undefined` means "no presence info" → flat peers
 *  (back-compat). The hub builds this from whoever is actually connected for a given resolution. */
export type Presence = Set<string>;
export interface EffectiveAuthority { mode: 'owner' | 'supervisor' | 'flat'; directorId: string | null }

/** Who directs, given who is present: owner (human root) > supervisor (presence-conditional) > flat.
 *  No presence object = flat peers, untouched rev1 behavior. */
export function resolveEffectiveAuthority(t: Tenant, presence?: Presence): EffectiveAuthority {
  if (!presence) return { mode: 'flat', directorId: null };
  const owner = t.nodes.find((n) => n.kind === 'human' && n.parentId === null && presence.has(n.nodeId));
  if (owner) return { mode: 'owner', directorId: owner.nodeId };
  const sup = t.nodes.find((n) => n.kind === 'supervisor' && presence.has(n.nodeId));
  if (sup) return { mode: 'supervisor', directorId: sup.nodeId };
  return { mode: 'flat', directorId: null };
}

/** May `directorId` direct `targetId` right now? Supervisor-only + presence-gated + target strictly
 *  inside the supervisor's subtree. (Owner precedence is expressed by resolveEffectiveAuthority; this is
 *  the capability check for a specific pair.) Fail-closed; no presence object = nobody directs. */
export function canDirect(t: Tenant, presence: Presence | undefined, directorId: string, targetId: string): boolean {
  if (!presence) return false;
  const m = byId(t);
  const d = m.get(directorId); const tgt = m.get(targetId);
  if (!d || !tgt) return false;
  if (d.kind !== 'supervisor') return false;     // supervisor-only
  if (!presence.has(directorId)) return false;   // presence-gated
  if (directorId === targetId) return false;     // never directs itself
  return isAncestor(t, directorId, targetId);    // target must be inside the supervisor's subtree
}
