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
app.disable('x-powered-by'); // never advertise the framework/version (fingerprinting).
app.set('trust proxy', 1); // Railway terminates TLS upstream; trust one proxy hop so req.ip is the client.
// Security headers on every response (defence in depth; cheap and unconditional). The API serves
// JSON only and the site is same-origin + SITE_LIVE-gated, so the policy is deliberately strict.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY'); // no embedding anywhere -> clickjacking impossible.
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin'); // no cross-origin reads of our responses.
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()');
  // HSTS: force HTTPS for 2y incl. subdomains + preload (Railway serves TLS; site is HTTPS-only).
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  // CSP: lock the document surface. The console/admin pages are self-contained (no third-party CDNs).
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
    "connect-src 'self' https://oauth2.googleapis.com https://accounts.google.com; " +
    "frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
  next();
});
app.use(express.json({ limit: '1mb' })); // JSON cap (backlog writes can be ~200KB); brain chunks are raw octet-stream, capped separately.
// Per-IP rate limit on the API surface (contract §7); health probe exempt so Railway never trips it.
app.use('/api', rateLimit({ windowMs: 60_000, max: 240, skip: (req) => req.path === '/health' }));

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
app.use(express.static(publicDir, { index: false }));

// Health check (Railway + the verify step in the deploy skill).
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'architect-council', vault: vaultReady(), ts: Date.now() }));

// Bridge (hub as a member) + council broker.
app.use('/api', bridgeRouter);
app.use('/api', councilRouter);

// Pages -- gated by SITE_LIVE until the product is ready for market.
// Set SITE_LIVE=true in Railway env to open the site. Until then every HTML route
// returns 404 so the concept stays off the public web.
const siteLive = process.env.SITE_LIVE === 'true';
// console.html / admin.html ship self-contained inline scripts, so their CSP must permit
// 'unsafe-inline' for script. These are OWNER-ONLY dashboards behind auth (no untrusted input is
// rendered into them), so the residual risk is low. FOLLOW-UP before public launch: externalize the
// inline scripts to .js files and drop 'unsafe-inline' so every page gets the strict API-grade CSP.
const PAGE_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "connect-src 'self' https://oauth2.googleapis.com https://accounts.google.com; " +
  "frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";
const sendPage = (res: express.Response, file: string) => {
  res.setHeader('Content-Security-Policy', PAGE_CSP);
  res.sendFile(path.join(publicDir, file));
};
app.get('/', (_req, res) => siteLive ? sendPage(res, 'index.html') : res.status(404).end());
app.get('/console', (_req, res) => siteLive ? sendPage(res, 'console.html') : res.status(404).end());
app.get('/admin', (_req, res) => siteLive ? sendPage(res, 'admin.html') : res.status(404).end());
// /backlog: the owner's live backlog board. Deliberately EXEMPT from SITE_LIVE (owner request,
// 2026-06-10): the shell is a neutral noindex sign-in page that reveals nothing about the product;
// ALL data stays behind requireOwner on the API (Google ID token verified server-side, or console
// key). CSP extended ONLY for this page to allow Google Identity Services (script + button iframe).
const BACKLOG_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com; " +
  "style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "connect-src 'self' https://oauth2.googleapis.com https://accounts.google.com; " +
  "frame-src https://accounts.google.com; " +
  "frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";
app.get('/backlog', (_req, res) => {
  res.setHeader('Content-Security-Policy', BACKLOG_CSP);
  // GIS sign-in popup needs window.opener to postMessage the credential back; the global
  // COOP same-origin severs it (Arke 6a0ad501). Relax ONLY this page; CORP stays same-origin.
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.sendFile(path.join(publicDir, 'backlog.html'));
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, async () => {
  console.log(`🏛️  Architects Council on :${port}`);
  try { await initDb(); await selfRegister(); startScheduler(); console.log('✓ db ready, self registered, scheduler armed (02:45 pull / 03:00 meeting, Toronto)'); }
  catch (e) { console.error('boot warning:', (e as Error).message); }
});

// Default export so the route-auth regression test (test/route-auth.test.ts) can import the
// listening app and probe it. Importing this module starts the server (the listen above).
export default app;
