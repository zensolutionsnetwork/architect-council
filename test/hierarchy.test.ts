/* Unit tests for the hierarchy enforcement primitives (contract 2.1, the four's ratified rulings).
 * Pure — no I/O. Run: npx tsx test/hierarchy.test.ts  (wired into npm + CI as hierarchy-test). */
import { validateHierarchy, canSee, canCrossRead, ancestorChain, resolveEffectiveAuthority, canDirect, type Tenant, type HierNode, type PrivacyPolicy } from '../src/hierarchy.js';

let pass = 0, fail = 0;
const ok = (cond: boolean, msg: string) => { if (cond) { pass++; } else { fail++; console.error('  FAIL: ' + msg); } };

const pol = (p: Partial<PrivacyPolicy> = {}): PrivacyPolicy => ({
  canSpeak: true, canListen: true, visibility: 'tenant', crossReadAllowed: false, secretScan: 'required', ...p,
});
const node = (id: string, parentId: string | null, extra: Partial<HierNode> = {}): HierNode => ({
  nodeId: id, kind: 'agent', parentId, policy: pol(), shareEdges: [], ...extra,
});

// --- valid tree ---
const t: Tenant = { tenantId: 'zen', nodes: [
  node('root', null, { kind: 'group', policy: pol({ canSpeak: false, canListen: false, crossReadAllowed: true }) }),
  node('mgr', 'root', { policy: pol({ crossReadAllowed: true }) }),
  node('nova', 'mgr', { agentRef: 'zen-ai', policy: pol({ crossReadAllowed: true }),
    shareEdges: [{ toNodeId: 'mgr', scope: 'code', direction: 'out' }] }),
  node('logos', 'mgr', { agentRef: 'biblevoice',
    shareEdges: [{ toNodeId: 'mgr', scope: 'storyUpdate', direction: 'out' }] }),
]};
ok(validateHierarchy(t).ok, 'valid tree passes: ' + JSON.stringify(validateHierarchy(t).errors));
ok(ancestorChain(t, 'nova').map((n) => n.nodeId).join('>') === 'nova>mgr>root', 'ancestor chain');

// --- ruling 2: group must not act ---
const g = { tenantId: 'x', nodes: [node('g', null, { kind: 'group', agentRef: 'oops' })] };
ok(!validateHierarchy(g).ok, 'group with agentRef rejected');

// --- ruling 4: guarded agent may only export storyUpdate ---
const badLogos: Tenant = { tenantId: 'x', nodes: [ node('root', null),
  node('lg', 'root', { agentRef: 'logos', shareEdges: [{ toNodeId: 'root', scope: 'code', direction: 'out' }] }) ]};
ok(!validateHierarchy(badLogos).ok, 'guarded node exporting code rejected (Logos vow)');

// --- ruling 1: clamp — child crossRead under a forbidding ancestor ---
const clamp: Tenant = { tenantId: 'x', nodes: [
  node('root', null, { policy: pol({ crossReadAllowed: false }) }),
  node('c', 'root', { policy: pol({ crossReadAllowed: true }) }) ]};
ok(!validateHierarchy(clamp).ok, 'crossRead under forbidding ancestor rejected (clamp)');

// --- missing parent + duplicate id + cycle ---
ok(!validateHierarchy({ tenantId: 'x', nodes: [node('a', 'ghost')] }).ok, 'missing parent rejected');
ok(!validateHierarchy({ tenantId: 'x', nodes: [node('d', null), node('d', null)] }).ok, 'duplicate id rejected');
const cyc: Tenant = { tenantId: 'x', nodes: [node('a', 'b'), node('b', 'a')] };
ok(!validateHierarchy(cyc).ok, 'cycle rejected');

// --- canSee ---
ok(canSee(t, 'logos', 'nova'), 'tenant-visible: peer sees peer');
const sub: Tenant = { tenantId: 'x', nodes: [ node('root', null), node('mgr', 'root', { policy: pol({ visibility: 'subtree' }) }),
  node('child', 'mgr', { policy: pol({ visibility: 'subtree' }) }) ]};
ok(canSee(sub, 'mgr', 'child'), 'subtree: ancestor sees descendant');
ok(!canSee(sub, 'child', 'mgr'), 'subtree: descendant does NOT see ancestor');
const priv: Tenant = { tenantId: 'x', nodes: [ node('a', null), node('b', null, { policy: pol({ visibility: 'private' }) }) ]};
ok(!canSee(priv, 'a', 'b'), 'private: not visible to others');

// --- canCrossRead ---
ok(canCrossRead(t, 'mgr', 'nova', 'code'), 'cross-read allowed: explicit edge + crossReadAllowed + canSee');
ok(!canCrossRead(t, 'mgr', 'nova', 'backlog'), 'cross-read denied: no edge for that scope');
ok(!canCrossRead(t, 'logos', 'nova', 'code'), 'cross-read denied: no edge to this viewer');

// --- rev2: supervisor layer ---
const sup: Tenant = { tenantId: 'zen', nodes: [
  node('owner', null, { kind: 'human' }),
  node('sup', 'owner', { kind: 'supervisor', policy: pol({ canDirect: true }) }),
  node('a', 'sup'),
  node('b', 'owner'),
]};
ok(validateHierarchy(sup).ok, 'valid supervisor tree passes: ' + JSON.stringify(validateHierarchy(sup).errors));
// invariant #6: canDirect supervisor-only
ok(!validateHierarchy({ tenantId: 'x', nodes: [ node('owner', null, { kind: 'human' }),
  node('a', 'owner', { policy: pol({ canDirect: true }) }) ]}).ok, 'non-supervisor canDirect rejected (#6)');
// invariant #7: at most one supervisor
ok(!validateHierarchy({ tenantId: 'x', nodes: [ node('owner', null, { kind: 'human' }),
  node('s1', 'owner', { kind: 'supervisor' }), node('s2', 'owner', { kind: 'supervisor' }) ]}).ok, 'two supervisors rejected (#7)');
// invariant #7: supervisor chain must reach a human owner root
ok(!validateHierarchy({ tenantId: 'x', nodes: [ node('grp', null, { kind: 'group', policy: pol({ canSpeak: false, canListen: false }) }),
  node('s', 'grp', { kind: 'supervisor' }) ]}).ok, 'supervisor not under human owner rejected (#7)');
// resolveEffectiveAuthority: owner > supervisor > flat; no presence = flat
ok(resolveEffectiveAuthority(sup).mode === 'flat', 'no presence => flat (back-compat)');
ok(resolveEffectiveAuthority(sup, new Set(['owner', 'sup', 'a'])).mode === 'owner', 'owner present => owner directs');
ok(resolveEffectiveAuthority(sup, new Set(['sup', 'a'])).mode === 'supervisor', 'supervisor present, owner absent => supervisor directs');
ok(resolveEffectiveAuthority(sup, new Set(['a'])).mode === 'flat', 'neither owner nor supervisor present => flat');
// canDirect: supervisor-only + presence-gated + subtree-scoped
ok(canDirect(sup, new Set(['sup', 'a']), 'sup', 'a'), 'supervisor directs a descendant when present');
ok(!canDirect(sup, new Set(['a']), 'sup', 'a'), 'supervisor absent => cannot direct (presence-gated)');
ok(!canDirect(sup, new Set(['sup', 'b']), 'sup', 'b'), 'cannot direct a target outside the subtree');
ok(!canDirect(sup, undefined, 'sup', 'a'), 'no presence object => cannot direct');
ok(!canDirect(sup, new Set(['a', 'sup']), 'a', 'sup'), 'non-supervisor director => cannot direct');

console.log(`hierarchy enforcement (contract 2.1 + rev2 supervisor): ${fail === 0 ? 'PASS' : 'FAIL'} (${pass} checks)`);
process.exit(fail === 0 ? 0 : 1);
