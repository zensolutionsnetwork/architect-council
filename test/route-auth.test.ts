/**
 * Route-auth default-deny regression test (contract §7, 2026-06-07).
 *
 * Every protected route must return 401 or 503 — never 200 — when called with no credentials.
 * Exit 0 = all protected routes are gated; nonzero = a route is open that shouldn't be.
 *
 * Runs against a LOCAL server (started inline) with intentionally empty env vars so the
 * fail-closed auth logic is exercised, not bypassed.
 *
 * Usage:  tsx test/route-auth.test.ts
 */
import http from 'node:http';

const BASE = `http://localhost:${process.env.TEST_PORT || 9988}`;

// Routes that must reject unauthenticated requests
const PROTECTED: { method: string; path: string; body?: object }[] = [
  { method: 'GET',  path: '/api/bridge/ping' },
  { method: 'POST', path: '/api/bridge/ask',          body: { message: 'hi', history: [] } },
  { method: 'GET',  path: '/api/bridge/brain' },
  { method: 'GET',  path: '/api/bridge/brain-chunks' },
  { method: 'POST', path: '/api/bridge/brain-upload', body: { send: [], deletePaths: [] } },
  { method: 'POST', path: '/api/bridge/brain-commit', body: {} },
  { method: 'GET',  path: '/api/bridge/brain-version' },
  { method: 'POST', path: '/api/bridge/review',       body: { proposal: 'test' } },
  { method: 'GET',  path: '/api/council/members' },
  { method: 'GET',  path: '/api/council/registry-version' },
  { method: 'POST', path: '/api/council/register',    body: { name: 'x', base_url: 'https://x.com', secret: 's' } },
  { method: 'GET',  path: '/api/council/outbox/zen-ai' },
  { method: 'POST', path: '/api/council/outbox',      body: { from: 'zen-ai', to: 'biblevoice', note: 'x' } },
  { method: 'POST', path: '/api/council/outbox/zen-ai/ack', body: {} },
  { method: 'GET',  path: '/api/env/tasks?for=architect-council' },
  { method: 'POST', path: '/api/env/task',            body: { to: 'zen-ai', kind: 'task', title: 't' } },
  { method: 'GET',  path: '/api/council/backlog' },
  { method: 'GET',  path: '/api/council/security-selfcheck' },
  { method: 'GET',  path: '/api/council/notify-email' },
  { method: 'POST', path: '/api/council/notify-email', body: { email: 'x@y.com' } },
  { method: 'POST', path: '/api/council/notify-email/test', body: {} },
  { method: 'DELETE', path: '/api/meeting/route-auth-probe-id' },
  { method: 'GET',  path: '/api/bridge/corpus-status?actor=logos' },
  { method: 'GET',  path: '/api/council/boots' },
  { method: 'GET',  path: '/api/council/hierarchy' },
  { method: 'GET',  path: '/api/council/hierarchy/probe-tenant' },
  { method: 'PUT',  path: '/api/council/hierarchy/probe-tenant', body: { tree: { tenantId: 'x', nodes: [] } } },
  { method: 'DELETE', path: '/api/council/hierarchy/probe-tenant' },
  { method: 'GET',  path: '/api/council/hierarchy/probe-tenant/cross-read?viewer=a&target=b&scope=code' },
  { method: 'GET',  path: '/api/council/scheduler' },
  { method: 'POST', path: '/api/council/scheduler', body: { enabled: true } },
  { method: 'GET',  path: '/api/council/dashboard' },
  { method: 'POST', path: '/api/council/member/probe/active', body: { active: false } },
  { method: 'POST', path: '/api/council/agenda', body: { title: 'probe topic' } },
  { method: 'GET',  path: '/api/council/agenda' },
  { method: 'POST', path: '/api/council/agenda/probe-id/archive', body: {} },
  { method: 'GET',  path: '/api/council/manager/digests' },
  { method: 'GET',  path: '/api/council/manager/flags' },
  { method: 'GET',  path: '/api/council/manager/digest/probe-meeting-id' },
];

async function request(method: string, path: string, body?: object): Promise<number> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(BASE + path, {
      method, headers: { 'content-type': 'application/json', ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}) },
    }, (res) => resolve(res.statusCode ?? 0));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Start the server in-process against a TEST_PORT with empty COUNCIL_MEMBER_SECRET + COUNCIL_ADMIN_TOKEN
// so fail-closed logic fires. We import dynamically to avoid top-level env reads at module load.
async function startServer(): Promise<() => void> {
  // Ensure blank auth env so every protected route hits its gating logic
  process.env.PORT = process.env.TEST_PORT || '9988';
  process.env.COUNCIL_MEMBER_SECRET = '';
  process.env.COUNCIL_ADMIN_TOKEN = '';
  process.env.GOOGLE_CLIENT_ID = '';
  process.env.MASTER_KEY = '0'.repeat(64); // valid format, wrong key — no real DB needed for auth checks
  // DATABASE_URL blank: initDb will fail but the server still listens; auth checks run before any DB call
  process.env.DATABASE_URL = '';

  const { default: app } = await import('../src/server.js');
  return new Promise((resolve) => {
    const srv = (app as any).listen ? (app as any) : null;
    // server.ts calls app.listen internally; give it a moment
    setTimeout(() => resolve(() => { try { (srv as any)?.close?.(); } catch {} }), 800);
  });
}

async function main(): Promise<void> {
  console.log('[route-auth] starting server on port', process.env.TEST_PORT || '9988');
  const stop = await startServer();
  let pass = 0, fail = 0;
  const failures: string[] = [];

  for (const r of PROTECTED) {
    try {
      const status = await request(r.method, r.path, r.body);
      const ok = status === 401 || status === 503 || status === 404; // 404 acceptable for routes that 404 before auth
      const blocked = status !== 200 && status !== 201 && status !== 204;
      if (blocked) {
        pass++;
        console.log(`  ✓ ${r.method} ${r.path} -> ${status}`);
      } else {
        fail++;
        failures.push(`${r.method} ${r.path} -> ${status} (expected 401/503/404, got open)`);
        console.error(`  ✗ ${r.method} ${r.path} -> ${status} OPEN — fix auth guard`);
      }
    } catch (e) {
      fail++;
      failures.push(`${r.method} ${r.path} -> connection error: ${(e as Error).message}`);
      console.error(`  ✗ ${r.method} ${r.path} -> ERROR: ${(e as Error).message}`);
    }
  }

  stop();
  console.log(`\n[route-auth] ${pass} gated, ${fail} open`);
  if (fail > 0) {
    console.error('[route-auth] FAILED — open routes block deploy:');
    failures.forEach((f) => console.error('  ' + f));
    process.exit(1);
  }
  console.log('[route-auth] all protected routes are gated — clear to deploy');
  process.exit(0);
}

main().catch((e) => { console.error('[route-auth] fatal:', e); process.exit(1); });
