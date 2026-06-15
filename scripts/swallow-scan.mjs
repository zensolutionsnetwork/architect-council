#!/usr/bin/env node
// Gate #6 (council meeting #5, 2026-06-13): blocking CI gate against SILENT swallows.
// A bare empty catch block hides failures — the recurring fail-open defect the family grep keeps
// finding. This scans src/ for `catch (..) {}` / `catch {}` with an empty body and fails CI (exit 1)
// unless the catch is annotated `// swallow-ok: <reason>` (Nova's keystone) on the catch line or the
// line above. Deliberate, reviewed swallows stay legal; accidental ones get caught.
//
// Usage: node scripts/swallow-scan.mjs            (blocking: exit 1 on any unannotated empty catch)
//        node scripts/swallow-scan.mjs --dry-run  (report only, always exit 0)
import fs from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry-run');
const ROOT = 'src';
const EMPTY_CATCH = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g; // catch {}  |  catch (e) {}

function walk(d) {
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((f) =>
    f.isDirectory() ? walk(path.join(d, f.name)) : [path.join(d, f.name)]);
}

let violations = 0;
for (const file of walk(ROOT)) {
  if (!/\.(ts|js|mjs)$/.test(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  let m;
  EMPTY_CATCH.lastIndex = 0;
  while ((m = EMPTY_CATCH.exec(text)) !== null) {
    const lineNo = text.slice(0, m.index).split('\n').length;
    const here = lines[lineNo - 1] || '';
    const prev = lines[lineNo - 2] || '';
    if (/swallow-ok\s*:/.test(here) || /swallow-ok\s*:/.test(prev)) continue;
    console.error(`[swallow-scan] unannotated empty catch in ${file}:${lineNo}: ${here.trim()}`);
    violations++;
  }
}

if (violations === 0) { console.log('[swallow-scan] clean — no unannotated empty catch blocks in src/'); process.exit(0); }
console.error(`[swallow-scan] ${violations} unannotated empty catch block(s).` +
  ' Add `// swallow-ok: <reason>` if deliberate, or log + handle the error.');
process.exit(DRY ? 0 : 1);
