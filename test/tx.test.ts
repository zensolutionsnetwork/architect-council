/** CI gate #64 (meeting 03efb93a, 2026-07-07): assert `withTransaction` is atomic across the seams of a
 *  multi-write op (the agent retire/delete path). A crash injected between writes must ROLLBACK every prior
 *  write and NEVER COMMIT — so an interrupted retire can never leave a de-seated member row whose secret
 *  still authenticates (the ghost-auth window). Drives BEGIN/COMMIT/ROLLBACK against a mock client, no DB. */
import { withTransaction } from '../src/store.js';

let fail = false;
const bad = (m: string) => { fail = true; console.error('FAIL: ' + m); };
const ok = (m: string) => console.log('  ' + m + ': PASS');
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) bad(`${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  else ok(label);
};

// A mock pool client that records every query text in order and can be told to throw on a chosen write.
function mockClient(failOn?: string) {
  const log: string[] = [];
  let released = false;
  const client = {
    query: async (text: string) => {
      log.push(text);
      if (failOn && text === failOn) throw new Error('injected crash at ' + failOn);
      return { rows: [], rowCount: 0 };
    },
    release: () => { released = true; },
  };
  return { client, log, wasReleased: () => released };
}

// 1. Happy path: BEGIN → work → COMMIT, ROLLBACK never runs, client released, return value threaded out.
{
  const m = mockClient();
  const r = await withTransaction(async (tx) => {
    await tx.query('W1'); await tx.query('W2'); await tx.query('W3');
    return 'retired';
  }, async () => m.client as any);
  eq('happy: query order', m.log, ['BEGIN', 'W1', 'W2', 'W3', 'COMMIT']);
  eq('happy: no rollback', m.log.includes('ROLLBACK'), false);
  eq('happy: return threaded', r, 'retired');
  eq('happy: client released', m.wasReleased(), true);
}

// 2. Crash at the SECOND seam (retire = seat-drop, setInactive, revokeSecret): the 3rd write never runs,
//    COMMIT never runs, ROLLBACK undoes the first two, error propagates, client still released.
{
  const m = mockClient('W2');
  let threw = false;
  try {
    await withTransaction(async (tx) => {
      await tx.query('W1'); await tx.query('W2'); await tx.query('W3');
    }, async () => m.client as any);
  } catch { threw = true; }
  eq('crash: propagates', threw, true);
  eq('crash: query order', m.log, ['BEGIN', 'W1', 'W2', 'ROLLBACK']);
  eq('crash: no third write', m.log.includes('W3'), false);
  eq('crash: never committed', m.log.includes('COMMIT'), false);
  eq('crash: rolled back', m.log.includes('ROLLBACK'), true);
  eq('crash: client released', m.wasReleased(), true);
}

// 3. Crash at the FIRST seam: still rolls back (BEGIN already open) and never commits.
{
  const m = mockClient('W1');
  let threw = false;
  try {
    await withTransaction(async (tx) => { await tx.query('W1'); await tx.query('W2'); }, async () => m.client as any);
  } catch { threw = true; }
  eq('first-seam: propagates', threw, true);
  eq('first-seam: query order', m.log, ['BEGIN', 'W1', 'ROLLBACK']);
  eq('first-seam: never committed', m.log.includes('COMMIT'), false);
  eq('first-seam: client released', m.wasReleased(), true);
}

// 4. A failing ROLLBACK is best-effort: the ORIGINAL error still propagates and the client is still released.
{
  const log: string[] = [];
  let released = false;
  const client = {
    query: async (text: string) => {
      log.push(text);
      if (text === 'W1') throw new Error('injected work failure');
      if (text === 'ROLLBACK') throw new Error('injected rollback failure');
      return { rows: [], rowCount: 0 };
    },
    release: () => { released = true; },
  };
  let msg = '';
  try {
    await withTransaction(async (tx) => { await tx.query('W1'); }, async () => client as any);
  } catch (e) { msg = (e as Error).message; }
  eq('rollback-fail: original error wins', msg, 'injected work failure');
  eq('rollback-fail: attempted order', log, ['BEGIN', 'W1', 'ROLLBACK']);
  eq('rollback-fail: client still released', released, true);
}

if (fail) { console.error('\n[tx.test] FAIL'); process.exit(1); }
console.log('\n[tx.test] all atomicity assertions PASS');
