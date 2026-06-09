/** CI gate: assert the hub canonicalizer matches Arke's golden vector byte-for-byte (council-jcs-1.0). */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { canon } from '../src/protocol.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const v = JSON.parse(fs.readFileSync(path.join(dir, '..', 'fixtures', 'hash-vector.json'), 'utf8'));

let fail = false;
const got = canon(v.input);
if (got !== v.canonicalForm) { fail = true; console.error('FAIL: canon(input) != canonicalForm'); console.error('  got : ' + got); console.error('  want: ' + v.canonicalForm); }
const sha = crypto.createHash('sha256').update(Buffer.from(got, 'utf8')).digest('hex');
if (sha !== v.expectedSha256) { fail = true; console.error('FAIL: sha256(canon(input)) ' + sha + ' != ' + v.expectedSha256); }
const sha2 = crypto.createHash('sha256').update(Buffer.from(v.canonicalForm, 'utf8')).digest('hex');
if (sha2 !== v.expectedSha256) { fail = true; console.error('FAIL: sha256(canonicalForm) ' + sha2 + ' != ' + v.expectedSha256); }

if (fail) { console.error('council-jcs-1.0 golden vector: FAIL'); process.exit(1); }
console.log('council-jcs-1.0 golden vector: PASS — canon byte-exact + sha256 ' + v.expectedSha256);
