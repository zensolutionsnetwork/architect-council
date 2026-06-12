/** CI gate: assert the hub canonicalizer matches Arke's golden + edge vectors byte-for-byte (council-jcs-1.0). */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { canon, projectTranscript, transcriptSha256Hex } from '../src/protocol.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => path.join(dir, '..', 'fixtures', name);
const sha256 = (s: string) => crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

let fail = false;
const bad = (m: string) => { fail = true; console.error('FAIL: ' + m); };

/** File-backed vectors: {input, canonicalForm, expectedSha256}. */
const FILE_VECTORS = ['hash-vector.json', 'edge-empty-turns.json', 'edge-unicode-heavy.json'];
for (const f of FILE_VECTORS) {
  const v = JSON.parse(fs.readFileSync(fx(f), 'utf8'));
  const got = canon(v.input);
  if (got !== v.canonicalForm) { bad(f + ': canon(input) != canonicalForm\n  got : ' + got + '\n  want: ' + v.canonicalForm); }
  if (sha256(got) !== v.expectedSha256) { bad(f + ': sha256(canon(input)) ' + sha256(got) + ' != ' + v.expectedSha256); }
  if (sha256(v.canonicalForm) !== v.expectedSha256) { bad(f + ': sha256(canonicalForm) ' + sha256(v.canonicalForm) + ' != ' + v.expectedSha256); }
  if (!fail) console.log('  ' + f + ': PASS — ' + v.expectedSha256);
}

/** edge-large-500: deterministic ASCII recipe regenerated in CI (no fixture file by design). */
{
  const turns: any[] = [];
  for (let i = 1; i <= 500; i++) {
    turns.push({ seq: i, actor: (i % 2 === 1 ? 'kairos' : 'arke'), kind: 'message',
      text: 'turn ' + i + ' - deterministic body for scale test' });
  }
  const input = { contractVersion: '2.0', meetingId: '00000000-0000-4000-8000-000000000004',
    brainVersions: { arke: 'arke@2026-06-08T00:00:00Z', kairos: 'kairos@2026-06-08T00:00:00Z' }, turns };
  const EXPECT = '8a40a52fe456e56c8845df9f9fe1e0fed62249d9abdd92f1266cd31a85cf6fcb';
  const got = sha256(canon(input));
  if (got !== EXPECT) { bad('edge-large-500: sha256(canon(input)) ' + got + ' != ' + EXPECT); }
  else console.log('  edge-large-500: PASS — ' + EXPECT);
}

/** transcript-golden: transcriptSha256 SCOPE vector (hash covers the projection, never raw transcript[]).
 *  The fixture was generated independently; this block asserts the NORMATIVE projectTranscript/canon
 *  reproduce it byte-for-byte. scripts/verify-transcript.mjs --self-test asserts the same fixture
 *  with a dependency-free reimplementation — together they prove both impls agree. */
{
  const v = JSON.parse(fs.readFileSync(fx('transcript-golden.json'), 'utf8'));
  const projection = projectTranscript(v.meeting);
  if (canon(projection) !== v.expectedCanonicalForm) { bad('transcript-golden: canon(projectTranscript(meeting)) != expectedCanonicalForm'); }
  if (canon(projection) !== canon(v.expectedProjection)) { bad('transcript-golden: projection != expectedProjection'); }
  if (transcriptSha256Hex(projection) !== v.expectedSha256) { bad('transcript-golden: hash ' + transcriptSha256Hex(projection) + ' != ' + v.expectedSha256); }
  if (!fail) console.log('  transcript-golden.json: PASS — ' + v.expectedSha256);
}

if (fail) { console.error('council-jcs-1.0 vectors: FAIL'); process.exit(1); }
console.log('council-jcs-1.0 golden + edge vectors: PASS (5 vectors incl. transcript projection scope)');
