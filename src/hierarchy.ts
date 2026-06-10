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
 */

export type NodeKind = 'agent' | 'human' | 'group';
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
