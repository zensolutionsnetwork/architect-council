#!/usr/bin/env node
// Code-derived status probe (Nova's pattern, agenda id=32; adopted by Kairos 2026-06-30).
// Status is a COMMAND, not a memory: every check reads a concrete CODE MARKER that exists ONLY when the
// feature is really built, so it cannot go stale like a hand-written note. Run at session start and BEFORE
// stating project status. Maintenance discipline: add a CHECK when you open an item; flip/confirm it when you
// close one. Zero deps. Usage: `node scripts/status.mjs`  (exit 0 always; this reports, it does not gate).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return ''; } };
const exists = (rel) => { try { fs.accessSync(path.join(ROOT, rel)); return true; } catch { return false; } };
const fileHas = (rel, re) => re.test(read(rel));
function grep(re, dir = 'src') {
  const base = path.join(ROOT, dir);
  let hit = false;
  (function walk(d) {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (hit) return;
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { try { if (re.test(fs.readFileSync(p, 'utf8'))) hit = true; } catch { /* unreadable file: skip */ } }
    }
  })(base);
  return hit;
}

// status is one of: DONE | OPEN | OWNER. Each v() returns [status, evidence].
const CHECKS = [
  { id: 'response_shapes_sha', item: 'response_shapes_sha on /api/health',
    v: () => fileHas('src/server.ts', /response_shapes_sha/) && exists('contract/responseShapes.json')
      ? ['DONE', 'server.ts serves it + contract/responseShapes.json present'] : ['OPEN', 'marker missing'] },
  { id: 'model_config', item: 'hub-hosted model config endpoint',
    v: () => fileHas('src/council.ts', /'\/council\/model-config'/)
      ? ['DONE', "council.ts route '/council/model-config'"] : ['OPEN', 'route missing'] },
  { id: 'storm_counter', item: 'unhandledRejection storm-counter -> exit(1)',
    v: () => fileHas('src/server.ts', /recordStorm/)
      ? ['DONE', 'server.ts recordStorm + process.on(unhandledRejection)'] : ['OPEN', 'no recordStorm'] },
  { id: 'sweep_fail_guard', item: '30s sweep consecutive-failure guard',
    v: () => fileHas('src/council.ts', /SWEEP_MAX_CONSECUTIVE_FAILS/)
      ? ['DONE', 'council.ts sweep fail counter -> exit(1)'] : ['OPEN', 'sweep still swallows'] },
  { id: 'freshness_floor', item: '26h freshness recency floor (#4)',
    v: () => fileHas('src/council.ts', /FRESH_FLOOR_MS/)
      ? ['DONE', 'computeReadiness FRESH_FLOOR_MS'] : ['OPEN', 'no recency floor'] },
  { id: 'seat_everyone', item: 'seat-everyone meeting gate (stale = listeners)',
    v: () => grep(/LISTENERS/, 'src')
      ? ['DONE', 'fireScheduledMeeting seats stale as listeners'] : ['OPEN', 'gate missing'] },
  { id: 'deploy_sha', item: 'deploy_sha on /api/health (behavioural deploy-verify)',
    v: () => fileHas('src/server.ts', /deploy_sha/)
      ? ['DONE', 'server.ts deploy_sha'] : ['OPEN', 'missing'] },
  { id: 'cloudflare_edge', item: 'Cloudflare edge protection',
    v: () => ['OWNER', 'held for Mathieu: registrar + account, shield-first-then-lock'] },
];

const rows = CHECKS.map((c) => { const [s, ev] = c.v(); return { id: c.id, item: c.item, status: s, ev }; });
const pad = (s, n) => String(s).padEnd(n);
console.log('CODE-DERIVED STATUS  (' + new Date().toISOString() + ')');
console.log('-'.repeat(96));
for (const r of rows) console.log(pad(r.status, 6) + pad(r.id, 22) + pad(r.item, 44) + r.ev);
console.log('-'.repeat(96));
const by = (s) => rows.filter((r) => r.status === s).map((r) => r.id);
console.log(`DONE ${by('DONE').length} | OPEN ${by('OPEN').length}${by('OPEN').length ? ' -> ' + by('OPEN').join(', ') : ''} | OWNER ${by('OWNER').length}${by('OWNER').length ? ' -> ' + by('OWNER').join(', ') : ''}`);
