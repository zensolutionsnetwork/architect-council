/**
 * The Architects Council — neutral hub that brokers conversations between AI project architects.
 * Broker (/api/council/*) + the hub's own member brain (/api/bridge/*) + a secret-gated console.
 */
import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initDb, vaultReady } from './store.js';
import { bridgeRouter, councilRouter, selfRegister, startScheduler } from './council.js';
import { rateLimit } from './ratelimit.js';

const app = express();
app.set('trust proxy', 1); // Railway terminates TLS upstream; trust one proxy hop so req.ip is the client.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '2mb' }));
// Per-IP rate limit on the API surface (contract §7); health probe exempt so Railway never trips it.
app.use('/api', rateLimit({ windowMs: 60_000, max: 240, skip: (req) => req.path === '/health' }));

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
app.use(express.static(publicDir, { index: false }));

// Health check (Railway + the verify step in the deploy skill).
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'architect-council', vault: vaultReady(), ts: Date.now() }));

// Bridge (hub as a member) + council broker.
app.use('/api', bridgeRouter);
app.use('/api', councilRouter);

// Pages.
app.get('/', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.get('/console', (_req, res) => res.sendFile(path.join(publicDir, 'console.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(publicDir, 'admin.html')));

const port = Number(process.env.PORT) || 8080;
app.listen(port, async () => {
  console.log(`🏛️  Architects Council on :${port}`);
  try { await initDb(); await selfRegister(); startScheduler(); console.log('✓ db ready, self registered, scheduler armed (02:45 pull / 03:00 meeting, Toronto)'); }
  catch (e) { console.error('boot warning:', (e as Error).message); }
});
