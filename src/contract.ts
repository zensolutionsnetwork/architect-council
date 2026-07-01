/*
 * Response-shapes contract sha (meeting f7f36a14 homework, 2026-06-30).
 * contract/responseShapes.json is the machine-readable source of truth for the hub's response
 * shapes. The hub serves response_shapes_sha on /api/health so a consumer (Arke drift alarm,
 * Logos freshness consumer) can detect shape drift with one probe. The sha is over CANONICAL
 * JSON, not raw bytes (Logos's correction): parse the file, canon() it (council-jcs-1.0: sorted
 * keys, no whitespace), then sha256hex the UTF-8. Formatting/whitespace churn does NOT move the
 * sha; a real shape change does. Consumers reproduce it as sha256hex(canon(their-parsed-copy)).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canon } from './protocol.js';

// Resolve relative to this module so it works under tsx (no build step) and in the Docker image
// (Dockerfile COPYs ./contract). src/ is one level under the repo root, so ../contract from here.
const CONTRACT_PATH = fileURLToPath(new URL('../contract/responseShapes.json', import.meta.url));

let cached: string | null | undefined; // undefined = not yet computed; null = read/parse failed.

/** sha256hex(canon(parsed responseShapes.json)), or 'unknown' if the file is missing/unparseable.
 *  Computed once and cached; fail-soft so /api/health never throws. */
export function responseShapesSha(): string {
  if (cached !== undefined) return cached ?? 'unknown';
  try {
    const parsed = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
    cached = crypto.createHash('sha256').update(Buffer.from(canon(parsed), 'utf8')).digest('hex');
  } catch {
    cached = null; // fail-soft: an unreadable/invalid contract yields 'unknown', never a crash.
  }
  return cached ?? 'unknown';
}
