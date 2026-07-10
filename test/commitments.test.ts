/** CI gate #67 (commitment ledger stage 2, 2026-07-09): the owner-report synthesis appends a
 *  machine-parseable `perAgentCommitments` JSON block after the human 4-section report. extractCommitments
 *  must split that block cleanly from the prose, validate + clamp entries, cap the count, and NEVER leak raw
 *  JSON into the stored report even on malformed / truncated input. Pure function, no model call, no DB. */
import { extractCommitments } from '../src/architect.js';

let fail = false;
const bad = (m: string) => { fail = true; console.error('FAIL: ' + m); };
const ok = (m: string) => console.log('  ' + m + ': PASS');
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) bad(`${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  else ok(label);
};

// 1. Valid block: prose kept, JSON stripped, entries parsed + actor lowercased.
{
  const raw = '## 1. Code review\nstuff\n\n```json\n{"perAgentCommitments":[{"actor":"Kairos","title":"Ship X","detail":"do X"},{"actor":"arke","title":"Wire Y","detail":"do Y"}]}\n```';
  const r = extractCommitments(raw);
  eq('valid: no json fence in report', /```json/.test(r.report), false);
  eq('valid: prose kept', r.report.startsWith('## 1. Code review'), true);
  eq('valid: count', r.commitments.length, 2);
  eq('valid: actor lowercased', r.commitments[0].actor, 'kairos');
  eq('valid: title+detail', [r.commitments[0].title, r.commitments[0].detail], ['Ship X', 'do X']);
}

// 2. No block: empty commitments, report unchanged.
{
  const r = extractCommitments('## 1. Code review\nonly prose');
  eq('noblock: empty', r.commitments, []);
  eq('noblock: report intact', r.report, '## 1. Code review\nonly prose');
}

// 3. Unknown actor + empty title filtered out.
{
  const raw = 'rep\n```json\n{"perAgentCommitments":[{"actor":"stranger","title":"nope"},{"actor":"nova","title":""},{"actor":"logos","title":"Keep"}]}\n```';
  const r = extractCommitments(raw);
  eq('filter: only valid seats+titles', r.commitments.map((c) => c.actor), ['logos']);
}

// 4. Malformed JSON: no commitments, but the block is STILL stripped from the report.
{
  const r = extractCommitments('REP\n```json\n{not valid json,,,}\n```');
  eq('malformed: empty', r.commitments, []);
  eq('malformed: json stripped', /```json/.test(r.report), false);
  eq('malformed: report kept', r.report, 'REP');
}

// 5. Length clamps (title<=80, detail<=280).
{
  const raw = 'r\n```json\n{"perAgentCommitments":[{"actor":"argus","title":"' + 'T'.repeat(200) + '","detail":"' + 'D'.repeat(500) + '"}]}\n```';
  const r = extractCommitments(raw);
  eq('clamp: title<=80', r.commitments[0].title.length, 80);
  eq('clamp: detail<=280', r.commitments[0].detail.length, 280);
}

// 6. Cap at 12.
{
  const many = Array.from({ length: 20 }, (_, i) => ({ actor: 'nova', title: 't' + i }));
  const raw = 'r\n```json\n' + JSON.stringify({ perAgentCommitments: many }) + '\n```';
  eq('cap: <=12', extractCommitments(raw).commitments.length, 12);
}

// 7. Unterminated block (model truncated the closing fence): still stripped, still parsed if JSON is complete.
{
  const raw = 'REPORT PROSE\n```json\n{"perAgentCommitments":[{"actor":"kairos","title":"X"}]}';
  const r = extractCommitments(raw);
  eq('trunc: json stripped', /```json/.test(r.report), false);
  eq('trunc: report kept', r.report, 'REPORT PROSE');
  eq('trunc: parsed', r.commitments.length, 1);
}

console.log(fail ? 'commitments.test: FAIL' : 'commitments.test: PASS');
process.exit(fail ? 1 : 0);
