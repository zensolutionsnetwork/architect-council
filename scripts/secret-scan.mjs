#!/usr/bin/env node
// Secret scan for architect-council (contract S7, 2026-06-07).
// Exit 0 = clean; nonzero = blocked by CI.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const PATTERNS = [
  { label: 'hex-token-32+', re: /\b[0-9a-f]{32,}\b/gi },
  { label: 'anthropic-key', re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { label: 'openai-key', re: /sk-[A-Za-z0-9]{20,}/g },
  { label: 'db-url-with-creds', re: /postgres(?:ql)?:\/\/[^:]+:[^@]+@/gi },
  { label: 'pem-block', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { label: 'password-assign', re: /\bPASSWORD\s*=\s*[^\s]{8,}/gi },
];

const SKIP_EXT = new Set(['.lock', '.png', '.jpg', '.ico', '.woff', '.woff2', '.ttf']);
const SKIP_PATH = ['node_modules', 'dist', '.git', 'package-lock.json'];

// council-jcs-1.0 golden/edge vector sha256 hashes AND Kairos meeting-debrief
// transcript sha256 hashes are PUBLIC integrity hashes, not secrets. Exempt ONLY
// the hex rule, ONLY in the files whose purpose is to carry those hashes. Every
// other pattern (keys, db URLs, PEM, passwords) still applies to these files, so
// a real credential pasted into a debrief is still blocked.
const HEX_RULE_EXEMPT = [
  /^fixtures\//,
  /^docs\/CANONICALIZATION\.md$/,
  /^test\/canon\.test\.ts$/,
  /^council\/KAIROS_DEBRIEF_.*\.md$/,
];
const ALLOW_LIST = [
  'AES-256-GCM', 'aes-256-gcm', 'sha256', 'timingSafeEqual',
  'MASTER_KEY must be 32 bytes', 'COUNCIL_MEMBER_SECRET', 'COUNCIL_ADMIN_TOKEN',
  'DATABASE_URL', 'process.env.',
];

let files = [];
try {
  files = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' })
    .split('\n').filter(Boolean);
} catch {
  console.log('[secret-scan] git unavailable, walking src/');
  const walk = (d) => {
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d, { withFileTypes: true }).flatMap((f) =>
      f.isDirectory() ? walk(path.join(d, f.name)) : [path.join(d, f.name)]);
  };
  files = walk('src');
}

let violations = 0;
for (const file of files) {
  if (SKIP_EXT.has(path.extname(file))) continue;
  if (SKIP_PATH.some((s) => file.includes(s))) continue;
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const fileNorm = file.replace(/\\/g, '/');
  for (const { label, re } of PATTERNS) {
    if (label === 'hex-token-32+' && HEX_RULE_EXEMPT.some((rx) => rx.test(fileNorm))) continue;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const match = m[0];
      const ctx = text.slice(Math.max(0, m.index - 60), m.index + 60);
      if (ALLOW_LIST.some((a) => match.includes(a) || ctx.includes(a))) continue;
      const line = text.slice(0, m.index).split('\n').length;
      console.error('[secret-scan] ' + label + ' in ' + file + ':' + line + ': "' + match.slice(0, 40) + '"');
      violations++;
    }
  }
}

if (violations === 0) {
  console.log('[secret-scan] clean');
  process.exit(0);
} else {
  console.error('[secret-scan] BLOCKED -- ' + violations + ' violation(s)');
  process.exit(1);
}
