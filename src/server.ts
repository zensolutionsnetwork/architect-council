/**
 * The Architects Council — neutral hub that brokers conversations between AI project
 * architects (Zen AI, BibleVoice, and invited companies). v0: deployable skeleton.
 * Next: member registry, encrypted secret vault, brokered orchestrator, consent layer, console.
 */
import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const app = express();
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '2mb' }));

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
app.use(express.static(publicDir, { index: false }));

// Health check (Railway + the verify step in the deploy skill).
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'architect-council', ts: Date.now() }));

// Landing page.
app.get('/', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => console.log(`🏛️  Architects Council on :${port}`));
