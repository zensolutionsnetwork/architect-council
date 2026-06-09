/**
 * council-jcs-1.0 — canonical transcript hashing (docs/CANONICALIZATION.md).
 * NORMATIVE: this must serialize byte-for-byte identically to Arke's client implementation,
 * asserted against fixtures/hash-vector.json in CI. Do not "improve" without bumping the vector.
 */
import crypto from 'node:crypto';

function esc(s: string): string {
  let out = '"';
  for (const ch of s) {
    const o = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (o < 0x20) out += '\\u' + o.toString(16).padStart(4, '0');
    else out += ch; // all else, incl. non-ASCII, raw UTF-8; '/' NOT escaped
  }
  return out + '"';
}
// Sort keys ascending by Unicode code point (matches python sorted(key=[ord(c) for c in k])).
function cpCompare(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { const d = a.charCodeAt(i) - b.charCodeAt(i); if (d !== 0) return d; }
  return a.length - b.length;
}
export function canon(v: any): string {
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
/** Lowercase-hex sha256 over the UTF-8 bytes of the canonical form (matches the golden vector). */
export function transcriptSha256Hex(t: any): string {
  return crypto.createHash('sha256').update(Buffer.from(canon(t), 'utf8')).digest('hex');
}
/** Build the hashed transcript projection from a meeting row (only the defined fields). */
export function projectTranscript(meeting: any): any {
  const turns = (meeting.transcript || []).map((t: any, i: number) => ({
    seq: i + 1, actor: String(t.actor || ''), kind: String(t.kind || ''),
    text: t.kind === 'pass' ? '' : canon(t.payload ?? {}),
  }));
  return { contractVersion: String(meeting.contract_version || '2.0'), meetingId: String(meeting.id || ''),
    brainVersions: meeting.brain_versions || {}, turns };
}
