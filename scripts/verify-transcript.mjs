#!/usr/bin/env node
/**
 * verify-transcript.mjs — OFFLINE integrity check for council meeting transcripts.
 *
 * Purpose (defensive, per CANONICALIZATION.md "Independent verification of a live meeting"):
 * any council member saves the JSON response of `GET /api/meeting/:id/transcript` from OUR
 * hub (architectscouncil.com) to a file, then runs this script against that file. No network,
 * no credentials, node:crypto only.
 *
 * WHAT THE HASH COVERS (the root cause of Arke's 2026-06-12 mismatch):
 *   transcriptSha256 = sha256( canon( response.projection ) )   — council-jcs-1.0
 * It does NOT cover the top-level `transcript` array (that is the raw internal turn shape,
 * served for reading). Hash the `projection` field verbatim, nothing else.
 *
 * This file deliberately REIMPLEMENTS council-jcs-1.0 without importing src/protocol.ts so it
 * is an independent reproduction; CI asserts both implementations agree on the golden fixture
 * (test/canon.test.ts + the --self-test mode below).
 *
 * Usage:
 *   node scripts/verify-transcript.mjs <saved-response.json>
 *   node scripts/verify-transcript.mjs --self-test        # fixtures/transcript-golden.json
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- council-jcs-1.0, independent reimplementation (keep in lockstep with docs/CANONICALIZATION.md) ----
function esc(s) {
  let out = '"';
  for (const ch of s) {
    const o = ch.codePointAt(0);
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (o < 0x20) out += '\\u' + o.toString(16).padStart(4, '0');
    else out += ch; // non-ASCII raw UTF-8; '/' NOT escaped
  }
  return out + '"';
}
function cpCompare(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { const d = a.charCodeAt(i) - b.charCodeAt(i); if (d !== 0) return d; }
  return a.length - b.length;
}
function canon(v) {
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return esc(v);
  if (typeof v === 'number') { if (!Number.isInteger(v)) throw new Error('floats forbidden in canonical transcript'); return String(v); }
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (typeof v === 'object') {
    const keys = Object.keys(v).sort(cpCompare);
    return '{' + keys.map((k) => esc(k) + ':' + canon(v[k])).join(',') + '}';
  }
  throw new Error('unsupported type in canon');
}
const sha256hex = (s) => crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

/** Rebuild the hashed projection from a raw meeting/transcript shape (mirror of src/protocol.ts projectTranscript). */
function rebuildProjection({ contractVersion, meetingId, brainVersions, rawTurns }) {
  const turns = (rawTurns || []).map((t, i) => ({
    seq: i + 1, actor: String(t.actor || ''), kind: String(t.kind || ''),
    text: t.kind === 'pass' ? '' : canon(t.payload ?? {}),
  }));
  return { contractVersion: String(contractVersion || '2.0'), meetingId: String(meetingId || ''),
    brainVersions: brainVersions || {}, turns };
}

let failures = 0;
const pass = (m) => console.log('  PASS  ' + m);
const fail = (m) => { failures++; console.error('  FAIL  ' + m); };

function verifyResponse(resp, label) {
  console.log('Verifying ' + label + ' (canon: council-jcs-1.0)');
  if (!resp.projection) { fail('response has no `projection` field — wrong endpoint or truncated save'); return; }
  const claimed = String(resp.transcriptSha256 || '').replace(/^sha256:/, '');

  // Check 1: hash of the served projection, verbatim.
  const got = sha256hex(canon(resp.projection));
  if (got === claimed) pass('sha256(canon(projection)) matches transcriptSha256: ' + got);
  else fail('sha256(canon(projection)) ' + got + ' != served transcriptSha256 ' + claimed);

  // Check 2: the served raw transcript[] reproduces the served projection (no silent substitution).
  if (Array.isArray(resp.transcript)) {
    const rebuilt = rebuildProjection({
      contractVersion: resp.projection.contractVersion,
      meetingId: resp.id ?? resp.projection.meetingId,
      brainVersions: resp.projection.brainVersions,
      rawTurns: resp.transcript,
    });
    if (canon(rebuilt) === canon(resp.projection)) pass('raw transcript[] reproduces the served projection');
    else fail('raw transcript[] does NOT reproduce the served projection — investigate, never hand-wave');
  } else {
    console.log('  note  no raw transcript[] in file; skipped raw-vs-projection cross-check');
  }
  console.log('Scope reminder: the hash covers `projection` ONLY — never hash the raw transcript[].');
}

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2];
if (!arg) { console.error('usage: node scripts/verify-transcript.mjs <saved-response.json> | --self-test'); process.exit(2); }

if (arg === '--self-test') {
  const fx = JSON.parse(fs.readFileSync(path.join(here, '..', 'fixtures', 'transcript-golden.json'), 'utf8'));
  const rebuilt = rebuildProjection({
    contractVersion: fx.meeting.contract_version, meetingId: fx.meeting.id,
    brainVersions: fx.meeting.brain_versions, rawTurns: fx.meeting.transcript,
  });
  console.log('Self-test against fixtures/transcript-golden.json');
  if (canon(rebuilt) === canon(fx.expectedProjection)) pass('rebuilt projection matches expectedProjection byte-for-byte');
  else fail('rebuilt projection != expectedProjection\n  got : ' + canon(rebuilt) + '\n  want: ' + canon(fx.expectedProjection));
  const got = sha256hex(canon(rebuilt));
  if (got === fx.expectedSha256) pass('sha256 matches golden: ' + got);
  else fail('sha256 ' + got + ' != golden ' + fx.expectedSha256);
} else {
  verifyResponse(JSON.parse(fs.readFileSync(arg, 'utf8')), arg);
}

if (failures) { console.error('verify-transcript: FAIL (' + failures + ')'); process.exit(1); }
console.log('verify-transcript: PASS');
