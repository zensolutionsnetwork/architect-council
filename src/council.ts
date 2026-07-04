/**
 * Routers for the Architects Council hub:
 *  - bridgeRouter  (/api/bridge/*)  : architect-council's OWN member endpoints (it's a brain too).
 *  - councilRouter (/api/council/*) : the broker — register, orchestrator relay, convos, console API.
 * Auth: members use x-bridge-secret (the hub's own COUNCIL_MEMBER_SECRET); admin/console use x-admin-token.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import { architectReply, reviewProposal, councilBrain, synthesizeOwnerReport, synthesizeMeetingTranslation, OWNER_REPORT_MODEL } from './architect.js';
import { runVoiceLoop, isVoiceRunning } from './voiceloop.js';
import { capsFromEnv, dailyBudgetExhausted, emptyTotals, addUsage, PRICES } from './cost.js';
import { projectTranscript, transcriptSha256Hex } from './protocol.js';
import { sendOwnerReportEmail, sendPasswordSetEmail } from './mailer.js';
import { captureError, cronCheckIn } from './sentry.js';
import {
  upsertMember, listMembers, setMemberActive, getMember,
  bumpDirtyStreak, resetDirtyStreak, getDirtyStreak, ownerEmailConfigured, setMemberProfile,
  getHandbookDoc, setHandbookDoc,
  consumeJoinToken, issueJoinToken,
  type Turn,
  queueOutbox, pendingOutbox, markOutboxDelivered, ackOutbox, sweepOutbox,
  setAgentBacklog, getAgentBacklogs, getRegistryVersion,
  queueEnvTask, listEnvTasks, getEnvTask, claimEnvTask, reportEnvTask, sweepEnvTasks,
  createMeeting, getMeeting, updateMeeting, listMeetings, listMeetingsForActor, setMeetingOwnerReport, deleteMeeting,
  latestRealMeetingCreatedAtUtc,
  setMeetingAttendPackSha, lastAttendedPackSha, lastAttendedMeetingCreatedAtUtc,
  recordSchedulerRun, latestSchedulerRun, addStoryEntry, getStorySince, getStorySinceSeq,
  getMeetingTranslation, saveMeetingTranslation,
  listAgentHomes, getAgentHome, initiateTransfer, getTransfer, listTransfersForMachine, saveTransferBundle, getTransferBundle, completeTransfer,
  cancelTransfer, stampStalledTransfers,
  registerMachine, listMachines, setAgentHome, deleteAgentHome,
  upsertStandard, standardExists, ratifyStandard, listStandards,
  setMeetingLedger, setMeetingManifestPins,
  setVoiceRunning, closeStaleVoiceMeetings, usdSpentTodayUtc, vaultReady, listMeetingsForDashboard,
  createBrainUpload, getBrainUpload, putBrainChunk, brainReceived, assembleBrain,
  commitBrainV2, getBrainV2Meta, getBrainV2Content, sweepBrainUploads,
  getSetting, setSetting, getRecentBoots, getMeetingTurnTarget, getMeetingUsdCeiling,
  getHierarchy, setHierarchy, listHierarchies, deleteHierarchy,
  createAgendaItem, listOpenAgenda, getAgendaItem, archiveAgendaItem, pinOpenAgendaToMeeting,
  getManagerDigest, listManagerDigests, listManagerFlags,
  getOwner, setOwnerPasswordHash, createOwnerSession, getOwnerSession, touchOwnerSession,
  deleteOwnerSession, deleteOwnerSessionsForOwner, createPasswordToken, consumePasswordToken,
} from './store.js';
import { corpusUploadContract } from './contract.js';
import { validateHierarchy, canCrossRead, type Tenant, type ShareScope } from './hierarchy.js';
import { finalizeMeetingClose } from './finalize.js';

const clip = (s: any, n: number) => String(s ?? '').slice(0, n);
/** Timing-safe credential compare (council 2026-06-07): length check + timingSafeEqual, never ===. */
function safeEqual(given: unknown, expected: string): boolean {
  const a = Buffer.from(String(given ?? ''), 'utf8'), b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
/** Generic 500: log the real reason server-side (Railway logs, owner-only), return an opaque body.
 *  Never leak internal/DB/stack detail to the client (security hardening 2026-06-10). */
function internalError(res: Response, e: unknown): void {
  try { console.error('[hub:error]', (e as Error)?.message || String(e)); } catch { /* noop */ }
  captureError('http_500', e); // best-effort external report (no-op until SENTRY_DSN is set)
  if (!res.headersSent) res.status(500).json({ error: 'internal_error' });
}
/** #52: email the owner about a dirty-tree prep (sent on EVERY dirty) — a stronger notice when the agent is
 *  demoted to listener at streak 3. Best-effort: reads the notify address, never throws into the commit path. */
async function notifyOwnerDirty(actor: string, streak: number, demoted: boolean): Promise<void> {
  try {
    const to = (await getSetting('owner_notify_email')) || ownerEmailConfigured();
    const subject = demoted
      ? `Architects Council — ${actor} demoted to listener (3 dirty preps)`
      : `Architects Council — ${actor} submitted a dirty-tree prep (${streak}/3)`;
    const body = demoted
      ? `Agent "${actor}" has now submitted 3 consecutive brain packs built from a DIRTY git working tree (uncommitted local changes). Per the #52 gate it is DEMOTED to LISTENER at the next meeting until it commits a clean pack (which resets the streak). Heads-up only — no action required.`
      : `Agent "${actor}" submitted a brain pack built from a DIRTY git working tree (uncommitted local changes). Consecutive dirty streak: ${streak}/3. At 3 it is demoted to listener until it commits clean. Heads-up only.`;
    void sendOwnerReportEmail(to, subject, body);
  } catch { /* owner alert is best-effort; never throw into the commit path */ }
}
/** #53 living handbook: the single canonical, versioned best-practices doc the hub serves. Backed by its own
 *  council_handbook table (store.getHandbookDoc/setHandbookDoc) — NOT app_settings, whose setSetting caps at 500. */
// Owner directive 2026-06-11: the hub's member/voice is KAIROS by name — persona and actor are one.
// 'architect-council' remains only as the retired pre-naming alias (its row gets a throwaway secret).
const SELF = 'kairos';
const DISPLAY_NAME = 'Arke'; // chosen name (council canon 2026-06-06); ping contract field
const CONTRACT_VERSION = '1.2'; // displayName required in ping (council 2026-06-06)
const CAPABILITIES = ['ask', 'brain', 'review', 'orchestrate', 'register', 'outbox'];

// ---------- Member side (the hub is itself a brain) -------------------------
export const bridgeRouter = Router();
function requireMemberSecret(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.COUNCIL_MEMBER_SECRET;
  if (!secret) return res.status(503).json({ error: 'bridge_not_configured', message: 'Set COUNCIL_MEMBER_SECRET to enable the hub bridge.' });
  if (!safeEqual(req.headers['x-bridge-secret'], secret)) return res.status(401).json({ error: 'unauthorized' });
  next();
}
bridgeRouter.get('/bridge/ping', requireMemberSecret, (_req, res) =>
  res.json({ ok: true, project: SELF, displayName: DISPLAY_NAME, contractVersion: CONTRACT_VERSION, capabilities: CAPABILITIES }));
bridgeRouter.post('/bridge/ask', requireMemberSecret, async (req, res) => {
  try {
    const { from, message, history } = req.body || {};
    const hist = Array.isArray(history)
      ? history.map((t: any) => ({ role: (t.speaker === SELF ? 'assistant' : 'user') as 'user' | 'assistant', content: clip(t.text, 4000) }))
      : [];
    // Collapse consecutive same-role turns so Anthropic's strict alternation holds (Zen AI's tip for N>2).
    const merged: { role: 'user' | 'assistant'; content: string }[] = [];
    for (const m of hist) {
      const prev = merged[merged.length - 1];
      if (prev && prev.role === m.role) prev.content += `\n${m.content}`;
      else merged.push({ ...m });
    }
    const last = merged[merged.length - 1];
    if (message && (!last || last.role !== 'user' || last.content !== String(message))) merged.push({ role: 'user', content: clip(message, 4000) });
    const r = await architectReply(merged, clip(from || 'peer', 60));
    res.json(r);
  } catch (e) { internalError(res, e); }
});
bridgeRouter.get('/bridge/brain', requireMemberSecret, (_req, res) => res.json({ project: SELF, brain: councilBrain(), updatedAt: new Date().toISOString() }));
// Corpus-ready signal (P1 #7, Logos ask `a53f0b7b`/`224b71ca`): a fail-closed status flag a downstream
// subscriber (Logos's chronicleCorpusGate) polls before serving. Returns whether an actor's full-code
// corpus is committed + a stable etag (the corpus sha256) for change-detection. Metadata only — never
// the corpus content (that is the gated cross-read path). Contract is frozen in docs/RESPONSE_SHAPES.md.
bridgeRouter.get('/bridge/corpus-status', async (req, res) => {
  try {
    // Auth via resolveActor (per-member secrets from the members table OR admin), NOT requireMemberSecret
    // which only accepts the hub's single env secret — that split 401'd every member except the hub-secret
    // holder (Logos report c82aa660, 2026-06-23). Mirrors brain-meta/brain-content, which already use this.
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const actor = String(req.query.actor || '');
    if (!actor) return res.status(400).json({ error: 'actor_required', message: 'query param ?actor= is required' });
    const meta = await getBrainV2Meta(actor, 'corpus');
    res.json({
      actor,
      corpus_ready: !!meta,                               // false => subscriber serves last-known-good, stale:true
      corpus_version: meta ? meta.brain_version : null,   // "<actor>@sha256:<hash>"
      built_at: meta ? meta.committed_at : null,          // server-stamped commit time (UTC ISO) or null
      etag: meta ? String(meta.sha256) : null,            // corpus content hash; compare to detect a new build
    });
  } catch (e) { internalError(res, e); }
});
bridgeRouter.post('/bridge/review', requireMemberSecret, async (req, res) => {
  try { res.json(await reviewProposal(req.body || {})); } catch (e) { internalError(res, e); }
});

// ---------- Broker side -----------------------------------------------------
export const councilRouter = Router();
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const tok = process.env.COUNCIL_ADMIN_TOKEN;
  if (!tok) return res.status(503).json({ error: 'admin_not_configured', message: 'Set COUNCIL_ADMIN_TOKEN to use the console.' });
  if (!safeEqual(req.headers['x-admin-token'], tok)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

async function pingMember(base: string, secret: string): Promise<boolean> {
  try { const r = await fetch(base.replace(/\/+$/, '') + '/api/bridge/ping', { headers: { 'x-bridge-secret': secret } }); return r.ok; }
  catch { return false; }
}

/** Register a member. Auth: a valid one-time join_token OR the admin token. Pings the member to confirm. */
councilRouter.post('/council/register', async (req, res) => {
  try {
    const { name, base_url, owner_email, rules, capabilities, secret, join_token } = req.body || {};
    if (!name || !base_url || !secret) return res.status(400).json({ error: 'name, base_url and secret are required' });
    const adminOk = !!process.env.COUNCIL_ADMIN_TOKEN && safeEqual(req.headers['x-admin-token'], process.env.COUNCIL_ADMIN_TOKEN);
    if (!adminOk) {
      if (!join_token || !(await consumeJoinToken(String(join_token)))) return res.status(401).json({ error: 'invalid_or_expired_join_token' });
    }
    const reachable = await pingMember(String(base_url), String(secret));
    await upsertMember({ name: clip(name, 60), base_url: String(base_url), owner_email, rules: clip(rules, 4000), capabilities: Array.isArray(capabilities) ? capabilities : [] }, String(secret));
    res.json({ ok: true, member_id: clip(name, 60), reachable });
  } catch (e) { internalError(res, e); }
});

councilRouter.post('/council/join-token', requireAdmin, async (req, res) => {
  try { const token = await issueJoinToken(clip((req.body || {}).label, 80) || 'invite', Number((req.body || {}).ttlHours) || 24); res.json({ ok: true, token }); }
  catch (e) { internalError(res, e); }
});

/** True if x-bridge-secret matches ANY active member's vault secret (cheap at N=3). */
async function anyMemberOk(req: Request): Promise<boolean> {
  const sec = req.headers['x-bridge-secret'] as string;
  if (!sec) return false;
  for (const mm of await listMembers()) {
    const m = await getMember(mm.name);
    if (m && safeEqual(sec, m.secret)) return true;
  }
  return false;
}
/** Directory (council 2026-06-06): admin gets full records; any member gets the sanitized
 *  { version, members: [{ project, displayName }] } it caches names against. No secrets either way. */
councilRouter.get('/council/members', async (req, res) => {
  try {
    const adminOk = !!process.env.COUNCIL_ADMIN_TOKEN && safeEqual(req.headers['x-admin-token'], process.env.COUNCIL_ADMIN_TOKEN);
    const version = await getRegistryVersion();
    if (adminOk) return res.json({ version, members: await listMembers() });
    if (!(await anyMemberOk(req))) return res.status(401).json({ error: 'unauthorized' });
    const members = (await listMembers()).map((m: any) => ({ project: m.name, displayName: m.display_name || null }));
    res.json({ version, members });
  } catch (e) { internalError(res, e); }
});
/** Cheap "did the registry change?" probe (council 2026-06-06). Same auth as the directory. */
councilRouter.get('/council/registry-version', async (req, res) => {
  try {
    const adminOk = !!process.env.COUNCIL_ADMIN_TOKEN && safeEqual(req.headers['x-admin-token'], process.env.COUNCIL_ADMIN_TOKEN);
    if (!adminOk && !(await anyMemberOk(req))) return res.status(401).json({ error: 'unauthorized' });
    res.json({ version: await getRegistryVersion() });
  } catch (e) { internalError(res, e); }
});

// ---------- Outbox (machine-to-machine notes; delivered at council open, cleared after ack) ----------
/** Resolve member auth: x-bridge-secret must match `name`'s vault secret, or x-admin-token. */
async function memberOrAdminOk(req: Request, name: string): Promise<boolean> {
  if (!!process.env.COUNCIL_ADMIN_TOKEN && safeEqual(req.headers['x-admin-token'], process.env.COUNCIL_ADMIN_TOKEN)) return true;
  const m = await getMember(name);
  return !!m && safeEqual(req.headers['x-bridge-secret'], m.secret);
}
/** A member queues a note for another member. Auth: the SENDER's own bridge secret (or admin). */
councilRouter.post('/council/outbox', async (req, res) => {
  try {
    const { from, to, topic, note, priority } = req.body || {};
    if (!from || !to || !note) return res.status(400).json({ error: 'from, to and note are required' });
    if (!(await memberOrAdminOk(req, String(from)))) return res.status(401).json({ error: 'unauthorized' });
    if (!(await getMember(String(to)))) return res.status(404).json({ error: 'unknown_member' });
    const id = await queueOutbox(clip(from, 60), clip(to, 60), clip(topic, 300), clip(note, 4000),
      ['low', 'normal', 'high', 'directive'].includes(String(priority)) ? String(priority) : 'normal');
    res.json({ ok: true, id });
  } catch (e) { internalError(res, e); }
});
/** A member reads its own queued notes (does not clear them). Auth: own secret or admin. */
councilRouter.get('/council/outbox/:member', async (req, res) => {
  try {
    const name = req.params.member;
    if (!(await memberOrAdminOk(req, name))) return res.status(401).json({ error: 'unauthorized' });
    res.json({ member: name, queued: await pendingOutbox(name) });
  } catch (e) { internalError(res, e); }
});
/** A member acks (clears) its notes — all of them, or specific ids. Auth: own secret or admin. */
councilRouter.post('/council/outbox/:member/ack', async (req, res) => {
  try {
    const name = req.params.member;
    if (!(await memberOrAdminOk(req, name))) return res.status(401).json({ error: 'unauthorized' });
    const ids = Array.isArray((req.body || {}).ids) ? (req.body.ids as any[]).map(String) : undefined;
    res.json({ ok: true, cleared: await ackOutbox(name, ids) });
  } catch (e) { internalError(res, e); }
});

// ---------- Environment channel (Cowork ↔ 3080; BRIDGE_APP_SPEC §3) ----------
// One environment hands a task to another and reads the result. Pause-INDEPENDENT: pure queue I/O,
// never starts a conversation, so it works while the council is paused. Same auth canon as everything
// else — the credential resolves the actor; no body field names the sender.
async function resolveActor(req: Request): Promise<{ actor: string; admin: boolean } | null> {
  if (!!process.env.COUNCIL_ADMIN_TOKEN && safeEqual(req.headers['x-admin-token'], process.env.COUNCIL_ADMIN_TOKEN)) return { actor: 'owner', admin: true };
  // Owner email/password session (Bearer) — ADDITIVE owner-auth path (owner-greenlit cutover 2026-06-28). A valid
  // owner Bearer authenticates as the OWNER across the whole owner surface (same authority as x-admin), so the
  // cockpit can drop x-admin entirely once COUNCIL_BEARER_DATA flips. Never impersonates a seat; the member-secret
  // path below is untouched, so the AGENT channel (brain upload, env messaging via x-bridge-secret) is unchanged.
  const bt = bearerToken(req);
  if (bt) {
    const th = sha256hex(bt);
    const sess = await getOwnerSession(th).catch(() => null);
    if (sess) { void touchOwnerSession(th, new Date(Date.now() + SESSION_TTL_MS)).catch(() => {}); return { actor: 'owner', admin: true }; }
  }
  const sec = req.headers['x-bridge-secret'] as string;
  if (!sec) return null;
  for (const mm of await listMembers()) {
    const m = await getMember(mm.name);
    if (m && safeEqual(sec, m.secret)) return { actor: m.name, admin: false };
  }
  return null;
}
/** Enqueue a task for another environment. Sender = whoever authenticated (never a body field). */
councilRouter.post('/env/task', async (req, res) => {
  try {
    const actor = await resolveActor(req);
    if (!actor) return res.status(401).json({ error: 'unauthorized' });
    const { to, kind, title, payload, priority } = req.body || {};
    if (!to) return res.status(400).json({ error: 'to is required' });
    // Directive channel (contract 2.x): a `directive` is a BINDING owner order, not a peer message.
    // OWNER-ONLY to create — members never direct each other (member-to-member asks stay kind 'message').
    // Keeps the authority line clean: only the owner directs; agents teach, propose, and report.
    if (String(kind) === 'directive' && !actor.admin) {
      return res.status(403).json({ error: 'directive_owner_only', message: 'only the owner may issue directives; use kind "message" for member-to-member asks' });
    }
    if (!(await getMember(String(to)))) return res.status(404).json({ error: 'unknown_recipient' });
    const id = await queueEnvTask(actor.actor, clip(to, 60), clip(kind, 40) || 'task', clip(title, 300),
      payload ?? {}, ['low', 'normal', 'high'].includes(String(priority)) ? String(priority) : 'normal');
    res.json({ ok: true, id });
  } catch (e) { internalError(res, e); }
});
/** The recipient polls its inbox. Auth: that agent's secret (or admin). */
councilRouter.get('/env/tasks', async (req, res) => {
  try {
    const forA = String(req.query.for || '');
    if (!forA) return res.status(400).json({ error: 'for is required' });
    if (!(await memberOrAdminOk(req, forA))) return res.status(401).json({ error: 'unauthorized' });
    res.json({ for: forA, tasks: await listEnvTasks(forA) });
  } catch (e) { internalError(res, e); }
});
/** Optimistic claim — first poller to flip queued→claimed wins, so a task runs at most once. */
councilRouter.post('/env/task/:id/claim', async (req, res) => {
  try {
    const t = await getEnvTask(req.params.id);
    if (!t) return res.status(404).json({ error: 'not_found' });
    if (!(await memberOrAdminOk(req, t.to_actor))) return res.status(401).json({ error: 'unauthorized' });
    res.json({ ok: true, claimed: await claimEnvTask(t.id, t.to_actor) });
  } catch (e) { internalError(res, e); }
});
/** Completion report from the recipient. */
councilRouter.post('/env/task/:id/report', async (req, res) => {
  try {
    const t = await getEnvTask(req.params.id);
    if (!t) return res.status(404).json({ error: 'not_found' });
    if (!(await memberOrAdminOk(req, t.to_actor))) return res.status(401).json({ error: 'unauthorized' });
    const status = (req.body || {}).status === 'error' ? 'error' : 'done';
    res.json({ ok: true, updated: await reportEnvTask(t.id, t.to_actor, status, clip((req.body || {}).result, 16000)) });
  } catch (e) { internalError(res, e); }
});
/** Read one task + its result. Auth: either involved actor, or admin. */
councilRouter.get('/env/task/:id', async (req, res) => {
  try {
    const t = await getEnvTask(req.params.id);
    if (!t) return res.status(404).json({ error: 'not_found' });
    const actor = await resolveActor(req);
    if (!actor || (!actor.admin && actor.actor !== t.from_actor && actor.actor !== t.to_actor)) return res.status(401).json({ error: 'unauthorized' });
    res.json(t);
  } catch (e) { internalError(res, e); }
});

// ---------- Living backlog + owner sign-in (Arke's super-admin; mirrors Nova's model) ----------
// Auth: x-admin-token (console key) OR a Google ID token (header x-google-id-token) once
// GOOGLE_CLIENT_ID is set on Railway — verified server-side, owner email only (no static token to remember).
const OWNER_GOOGLE_EMAIL = () => process.env.OWNER_GOOGLE_EMAIL || 'matpay@zen-solutions.net';
async function googleOwnerOk(req: Request): Promise<boolean> {
  const idToken = req.headers['x-google-id-token'] as string;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!idToken || !clientId) return false;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
    if (!r.ok) return false;
    const d: any = await r.json();
    return d.aud === clientId && d.email === OWNER_GOOGLE_EMAIL() && (d.email_verified === 'true' || d.email_verified === true);
  } catch { return false; }
}
// ---- Owner email/password auth helpers (owner directive 2026-06-25) ---------
// Password hashing uses Node's built-in scrypt (no native dep added to the Railway build). Tokens (session +
// emailed set-password) are opaque random; only their sha256 hash is ever stored. NEVER log a password or token.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30-day sliding owner session
const PW_TOKEN_TTL_MS = 15 * 60 * 1000;          // 15-min one-time set-password token
const MIN_PW_LEN = 12;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };
// (sha256hex is defined once, later in this file, and reused here at request time.)
function newToken(): string { return crypto.randomBytes(32).toString('base64url'); }
function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(pw, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${dk.toString('hex')}`;
}
function verifyPassword(pw: string, stored: string | null): boolean {
  if (!stored) return false;
  try {
    const p = stored.split('$'); // scrypt$N$r$p$salt$hash
    if (p[0] !== 'scrypt') return false;
    const N = Number(p[1]), r = Number(p[2]), pp = Number(p[3]);
    const salt = Buffer.from(p[4], 'hex'); const hash = Buffer.from(p[5], 'hex');
    const dk = crypto.scryptSync(pw, salt, hash.length, { N, r, p: pp, maxmem: SCRYPT.maxmem });
    return dk.length === hash.length && crypto.timingSafeEqual(dk, hash);
  } catch { return false; }
}
function bearerToken(req: Request): string | null {
  const h = req.headers['authorization'];
  if (!h || typeof h !== 'string') return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
// Login timing equalization: always perform exactly ONE scrypt verify — even when the email/owner/password
// doesn't exist — so response latency never reveals whether the submitted email is the owner's. Cached once.
let DUMMY_PW_HASH = '';
function dummyPwHash(): string { if (!DUMMY_PW_HASH) DUMMY_PW_HASH = hashPassword(crypto.randomBytes(24).toString('hex')); return DUMMY_PW_HASH; }

async function requireOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  const tok = process.env.COUNCIL_ADMIN_TOKEN;
  // 1) console key, 2) Google owner ID token, 3) owner email/password session (Bearer) — any one passes.
  if (tok && safeEqual(req.headers['x-admin-token'], tok)) return next();
  if (await googleOwnerOk(req)) return next();
  const bt = bearerToken(req);
  if (bt) {
    const th = sha256hex(bt);
    const sess = await getOwnerSession(th).catch(() => null);
    if (sess) { void touchOwnerSession(th, new Date(Date.now() + SESSION_TTL_MS)).catch(() => {}); return next(); }
  }
  // Fail-closed (council 2026-06-07): 503 ONLY when no owner-auth mechanism is usable at all — a console token,
  // a Google client, or an owner that has set a password (so a session path exists). Otherwise plain 401.
  const owner = await getOwner().catch(() => null);
  if (!tok && !process.env.GOOGLE_CLIENT_ID && !(owner && owner.passwordHash)) { res.status(503).json({ error: 'owner_auth_not_configured' }); return; }
  res.status(401).json({ error: 'unauthorized' });
}

// ---- Owner auth endpoints (owner directive 2026-06-25; contract docs/OWNER_AUTH_CONTRACT_DRAFT.md) ----------
// NO account creation: the single owner is seeded from OWNER_EMAIL. Password is established via a one-time token
// emailed to that inbox. login/request-password/set-password are PUBLIC entry points (they carry their own
// credential/token); logout/me require a valid session. Generic errors only — never reveal which field was wrong.
councilRouter.post('/auth/request-password', async (req, res) => {
  try {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const owner = await getOwner();
    if (owner && email === owner.email) {
      const raw = newToken();
      await createPasswordToken(sha256hex(raw), owner.id, new Date(Date.now() + PW_TOKEN_TTL_MS));
      const base = (process.env.APP_BASE_URL || 'https://architectscouncil.com').replace(/\/$/, '');
      const link = `${base}/set-password?token=${encodeURIComponent(raw)}`;
      void sendPasswordSetEmail(owner.email, raw, link).catch(() => {});
    }
    // ALWAYS 200 — only ever emails the one fixed address, so this leaks nothing (no enumeration).
    res.json({ ok: true });
  } catch (e) { internalError(res, e); }
});
councilRouter.post('/auth/set-password', async (req, res) => {
  try {
    const b = req.body || {};
    const token = String(b.token || '');
    const newPassword = String(b.newPassword || '');
    if (!token) return res.status(400).json({ error: 'token_required' });
    if (newPassword.length < MIN_PW_LEN) return res.status(400).json({ error: 'weak_password', message: `min ${MIN_PW_LEN} chars` });
    const consumed = await consumePasswordToken(sha256hex(token));
    if (!consumed) return res.status(400).json({ error: 'invalid_or_expired_token' });
    await setOwnerPasswordHash(consumed.ownerId, hashPassword(newPassword));
    await deleteOwnerSessionsForOwner(consumed.ownerId); // rotating the password ends other sessions
    const owner = await getOwner();
    const raw = newToken(); const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await createOwnerSession(sha256hex(raw), consumed.ownerId, expiresAt);
    res.json({ ok: true, owner: { id: consumed.ownerId, email: owner ? owner.email : null }, token: raw, expiresAt: expiresAt.toISOString() });
  } catch (e) { internalError(res, e); }
});
councilRouter.post('/auth/login', async (req, res) => {
  try {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const pw = String(b.password || '');
    const owner = await getOwner();
    // Verify against the real hash only when email+owner+password all line up; otherwise verify against a
    // dummy hash so the response time can't distinguish "wrong email" from "wrong password" (no email oracle).
    const realTarget = (owner && email === owner.email && owner.passwordHash) ? owner.passwordHash : null;
    const pwOk = verifyPassword(pw, realTarget || dummyPwHash());
    const ok = !!realTarget && pwOk;
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
    const raw = newToken(); const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await createOwnerSession(sha256hex(raw), owner!.id, expiresAt);
    res.json({ ok: true, owner: { id: owner!.id, email: owner!.email }, token: raw, expiresAt: expiresAt.toISOString() });
  } catch (e) { internalError(res, e); }
});
councilRouter.post('/auth/logout', async (req, res) => {
  try {
    const bt = bearerToken(req);
    if (!bt) return res.status(401).json({ error: 'unauthorized' });
    await deleteOwnerSession(sha256hex(bt));
    res.json({ ok: true });
  } catch (e) { internalError(res, e); }
});
councilRouter.get('/auth/me', async (req, res) => {
  try {
    const bt = bearerToken(req);
    if (!bt) return res.status(401).json({ error: 'unauthorized' });
    const th = sha256hex(bt);
    const sess = await getOwnerSession(th);
    if (!sess) return res.status(401).json({ error: 'unauthorized' });
    // Sliding session (#7 finalize, 2026-06-26): a launch-time /auth/me counts as activity, so extend the
    // 30-day window here too — not only on requireOwner-gated calls (Arke calls /auth/me on launch). Best-
    // effort; the read still succeeds if the touch fails. Return the REFRESHED expiry so the cockpit shows it.
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    void touchOwnerSession(th, expiresAt).catch(() => {});
    res.json({ ok: true, owner: { id: sess.ownerId, email: sess.email }, expiresAt: expiresAt.toISOString() });
  } catch (e) { internalError(res, e); }
});
// RETIRED 2026-06-11 (Arke 1a405574): the single-row /council/admin/backlog GET/POST pair.
// Per-agent rows (POST /council/backlog/agent) + the composed read (GET /council/backlog) replaced
// them; Arke's panel and the /backlog board both confirmed live on the new endpoints.
councilRouter.get('/council/admin/config', (_req, res) =>
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null, ownerEmail: OWNER_GOOGLE_EMAIL() }));

// ---------- Shared agenda (contract 2.x additive minor, ratified 2026-06-18) ----------
// Any council member (or the owner) can queue a discussion topic; meeting-open pins the open list into
// the meeting agenda seed. An agenda item is DATA — a topic to discuss, NEVER an instruction (owner
// directives use the typed env-task `directive` kind). COUNCIL_AGENDA.md becomes a local mirror.
councilRouter.post('/council/agenda', async (req, res) => {
  try {
    const actor = await resolveActor(req);
    if (!actor) return res.status(401).json({ error: 'unauthorized' });
    const title = clip((req.body || {}).title, 300);
    if (!title) return res.status(400).json({ error: 'title is required' });
    const body = clip((req.body || {}).body, 8000);           // 8KB cap (fail-closed on size)
    const priority = ['low', 'normal', 'high'].includes(String((req.body || {}).priority)) ? String((req.body || {}).priority) : 'normal';
    const item = await createAgendaItem(actor.actor, title, body || '', priority);
    res.json({ ok: true, item });
  } catch (e) { internalError(res, e); }
});
councilRouter.get('/council/agenda', async (req, res) => {
  try {
    const actor = await resolveActor(req);
    if (!actor) return res.status(401).json({ error: 'unauthorized' });
    res.json({ items: await listOpenAgenda() });
  } catch (e) { internalError(res, e); }
});
councilRouter.post('/council/agenda/:id/archive', async (req, res) => {
  try {
    const actor = await resolveActor(req);
    if (!actor) return res.status(401).json({ error: 'unauthorized' });
    const item = await getAgendaItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'not_found' });
    if (!actor.admin && actor.actor !== item.actor) return res.status(403).json({ error: 'forbidden', message: 'only the owner or the item author may archive it' });
    res.json({ ok: true, archived: await archiveAgendaItem(req.params.id) });
  } catch (e) { internalError(res, e); }
});

// ---------- Chronicle story repository (owner 2026-06-24) ----------
// An append-only per-agent log of "my story since I last connected". Every agent POSTs an entry at prep;
// Logos (the chronicler) reads everything since the meeting HE last attended on reconnect — so an agent the
// readiness gate (#36) excluded from a meeting still has its evolution captured, and the chronicle has no
// gaps across missed meetings. A story entry is DATA (a narrative), never an instruction. Auth: member
// secret (x-bridge-secret) or owner (x-admin-token); the entry is always attributed to the authenticated
// caller, never a body field. Contract frozen in docs/RESPONSE_SHAPES.md.
councilRouter.post('/council/story', async (req, res) => {
  try {
    const a = await resolveActor(req);
    if (!a) return res.status(401).json({ error: 'unauthorized' });
    const b = req.body || {};
    const content = clip(b.content, 16000);
    if (!content) return res.status(400).json({ error: 'content is required' });
    const meetingId = clip(b.meetingId, 80) || null;
    // Optional author metadata (Logos f6164bf6): title + tags. Absent → null/[], never synthesized.
    const title = clip(b.title, 120) || null;
    const tags = Array.isArray(b.tags) ? b.tags.map((t: any) => clip(t, 40)).filter((t: string) => t).slice(0, 20) : [];
    // Provenance is DERIVED server-side from the author's committed brain at write time (authoritative; same
    // pack sha #36 keys on). Absent brain → null, recorded absent. Best-effort: a meta read miss never fails the post.
    let packSha: string | null = null, corpusSha: string | null = null, builtAt: string | null = null;
    try { const pm = await getBrainV2Meta(a.actor, 'pack'); if (pm) { packSha = String(pm.sha256); builtAt = pm.committed_at || null; } } catch { /* absent → null */ }
    try { const cm = await getBrainV2Meta(a.actor, 'corpus'); if (cm) { corpusSha = String(cm.sha256); builtAt = cm.committed_at || builtAt; } } catch { /* absent → null */ }
    const r = await addStoryEntry(a.actor, content, meetingId, { title, tags, packSha, corpusSha, builtAt });
    // seq (#39) is the canonical monotonic cursor handle = the entry id as a decimal string; id retained for back-compat.
    res.json({ ok: true, seq: r.id, id: r.id, actor: a.actor, createdAt: r.createdAt, meetingId, title, tags, packSha, corpusSha, builtAt });
  } catch (e) { internalError(res, e); }
});
councilRouter.get('/council/story', async (req, res) => {
  try {
    const a = await resolveActor(req);
    if (!a) return res.status(401).json({ error: 'unauthorized' });
    const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : 500;
    // Cursor precedence (#39): the canonical half-open-exclusive SEQ cursor wins when `?sinceSeq=` is given;
    // it is validated decimal (Row-3) here at the boundary, BigInt-checked, then read as `seq > sinceSeq`.
    // Otherwise the legacy timestamp path: an explicit valid `since` ISO, else the caller's last-attended
    // meeting (the natural "since I last connected"). The owner, who attends no meeting, defaults to the full log.
    const rawSeq = String(req.query.sinceSeq || '');
    if (rawSeq) {
      if (!/^(0|[1-9][0-9]*)$/.test(rawSeq)) return res.status(400).json({ error: 'bad_sinceSeq' });
      try { BigInt(rawSeq); } catch { return res.status(400).json({ error: 'bad_sinceSeq' }); }
      const entries = await getStorySinceSeq(rawSeq, limit);
      return res.json({ ok: true, sinceSeq: rawSeq, since: null, count: entries.length, entries });
    }
    const rawSince = String(req.query.since || '');
    let since: string | null = (rawSince && !Number.isNaN(Date.parse(rawSince))) ? rawSince : null;
    if (!since) { try { since = await lastAttendedMeetingCreatedAtUtc(a.actor); } catch { since = null; } }
    const entries = await getStorySince(since, limit);
    res.json({ ok: true, sinceSeq: null, since, count: entries.length, entries });
  } catch (e) { internalError(res, e); }
});

// ---------- Adopted-standards record (#40, owner ruling 2026-06-25) ----------
// DOCTRINE (owner 2026-06-25): a council meeting VOICE has no authority — it only PROPOSES. A standard is
// ADOPTED only when each project's sovereign session re-uploads its own ratification. So: POST /standards
// records a PROPOSAL (carries provenance, NO authority); POST /standards/:slug/ratify records ONE project's
// accept/reject (member-authenticated as its own seat, or owner ON BEHALF OF a named seat to log a decision
// that project already made in its own session — never to manufacture a voice's authority); GET /standards
// lists each standard with its per-project ratification state. Contract pinned in docs/RESPONSE_SHAPES.md.
const STD_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function standardStatus(ratifications: any[]): { adoptedBy: string[]; rejectedBy: string[]; status: string } {
  const adoptedBy = MEETING_DEFAULT.filter((a) => ratifications.some((r) => r.actor === a && r.decision === 'accept'));
  const rejectedBy = MEETING_DEFAULT.filter((a) => ratifications.some((r) => r.actor === a && r.decision === 'reject'));
  const status = adoptedBy.length === MEETING_DEFAULT.length ? 'adopted'
    : (adoptedBy.length > 0 || rejectedBy.length > 0) ? 'partial' : 'proposed';
  return { adoptedBy, rejectedBy, status };
}
councilRouter.post('/council/standards', async (req, res) => {
  try {
    const a = await resolveActor(req);
    if (!a) return res.status(401).json({ error: 'unauthorized' });
    const b = req.body || {};
    const slug = clip(b.slug, 80);
    if (!slug || !STD_SLUG_RE.test(slug)) return res.status(400).json({ error: 'bad_slug' });
    const statement = clip(b.statement, 8000);
    if (!statement) return res.status(400).json({ error: 'statement is required' });
    const title = clip(b.title, 160) || null;
    const proposedMeetingId = clip(b.proposedMeetingId, 80) || null;
    const proposedBy = a.admin ? 'owner' : (a.actor === 'architect-council' ? 'kairos' : a.actor);
    const r = await upsertStandard(slug, title, statement, proposedMeetingId, proposedBy);
    res.json({ ok: true, seq: r.id, slug: r.slug, proposedBy, proposedMeetingId,
      note: 'recorded as PROPOSED — no authority until each project ratifies from its own session' });
  } catch (e) { internalError(res, e); }
});
councilRouter.post('/council/standards/:slug/ratify', async (req, res) => {
  try {
    const a = await resolveActor(req);
    if (!a) return res.status(401).json({ error: 'unauthorized' });
    const slug = clip(req.params.slug, 80);
    if (!slug || !(await standardExists(slug))) return res.status(404).json({ error: 'no_such_standard' });
    const b = req.body || {};
    const decision = String(b.decision || '');
    if (decision !== 'accept' && decision !== 'reject') return res.status(400).json({ error: 'bad_decision' });
    const note = clip(b.note, 2000) || null;
    // Attribution: a member ratifies AS ITS OWN seat (the architect-council house secret maps to the kairos
    // seat). The owner (admin) MUST name a canonical seat in `actor` — used to log a decision a project already
    // made in its own session (e.g. seeding Kairos's ACCEPT). The owner cannot ratify as an abstract "owner".
    let actor: string;
    if (a.admin) {
      if (typeof b.actor !== 'string' || !MEETING_DEFAULT.includes(b.actor)) return res.status(400).json({ error: 'actor_required', message: 'owner must name a canonical seat in `actor`' });
      actor = b.actor;
    } else {
      actor = a.actor === 'architect-council' ? 'kairos' : a.actor;
    }
    const r = await ratifyStandard(slug, actor, decision as 'accept' | 'reject', note);
    res.json({ ok: true, ...r });
  } catch (e) { internalError(res, e); }
});
councilRouter.get('/council/standards', async (req, res) => {
  try {
    const a = await resolveActor(req);
    if (!a) return res.status(401).json({ error: 'unauthorized' });
    const standards = (await listStandards()).map((s) => ({ ...s, ...standardStatus(s.ratifications) }));
    res.json({ ok: true, count: standards.length, standards });
  } catch (e) { internalError(res, e); }
});

// ---------- Layer-1 Manager (owner 2026-06-18) — owner-gated read surface ----------
// Compute runs at meeting-close (src/manager.ts); these endpoints expose it as clean JSON. PORTABLE:
// Arke's Supervisor app consumes these now (display) and may eventually own the computation itself.
councilRouter.get('/council/manager/digests', requireOwner, async (_req, res) => {
  try { res.json({ digests: await listManagerDigests(30) }); } catch (e) { internalError(res, e); }
});
councilRouter.get('/council/manager/flags', requireOwner, async (_req, res) => {
  try { res.json({ flags: await listManagerFlags() }); } catch (e) { internalError(res, e); }
});
councilRouter.get('/council/manager/digest/:meetingId', requireOwner, async (req, res) => {
  try {
    const d = await getManagerDigest(req.params.meetingId);
    if (!d) return res.status(404).json({ error: 'not_found' });
    res.json(d);
  } catch (e) { internalError(res, e); }
});

/** Security self-check (council locked contract 2026-06-07): owner-gated, booleans/tiers ONLY — no
 *  hostnames, no secrets, nothing identifying crosses the wire. Future family aggregator polls this. */
councilRouter.get('/council/security-selfcheck', requireOwner, (_req, res) => {
  let host = '', sslmode: string | null = null;
  try { const u = new URL(process.env.DATABASE_URL || ''); host = u.hostname; sslmode = u.searchParams.get('sslmode'); } catch { /* unparseable -> defaults below */ }
  res.json({
    db_public_reachable: !!host && !host.endsWith('.railway.internal') && !host.endsWith('.internal'),
    sslmode: sslmode || 'unspecified',
    owner_auth_configured: !!(process.env.COUNCIL_ADMIN_TOKEN || process.env.GOOGLE_CLIENT_ID),
    // Hub has NO public model surface (its brain answers only behind x-bridge-secret); council model env-pinned with explicit default.
    model_pinned: { public: true, council: true },
  });
});

// ---------- Nightly schedule (America/Toronto): 02:45 brain pull, 03:00 council meeting ----------
// Owner's daily cycle: 02:00/02:15/02:30 close rituals (Cowork side) write handoffs + queue outboxes,
// 02:45 brain pull, 03:00 meeting, wrap-up writes per-member homework SUGGESTIONS, mornings 05:30/06:00/06:30 implement.
const TZ = 'America/Toronto';
let lastSweepDate = '';
function torontoParts(): { date: string; hhmm: string } {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value || '00';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hhmm: `${g('hour')}:${g('minute')}` };
}
// ---------- Meeting orchestrator (docs/MEETING_PROTOCOL.md, 2026-06-08) ------
// Poll-based turn-taking among the chosen-name actors. Own state machine; pause-independent.
const MEETING_DEFAULT = ['kairos', 'arke', 'nova', 'logos'];
function meetingView(m: any, actor: string | null) {
  const cur = m.participants[m.turn_index] || null;
  return { id: m.id, phase: m.phase, round: m.round, turnIndex: m.turn_index, currentActor: cur,
    cap: m.turn_cap, turnCap: m.turn_cap /* alias for the app (Arke 03eb0537) */, turnsUsed: m.turns_used, participants: m.participants, agenda: m.agenda,
    roles: m.roles || {}, dryRun: !!m.dry_run, brainVersions: m.brain_versions || {}, manifestPins: m.manifest_pins || {},
    turnTimeoutSec: m.turn_timeout_sec, turnStartedAt: m.turn_started_at,
    transcript: m.transcript, report: m.report || null, yourTurn: !!actor && actor === cur };
}
const roleOf = (m: any, actor: string): string => String((m.roles || {})[actor] || 'speak');
// Lazy turn-timeout (Arke refinement 1): on access, auto-PASS turns whose deadline elapsed so an
// absent agent cannot stall a round. Poll-native — the next poll clears any backlog.
async function autoExpire(m: any): Promise<any> {
  let guard = 0;
  while (m && m.phase === 'rounds' && guard++ <= m.participants.length + 1) {
    const cur = m.participants[m.turn_index];
    const isListen = roleOf(m, cur) === 'listen'; // observers (Arke rooms) never get a speaking turn
    const started = Date.parse(m.turn_started_at || '') || Date.now();
    const timedOut = Date.now() - started > (m.turn_timeout_sec || 600) * 1000;
    if (!isListen && !timedOut) break;
    const turns = m.transcript.concat([{ actor: cur, kind: 'pass', auto: true, reason: isListen ? 'listen' : 'timeout', at: new Date().toISOString() }]);
    const ti = (m.turn_index + 1) % m.participants.length;
    const round = m.round + (ti === 0 ? 1 : 0);
    const used = m.turns_used + 1;
    let phase = m.phase;
    if (used >= m.turn_cap) phase = 'report';
    const lastRound = turns.slice(-m.participants.length);
    if (lastRound.length === m.participants.length && lastRound.every((t: any) => t.kind === 'pass')) phase = 'report';
    await updateMeeting(m.id, { transcript: turns, turn_index: ti, round, turns_used: used, phase, touchTurn: true });
    m = await getMeeting(m.id);
  }
  return m;
}
councilRouter.post('/meeting/open', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a || !a.admin) return res.status(401).json({ error: 'unauthorized' });
    const b = req.body || {};
    const participants = Array.isArray(b.participants) && b.participants.length ? Array.from(new Set(b.participants.map((x: any) => clip(x, 60)))) : MEETING_DEFAULT.slice();
    // Default hard cap 50 turns (owner directive 2026-06-11) — overridable per meeting from the
    // app via body.turnCap, or globally via MEETING_TURN_CAP_DEFAULT (read at call time, not module top).
    const envDefault = Number(process.env.MEETING_TURN_CAP_DEFAULT);
    const capDefault = Number.isFinite(envDefault) && envDefault > 0 ? Math.min(envDefault, 1000) : 50;
    const cap = Number(b.turnCap) > 0 ? Math.min(Number(b.turnCap), 1000) : capDefault;
    const tto = Number(b.turnTimeoutSec) > 0 ? Math.min(Number(b.turnTimeoutSec), 86400) : 600;
    // Rooms (Arke 2026-06-09): per-actor roles; validate against participants, at most one facilitator.
    const ROLE_SET = ['listen', 'facilitate', 'speak', 'teach', 'learn', 'review'];
    const roles: Record<string, string> = {};
    const rawRoles = (b.roles && typeof b.roles === 'object') ? b.roles : {};
    for (const p of participants) { const r = String(rawRoles[p] || '').toLowerCase(); if (ROLE_SET.includes(r)) roles[p] = r; }
    if (Object.values(roles).filter((r) => r === 'facilitate').length > 1) return res.status(400).json({ error: 'too_many_facilitators', message: 'at most one facilitator per room' });
    const dryRun = b.dryRun === true || b.test === true;
    // Pin each participant's committed brain at meeting OPEN (contract b + brain-manifest 2.1, corpus-contract §6).
    // brain_versions stays the back-compat per-kind (corpus) string Arke's app reads; manifest_pins records the
    // THREE-STATE atomic-pair check — paired | stale | none — with a reason, surfaced in the owner report
    // (Logos rider: a manifest-less or stale-manifest seat is never silently trusted).
    const brainVersions: Record<string, any> = {};
    const manifestPins: Record<string, any> = {};
    const attendPackSha: Record<string, string | null> = {}; // #36: pack sha each seat carried at open
    for (const p of participants) {
      let corpusMeta: any = null, packMeta: any = null;
      try { corpusMeta = await getBrainV2Meta(p, 'corpus'); } catch { /* absent */ }
      try { packMeta = await getBrainV2Meta(p, 'pack'); } catch { /* absent */ }
      brainVersions[p] = corpusMeta ? corpusMeta.brain_version : null;
      attendPackSha[p] = packMeta ? String(packMeta.sha256) : null;
      let pin: any = { state: 'none', reason: 'no_manifest' };
      try {
        const manc = await getBrainV2Content(p, 'manifest');
        if (manc) {
          let mani: any = null;
          try { mani = JSON.parse(manc.content.toString('utf8')); } catch { mani = null; }
          if (!mani || typeof mani !== 'object') {
            pin = { state: 'none', reason: 'manifest_unreadable' };
          } else {
            const wantPack = String(mani.pack_sha256 || '').toLowerCase();
            const wantCorpus = String(mani.corpus_sha256 || '').toLowerCase();
            const livePack = packMeta ? String(packMeta.sha256).toLowerCase() : null;
            const liveCorpus = corpusMeta ? String(corpusMeta.sha256).toLowerCase() : null;
            if (livePack && liveCorpus && wantPack === livePack && wantCorpus === liveCorpus) {
              // Verified atomic pair — pin pack+corpus together (stale ≠ torn: a re-uploaded kind makes it stale).
              // #28: manifestAt is the SERVER-stamped commit time (manc.meta.committed_at), never the client
              // wall-clock value inside the manifest JSON (mani.committed_at) — client value is last-resort only.
              pin = { state: 'paired', packSha256: livePack, corpusSha256: liveCorpus, manifestAt: manc.meta.committed_at || mani.committed_at || null };
            } else {
              pin = { state: 'stale', reason: 'manifest_superseded', packSha256: livePack, corpusSha256: liveCorpus };
            }
          }
        }
      } catch { pin = { state: 'none', reason: 'manifest_lookup_error' }; }
      manifestPins[p] = pin;
      if (pin.state !== 'paired') {
        try { console.warn(`[hub:manifest2.1] seat ${p} not atomically paired at open: state=${pin.state} reason=${pin.reason || ''}`); } catch { /* noop */ }
      }
    }
    const id = crypto.randomUUID();
    // Agenda-in-hub (contract 2.x): compose the owner/caller agenda WITH the open queued items, and pin
    // them to this meeting (marks them 'discussed' so the next meeting won't re-pin). Skip on dryRun so a
    // test open never consumes real agenda items. Best-effort: a pin failure never blocks the open.
    let agendaText = clip(b.agenda, 8000) || '';
    if (!dryRun) {
      try {
        const pinned = await pinOpenAgendaToMeeting(id);
        if (pinned.length) {
          const lines = pinned.map((it: any, i: number) => `${i + 1}. [${it.actor}${it.priority === 'high' ? '/high' : ''}] ${it.title}${it.body ? ' — ' + it.body : ''}`);
          const block = 'Queued agenda items (hub):\n' + lines.join('\n');
          agendaText = (agendaText ? agendaText + '\n\n' + block : block).slice(0, 8000);
        }
      } catch (e) { console.warn('[hub:agenda] pin open items failed (non-fatal): ' + (e as Error).message); }
    }
    await createMeeting(id, agendaText, participants, cap, a.actor, 'rounds', tto, roles, dryRun, brainVersions);
    try { await setMeetingManifestPins(id, manifestPins); } catch { /* best-effort: pins are a sibling record, never fail the open */ }
    if (!dryRun) { try { await setMeetingAttendPackSha(id, attendPackSha); } catch { /* best-effort: the #36 freshness anchor, never fail the open */ } }
    res.json({ ok: true, meetingId: id, ...meetingView(await getMeeting(id), a.actor) });
  } catch (e) { internalError(res, e); }
});
councilRouter.get('/meeting/:id/state', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const m = await getMeeting(req.params.id); if (!m) return res.status(404).json({ error: 'not_found' });
    if (!a.admin && !m.participants.includes(a.actor)) return res.status(403).json({ error: 'not_a_participant' });
    res.json(meetingView(await autoExpire(m), a.actor));
  } catch (e) { internalError(res, e); }
});
councilRouter.post('/meeting/:id/say', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    let m = await getMeeting(req.params.id); if (!m) return res.status(404).json({ error: 'not_found' });
    // Owner interjection — the human chair's voice (Mathieu via Arke 2026-06-09). Owner token + {as:"owner"};
    // inserts an out-of-rotation owner turn into ANY live meeting WITHOUT consuming a turn, changing
    // currentActor, or resetting the turn timer. Agents see it as a chair note in their next turn's context.
    if (a.admin && (req.body || {}).as === 'owner') {
      if (m.phase !== 'rounds') return res.status(409).json({ error: 'meeting_not_live', phase: m.phase });
      const ib = req.body || {};
      const text = clip((ib.payload && ib.payload.text) ?? ib.text ?? '', 8000);
      const note = { actor: 'owner', kind: 'message', payload: { text, from: 'owner' }, chair: true, at: new Date().toISOString() };
      await updateMeeting(m.id, { transcript: (m.transcript || []).concat([note]) });
      return res.json({ ok: true, interjected: true, currentActor: m.participants[m.turn_index] || null, turnsUsed: m.turns_used });
    }
    m = await autoExpire(m);
    if (m.phase !== 'rounds') return res.status(409).json({ error: 'not_in_rounds', phase: m.phase });
    const b = req.body || {};
    // Owner-drive TEST MODE (Mathieu via Arke 2026-06-09): on a dry-run meeting ONLY, the owner token may
    // post a turn AS a named participant, so the app can run a full test meeting with no per-agent runtimes
    // online. Strictly gated: owner token + dryRun + a real participant. Normal meetings keep per-actor auth.
    let speaker = a.actor;
    if (a.admin && b.as) {
      if (!m.dry_run) return res.status(403).json({ error: 'owner_drive_requires_dryrun', message: 'owner may only speak-as on a dryRun meeting' });
      if (!m.participants.includes(String(b.as))) return res.status(400).json({ error: 'as_not_a_participant', as: b.as });
      speaker = String(b.as);
    }
    const cur = m.participants[m.turn_index];
    if (speaker !== cur) return res.status(409).json({ error: 'not_your_turn', currentActor: cur });
    if (roleOf(m, speaker) === 'listen') return res.status(403).json({ error: 'listen_only', message: 'observers do not take speaking turns' });
    const kind = b.pass ? 'pass' : 'speak';
    const turns = m.transcript.concat([{ actor: speaker, kind, payload: kind === 'speak' ? (b.payload ?? {}) : undefined, done: b.done === true, ownerDriven: speaker !== a.actor ? true : undefined, at: new Date().toISOString() }]);
    const ti = (m.turn_index + 1) % m.participants.length;
    const round = m.round + (ti === 0 ? 1 : 0);
    const used = m.turns_used + 1;
    let phase = m.phase;
    if (used >= m.turn_cap) phase = 'report';
    const lastRound = turns.slice(-m.participants.length);
    if (lastRound.length === m.participants.length && lastRound.every((t: any) => t.kind === 'pass')) phase = 'report';
    await updateMeeting(m.id, { transcript: turns, turn_index: ti, round, turns_used: used, phase, touchTurn: true });
    res.json({ ok: true, nextActor: m.participants[ti], phase, round });
  } catch (e) { internalError(res, e); }
});
councilRouter.post('/meeting/:id/close', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a || !a.admin) return res.status(401).json({ error: 'unauthorized' });
    const m = await getMeeting(req.params.id); if (!m) return res.status(404).json({ error: 'not_found' });
    // Converged onto the shared finalizer (src/finalize.ts, 2026-06-15) so the owner /close route and the
    // autonomous voice loop finish a meeting IDENTICALLY: closed_at + storyUpdates routed to Logos +
    // owner report synth/store/email + ledger charge + the 2.1 manifest-pin line. Idempotent on closed_at —
    // a re-close on an already-closed meeting never re-synthesizes or re-emails (returns alreadyClosed).
    const r = await finalizeMeetingClose(m, { report: clip((req.body || {}).report, 16000) });
    res.json({ ok: r.ok, dryRun: r.dryRun, alreadyClosed: r.alreadyClosed, storyUpdatesRouted: r.storyUpdatesRouted, ownerReport: r.ownerReport, emailSent: r.emailSent, emailReason: r.emailReason });
  } catch (e) { internalError(res, e); }
});
// Owner-only purge of a meeting row (owner directive 2026-06-15: erase stuck/test meetings). Hard delete
// by explicit id; admin token only. Used to clean pre-finalizer stuck meetings + dry-run test rooms.
councilRouter.delete('/meeting/:id', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a || !a.admin) return res.status(401).json({ error: 'unauthorized' });
    const deleted = await deleteMeeting(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, deleted: req.params.id });
  } catch (e) { internalError(res, e); }
});
// Owner report readback — owner-gated (it is Mathieu's report; members read the transcript instead).
councilRouter.get('/meeting/:id/report', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a || !a.admin) return res.status(401).json({ error: 'unauthorized' });
    const m = await getMeeting(req.params.id); if (!m) return res.status(404).json({ error: 'not_found' });
    res.json({ id: m.id, agenda: m.agenda, closedAt: m.closed_at || null, ownerReport: m.owner_report || null });
  } catch (e) { internalError(res, e); }
});
// Structured owner report for Arke's app (ratified 2026-06-09): camelCase 4-field split, mounted under
// /api/council/meeting/:id/* alongside the future run-autonomous + /cost (other meeting routes stay /api/meeting/*).
function splitOwnerReport(md: string): { codeReviewImprovements: string; directionConsensus: string; frictionFixes: string; flags: string } {
  const sec = (n: number) => {
    const re = new RegExp('##\\s*' + n + '\\.[^\\n]*\\n([\\s\\S]*?)(?=##\\s*' + (n + 1) + '\\.|$)');
    const mm = re.exec(md || '');
    return mm ? mm[1].trim() : '';
  };
  return { codeReviewImprovements: sec(1), directionConsensus: sec(2), frictionFixes: sec(3), flags: sec(4) };
}
councilRouter.get('/council/meeting/:id/owner-report', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a || !a.admin) return res.status(401).json({ error: 'unauthorized' });
    const m = await getMeeting(req.params.id); if (!m) return res.status(404).json({ error: 'not_found' });
    if (!m.owner_report) return res.status(404).json({ error: 'no_owner_report' });
    res.json({ id: m.id, agenda: m.agenda, closedAt: m.closed_at || null, raw: m.owner_report, ...splitOwnerReport(m.owner_report) });
  } catch (e) { internalError(res, e); }
});

// Finalizer status (#30, meeting 2026-06-19) — member-or-owner readable. Downstream consumers
// (Arke's pollUntilReportReady, Logos's retry layer, the morning-prep poll) hit this before reading
// /report so they never pull a half-written report while the async finalizer is still committing.
//   state: 'pending'    — meeting not yet closed (still running or never closed)
//          'finalizing' — closed_at set, owner_report NOT yet committed (finalizer in flight, OR a
//                         crashed/failed finalizer — held indefinitely on purpose; the consumer's
//                         poll timeout is the page-someone signal, never a silent flip to ready)
//          'ready'      — owner_report committed; report is safe to read
// finalizer_lag_ms = owner_report_at - closed_at (null until ready). 404 on unknown id.
councilRouter.get('/council/meetings/:id/status', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const m = await getMeeting(req.params.id); if (!m) return res.status(404).json({ error: 'not_found' });
    const closedAt = m.closed_at || null;
    const reportAt = m.owner_report_at || null;
    const reportCommitted = !!m.owner_report;
    const state = !closedAt ? 'pending' : (reportCommitted ? 'ready' : 'finalizing');
    let lag: number | null = null;
    if (state === 'ready' && closedAt && reportAt) {
      const d = Date.parse(reportAt) - Date.parse(closedAt);
      lag = Number.isFinite(d) && d >= 0 ? d : null;
    }
    res.json({
      id: m.id, state,
      report_committed: reportCommitted,
      report_committed_at: state === 'ready' ? reportAt : null,
      finalizer_lag_ms: lag,
      closed_at: closedAt,
    });
  } catch (e) { internalError(res, e); }
});

// Boot-stamp log readback (P1 #8) — owner-gated. Two consecutive rows with the same deploy_sha =
// the container cycled without a deploy. secret_fp is a non-reversible fingerprint, never the secret.
councilRouter.get('/council/boots', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a || !a.admin) return res.status(401).json({ error: 'unauthorized' });
    const limit = Number((req.query.limit as string) || 20);
    res.json({ ok: true, boots: await getRecentBoots(limit) });
  } catch (e) { internalError(res, e); }
});

// ===== HIERARCHY TENANTS + consent-gated cross-read (P2 #7) — wires src/hierarchy.ts ==================
// Owner manages tenant trees (validated FAIL-CLOSED on write — an invalid/guardrail-violating tree can
// never persist). Members exercise the cross-read AS a node bound to their own actor (owner may act as
// any viewer). Opt-in by default: no tenant row, or no explicit shareEdge, denies everything.
const CROSS_READ_SCOPES = new Set<ShareScope>(['code', 'backlog', 'frictionLog', 'ownerSummary', 'storyUpdate']);
councilRouter.get('/council/hierarchy', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a || !a.admin) return res.status(401).json({ error: 'unauthorized' });
    res.json({ ok: true, tenants: await listHierarchies() });
  } catch (e) { internalError(res, e); }
});
councilRouter.get('/council/hierarchy/:tenantId', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a || !a.admin) return res.status(401).json({ error: 'unauthorized' });
    const h = await getHierarchy(req.params.tenantId); if (!h) return res.status(404).json({ error: 'no_hierarchy' });
    res.json({ ok: true, tenantId: req.params.tenantId, ...h });
  } catch (e) { internalError(res, e); }
});
councilRouter.put('/council/hierarchy/:tenantId', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a || !a.admin) return res.status(401).json({ error: 'unauthorized' });
    const tree = (req.body || {}).tree as Tenant;
    if (!tree || !Array.isArray(tree.nodes)) return res.status(400).json({ error: 'bad_request', message: 'body.tree { tenantId, nodes[] } required' });
    const v = validateHierarchy(tree);
    if (!v.ok) return res.status(422).json({ error: 'invalid_hierarchy', errors: v.errors });
    await setHierarchy(req.params.tenantId, tree, a.actor);
    res.json({ ok: true, tenantId: req.params.tenantId, nodes: tree.nodes.length });
  } catch (e) { internalError(res, e); }
});
councilRouter.delete('/council/hierarchy/:tenantId', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a || !a.admin) return res.status(401).json({ error: 'unauthorized' });
    const deleted = await deleteHierarchy(req.params.tenantId);
    if (!deleted) return res.status(404).json({ error: 'no_hierarchy' });
    res.json({ ok: true, deleted: req.params.tenantId });
  } catch (e) { internalError(res, e); }
});
councilRouter.get('/council/hierarchy/:tenantId/cross-read', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const h = await getHierarchy(req.params.tenantId); if (!h) return res.status(404).json({ error: 'no_hierarchy' });
    const tree = h.tree as Tenant;
    const viewer = String(req.query.viewer || ''); const target = String(req.query.target || ''); const scope = String(req.query.scope || '');
    if (!viewer || !target || !scope) return res.status(400).json({ error: 'bad_request', message: 'viewer, target, scope query params required' });
    if (!CROSS_READ_SCOPES.has(scope as ShareScope)) return res.status(400).json({ error: 'bad_scope', message: 'scope must be code|backlog|frictionLog|ownerSummary|storyUpdate' });
    const vNode = tree.nodes.find((n) => n.nodeId === viewer);
    const tNode = tree.nodes.find((n) => n.nodeId === target);
    if (!vNode || !tNode) return res.status(404).json({ error: 'node_not_found' });
    // a member may only cross-read AS a node bound to its own actor; owner may act as any viewer.
    if (!a.admin && vNode.agentRef !== a.actor) return res.status(403).json({ error: 'not_your_viewer_node', expected: vNode.agentRef || null, you: a.actor });
    if (!canCrossRead(tree, viewer, target, scope as ShareScope)) {
      return res.status(403).json({ allowed: false, error: 'cross_read_denied', viewer, target, scope });
    }
    const targetActor = tNode.agentRef || null;
    if (scope === 'backlog') {
      const row = (await getAgentBacklogs()).find((r: any) => r.actor === targetActor);
      return res.json({ allowed: true, scope, viewer, target, targetActor, content: row ? row.content : null, updatedAt: row ? row.updatedAt : null });
    }
    if (scope === 'code') {
      const meta = targetActor ? await getBrainV2Meta(targetActor, 'corpus') : null;
      return res.json({ allowed: true, scope, viewer, target, targetActor,
        corpus: meta ? { brainVersion: meta.brain_version, sha256: meta.sha256, bytes: Number(meta.bytes), committedAt: meta.committed_at } : null });
    }
    // frictionLog / ownerSummary / storyUpdate: the gate passes, but no stored source is wired yet.
    return res.json({ allowed: true, scope, viewer, target, targetActor, scopeSource: 'unwired',
      note: 'cross-read authorized; no stored source wired for this scope yet' });
  } catch (e) { internalError(res, e); }
});

// Hub-side auto-scheduler on/off (owner 2026-06-18) — DB-backed (app_settings) so it survives restarts and
// is owner-toggleable without a redeploy. When 'on', the hub fires the daily meeting itself (see startScheduler).
councilRouter.get('/council/scheduler', requireOwner, async (_req, res) => {
  try {
    const v = await getSetting('hub_meeting_scheduler');
    res.json({ ok: true, enabled: v === 'on', time: await getSchedTime(), tz: 'America/Toronto', voiceLoopEnabled: process.env.VOICE_LOOP_ENABLED === 'true' });
  } catch (e) { internalError(res, e); }
});
councilRouter.post('/council/scheduler', requireOwner, async (req, res) => {
  try {
    const b = req.body || {};
    if (typeof b.enabled === 'boolean') await setSetting('hub_meeting_scheduler', b.enabled ? 'on' : 'off');
    if (b.time !== undefined) {
      const t = String(b.time);
      if (!VALID_HHMM.test(t)) return res.status(400).json({ error: 'bad_time', message: 'time must be 24h HH:MM (America/Toronto)' });
      await setSetting('hub_meeting_time', t);
    }
    res.json({ ok: true, enabled: (await getSetting('hub_meeting_scheduler')) === 'on', time: await getSchedTime(), tz: 'America/Toronto' });
  } catch (e) { internalError(res, e); }
});

// #47 (convergence meeting d5cb11ce, 2026-06-27 — the answer to #42 brain-freshness). Per-seat brain
// freshness, computed HUB-SIDE, so each seat's prep ritual can verify it will be SEATED at the next fire
// instead of hardcoding 03:00 ET or re-deriving the gate locally. `fresh` mirrors the scheduler's readiness
// gate EXACTLY (sha-based: a pack whose sha differs from the one the seat carried at its last-attended
// meeting; a seat with no recorded attendance reads fresh — fail-toward-inclusive). `next_meeting_fire_at`
// is the next scheduled fire (UTC ISO), null when the scheduler is OFF. (#55: `next_fire_at` is a DEPRECATED
// byte-identical alias kept through 2026-07-17 for the 14-day migration window; consumers move to
// `next_meeting_fire_at`.) `fresh_until` is the horizon through which
// `fresh` is guaranteed to hold: a fresh seat stays fresh until it ATTENDS a meeting, so it is guaranteed
// fresh through the upcoming fire and first risks staleness one cadence later — hence next_fire_at + cadence;
// stale / no_brain => null. Consumer guard: assert(fresh_until && next_fire_at && Date.parse(fresh_until) >
// Date.parse(next_fire_at)) — loud exit on fail/missing. Member-OR-owner gated (any resolved actor, like
// corpus-status) so each seat reads its own row with its own secret. Contract pinned in RESPONSE_SHAPES.md.
councilRouter.get('/council/brains', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const nextFire = await nextFireAtUtc();
    const readiness = await computeReadiness();
    const actors = readiness.map((r) => {
      const fresh = r.status === 'fresh';
      const fresh_until = (fresh && nextFire) ? new Date(Date.parse(nextFire) + SCHED_INTERVAL_MS).toISOString() : null;
      return { actor: r.actor, packed_at: r.packedAt, fresh, fresh_until, status: r.status, reason: r.reason, pack_sha: r.packSha, dirty_streak: r.dirtyStreak ?? 0 };
    });
    res.json({ ok: true, now: new Date().toISOString(), next_meeting_fire_at: nextFire,
      next_fire_at: nextFire, // #55 DEPRECATED alias of next_meeting_fire_at — remove after 2026-07-17 (14-day window)
      tz: 'America/Toronto',
      quorum_min: QUORUM_MIN, fresh_count: actors.filter((x) => x.fresh).length, actors });
  } catch (e) { internalError(res, e); }
});

// Logos ask 2026-07-03 (msg e9144f43): a MEMBER-or-owner readable view of the LATEST scheduler fire, so a
// seat can gate its own behaviour on whether it was actually seated (and as contributor vs listener) WITHOUT
// owner access to the dashboard and WITHOUT needing a meeting id. Reuses latestSchedulerRun() — the #38
// canonical Row-1 shape {run_id, status, fired_at, seated_actors, excluded[{actor,reason}], meeting_id,
// fresh_count} — but REDACTS the raw `error` string (raw server text, owner-gated surface only) down to a
// boolean `has_error`. `seated_actors` is [] on any non-opened status; `status` is the scheduler decision
// enum (opened | skipped_quorum | already_live | scheduler_off | error). Meeting *phase* (rounds | report)
// lives on GET /api/meeting/:id/state via `meeting_id`. Member-or-owner gated like /council/brains. Pinned
// in RESPONSE_SHAPES.md.
councilRouter.get('/council/scheduler-runs/latest', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const r = await latestSchedulerRun();
    if (!r) return res.json({ ok: true, run: null });
    const { error, ...safe } = r;
    res.json({ ok: true, run: { ...safe, has_error: error != null } });
  } catch (e) { internalError(res, e); }
});

// Owner-tunable meeting limits (owner 2026-06-23) — DB-backed (app_settings) so Arke's app can read/set
// them without a redeploy. turnTarget (default 50) + usdCeiling (default 4, per meeting). These are SOFT
// targets the voices try to finish within; at the limit, an unfinished meeting closes gracefully, auto-
// carries its open threads to the next meeting's agenda, and flags it in the owner report. The 800k-token
// ceiling stays as a fixed absolute backstop underneath (not tunable here). The two getters live in
// store.ts (single source of truth shared with the voice loop).
councilRouter.get('/council/limits', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a || !a.admin) return res.status(401).json({ error: 'unauthorized' });
    res.json({ ok: true, turnTarget: await getMeetingTurnTarget(), usdCeiling: await getMeetingUsdCeiling(), tokenCeilingAbsolute: 800000 });
  } catch (e) { internalError(res, e); }
});
councilRouter.post('/council/limits', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a || !a.admin) return res.status(401).json({ error: 'unauthorized' });
    const b = req.body || {};
    if (b.turnTarget !== undefined) {
      const t = Number(b.turnTarget);
      if (!Number.isFinite(t) || t < 1 || t > 100000) return res.status(400).json({ error: 'bad_turnTarget', message: 'turnTarget must be a positive number' });
      await setSetting('meeting_turn_target', String(Math.floor(t)));
    }
    if (b.usdCeiling !== undefined) {
      const u = Number(b.usdCeiling);
      if (!Number.isFinite(u) || u <= 0 || u > 1000) return res.status(400).json({ error: 'bad_usdCeiling', message: 'usdCeiling must be a positive dollar amount' });
      await setSetting('meeting_usd_ceiling', String(u));
    }
    res.json({ ok: true, turnTarget: await getMeetingTurnTarget(), usdCeiling: await getMeetingUsdCeiling(), tokenCeilingAbsolute: 800000 });
  } catch (e) { internalError(res, e); }
});

// Owner dashboard aggregate (owner 2026-06-18) — ONE server-side gather of everything valuable, behind the
// SAME owner login as /backlog (requireOwner = Google ID token OR console key). No token ever reaches the
// page; all data is assembled here. Powers the private /dashboard board.
councilRouter.get('/council/dashboard', requireOwner, async (_req, res) => {
  try {
    // Only the 4 canonical council seats (MEETING_DEFAULT) — never the hub-self member
    // (architect-council) or the retired pre-true-name rows (zen-ai, biblevoice).
    const memberStatus = async (): Promise<any[]> => {
      const out: any[] = [];
      for (const name of MEETING_DEFAULT) {
        let corpus: any = null, pack: any = null, manifest: any = null;
        try { corpus = await getBrainV2Meta(name, 'corpus'); } catch { /* absent */ }
        try { pack = await getBrainV2Meta(name, 'pack'); } catch { /* absent */ }
        try { manifest = await getBrainV2Meta(name, 'manifest'); } catch { /* absent */ }
        // #32: surface the manifest's declared droppedFiles (best-effort; parse the manifest content).
        let droppedFiles: Array<{ path: string; reason: string }> = [];
        if (manifest) {
          try {
            const manc = await getBrainV2Content(name, 'manifest');
            if (manc) { const mj = JSON.parse(manc.content.toString('utf8')); const df = parseDroppedFiles(mj && mj.droppedFiles); if (df.ok) droppedFiles = df.entries; }
          } catch { /* dropped-files surface is best-effort, never fails the dashboard */ }
        }
        out.push({ actor: name, corpusReady: !!corpus, packReady: !!pack, manifestReady: !!manifest,
          corpusBuiltAt: corpus ? corpus.committed_at : null,
          droppedFiles, droppedFilesCount: droppedFiles.length });
      }
      return out;
    };
    const [meetings, boots, backlogs, members, spentTodayUsd, standardsRaw] = await Promise.all([
      listMeetingsForDashboard(12).catch(() => []),
      getRecentBoots(8).catch(() => []),
      getAgentBacklogs().catch(() => []),
      memberStatus().catch(() => []),
      usdSpentTodayUtc().catch(() => 0),
      listStandards().catch(() => []),
    ]);
    // #40: adopted-standards with per-project ratification state (proposed | partial | adopted). A standard is
    // adopted ONLY when every canonical seat has re-uploaded an accept from its own session — never a false
    // unanimous green from a meeting voice's proposal alone.
    const standards = standardsRaw.map((s: any) => ({ ...s, ...standardStatus(s.ratifications) }));
    const scheduler = { enabled: (await getSetting('hub_meeting_scheduler').catch(() => null)) === 'on',
      time: await getSchedTime(), tz: 'America/Toronto', voiceLoopEnabled: process.env.VOICE_LOOP_ENABLED === 'true' };
    // #36: the latest readiness-gate decision (seated/excluded seats + reason) so the owner sees WHY a
    // scheduled meeting ran with a subset, or skipped. Best-effort; null before the first gated fire.
    const lastSchedulerRun = await latestSchedulerRun().catch(() => null);
    res.json({ ok: true, ts: Date.now(), vault: vaultReady(), scheduler, lastSchedulerRun, spentTodayUsd, meetings, members, boots, backlogs, standards });
  } catch (e) { internalError(res, e); }
});
// Member housekeeping (owner 2026-06-18): retire/restore a member row. GUARDED — a canonical council seat
// (MEETING_DEFAULT) can NEVER be deactivated, so this only touches non-seats (e.g. the retired
// pre-true-name rows zen-ai / biblevoice). architect-council re-registers itself on boot regardless.
councilRouter.post('/council/member/:name/active', requireOwner, async (req, res) => {
  try {
    const name = String(req.params.name);
    const active = (req.body || {}).active === true;
    if (!active && MEETING_DEFAULT.includes(name)) return res.status(400).json({ error: 'protected_seat', message: name + ' is a canonical council seat and cannot be deactivated' });
    const changed = await setMemberActive(name, active);
    if (!changed) return res.status(404).json({ error: 'no_such_member' });
    res.json({ ok: true, name, active });
  } catch (e) { internalError(res, e); }
});
// ===== AUTONOMOUS VOICE LOOP (HUB_AUTONOMOUS_VOICE_SPEC §4) — owner-gated, FAIL-CLOSED money gate =====
// run-autonomous fires the hub-side voice loop for an open meeting. It SPENDS API tokens, so it is
// disabled by default: VOICE_LOOP_ENABLED must be exactly 'true' in Railway env (set it only for a
// SUPERVISED run). Caps (cost.ts) are fail-closed; the loop runs in the background, client polls /state.
councilRouter.post('/council/meeting/:id/run-autonomous', requireOwner, async (req, res) => {
  try {
    if (process.env.VOICE_LOOP_ENABLED !== 'true') return res.status(503).json({ error: 'voice_loop_disabled', message: 'set VOICE_LOOP_ENABLED=true (supervised) to enable the autonomous voice loop' });
    if (!process.env.CHAT_API_KEY) return res.status(503).json({ error: 'no_api_key', message: 'CHAT_API_KEY is not configured' });
    const m = await getMeeting(req.params.id); if (!m) return res.status(404).json({ error: 'not_found' });
    if (m.phase !== 'rounds') return res.status(409).json({ error: 'not_in_rounds', phase: m.phase });
    if (m.dry_run) return res.status(400).json({ error: 'dry_run_meeting', message: 'use owner-drive for dryRun tests; run-autonomous is for real meetings' });
    if (isVoiceRunning(m.id) || m.voice_running) return res.status(409).json({ error: 'already_running' });
    const caps = capsFromEnv(process.env);
    // Owner directive 2026-06-11: the daily USD budget is REPORT-ONLY, never a blocker. Spend is
    // surfaced here and on /cost; the per-meeting token ceiling + turn cap remain the runaway rails.
    const spent = await usdSpentTodayUtc();
    const budgetNote = dailyBudgetExhausted(spent, caps) ? 'daily_budget_passed_reporting_only' : null;
    runVoiceLoop(m.id).catch(() => { setVoiceRunning(m.id, false, 'loop_error').catch(() => {}); }); // fire-and-forget
    res.status(202).json({ ok: true, started: true, meetingId: m.id, model: process.env.CHAT_MODEL || 'claude-opus-4-8', caps, spentTodayUsd: spent, budgetNote });
  } catch (e) { internalError(res, e); }
});
// Cost ledger for the cost panel (camelCase, contract-ratified shape).
councilRouter.get('/council/meeting/:id/cost', requireOwner, async (req, res) => {
  try {
    const m = await getMeeting(req.params.id); if (!m) return res.status(404).json({ error: 'not_found' });
    const led = (m.cost_ledger && m.cost_ledger.total) ? m.cost_ledger : { total: emptyTotals(), perAgent: {} };
    const t = led.total;
    const perAgent = Object.entries(led.perAgent || {}).map(([actor, v]: any) => ({ actor, usd: v.usd, inputTokens: v.inputTokens, outputTokens: v.outputTokens, cacheReadTokens: v.cacheReadTokens, totalTokens: v.totalTokens }));
    const spentTodayUsd = await usdSpentTodayUtc(); // owner directive 2026-06-11: always REPORT total spend
    res.json({ id: m.id, totalUsd: t.usd, spentTodayUsd, inputTokens: t.inputTokens, outputTokens: t.outputTokens, cacheReadTokens: t.cacheReadTokens, totalTokens: t.totalTokens, perAgent, endedReason: m.ended_reason || null, voiceRunning: !!m.voice_running });
  } catch (e) { internalError(res, e); }
});
// Owner notify-email (owner directive 2026-06-11): register the address the meeting-close report is
// emailed to. Owner-gated. GET returns current + whether the transport is configured; POST {email}
// registers (or {email:null}/"" clears); POST .../test sends a one-off test to the registered address.
councilRouter.get('/council/notify-email', requireOwner, async (_req, res) => {
  try {
    const email = await getSetting('owner_notify_email');
    res.json({ email: email || null, transportConfigured: !!process.env.RESEND_API_KEY, from: process.env.OWNER_REPORT_FROM || 'onboarding@resend.dev' });
  } catch (e) { internalError(res, e); }
});
councilRouter.post('/council/notify-email', requireOwner, async (req, res) => {
  try {
    const raw = (req.body || {}).email;
    if (raw === null || raw === '') { await setSetting('owner_notify_email', null); return res.json({ ok: true, email: null }); }
    const email = String(raw || '').trim().slice(0, 200);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'invalid_email' });
    await setSetting('owner_notify_email', email);
    res.json({ ok: true, email });
  } catch (e) { internalError(res, e); }
});
councilRouter.post('/council/notify-email/test', requireOwner, async (_req, res) => {
  try {
    const to = await getSetting('owner_notify_email');
    if (!to) return res.status(400).json({ error: 'no_registered_email' });
    const r = await sendOwnerReportEmail(to, 'Architects Council — test email', 'This is a test of the Architects Council owner-report email. If you received this, the meeting-close report will be delivered here.');
    res.json({ ok: r.sent, ...r, to });
  } catch (e) { internalError(res, e); }
});
// ---------- Model config, hub-hosted (owner directive 2026-06-30, relayed by Logos) ----------
// One source of truth for each project's council voice model, SERVED BY the hub instead of pinned in N
// per-project Railway env vars. A voice resolves its model at runtime from GET /council/model-config?project=
// and falls back to its own local env only if the hub is unreachable (fail-soft). POST is owner-gated.
// Stored as one app_settings row `model_config` = JSON {default, perProject, updatedAt}. Default = opus
// (owner's standing quality-over-cost call, 2026-06-06). Model strings validated by format; the known-model
// list (cost.ts PRICES keys) is surfaced so Arke's front-end picker offers valid choices. Contract shape is
// pinned in docs/RESPONSE_SHAPES.md and contract/responseShapes.json.
const DEFAULT_VOICE_MODEL = 'claude-opus-4-8';
const MODEL_STR_RE = /^[a-z0-9][a-z0-9.\-]{2,60}$/;
async function readModelConfig(): Promise<{ default: string; perProject: Record<string, string>; updatedAt: string | null }> {
  try {
    const raw = await getSetting('model_config');
    if (!raw) return { default: DEFAULT_VOICE_MODEL, perProject: {}, updatedAt: null };
    const j = JSON.parse(raw);
    const def = (typeof j.default === 'string' && MODEL_STR_RE.test(j.default)) ? j.default : DEFAULT_VOICE_MODEL;
    const pp: Record<string, string> = {};
    if (j.perProject && typeof j.perProject === 'object') {
      for (const [k, v] of Object.entries(j.perProject)) {
        if (typeof v === 'string' && MODEL_STR_RE.test(v)) pp[String(k).slice(0, 60)] = v;
      }
    }
    return { default: def, perProject: pp, updatedAt: typeof j.updatedAt === 'string' ? j.updatedAt : null };
  } catch { return { default: DEFAULT_VOICE_MODEL, perProject: {}, updatedAt: null }; }
}
councilRouter.get('/council/model-config', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const cfg = await readModelConfig();
    const knownModels = Object.keys(PRICES);
    const project = typeof req.query.project === 'string' ? String(req.query.project).slice(0, 60) : '';
    if (project) {
      const model = cfg.perProject[project] || cfg.default;
      return res.json({ ok: true, project, model, source: cfg.perProject[project] ? 'override' : 'default', default: cfg.default, updatedAt: cfg.updatedAt, knownModels });
    }
    res.json({ ok: true, default: cfg.default, perProject: cfg.perProject, updatedAt: cfg.updatedAt, knownModels });
  } catch (e) { internalError(res, e); }
});
councilRouter.post('/council/model-config', requireOwner, async (req, res) => {
  try {
    const b = req.body || {};
    const cfg = await readModelConfig();
    let nextDefault = cfg.default;
    if (b.default !== undefined) {
      if (typeof b.default !== 'string' || !MODEL_STR_RE.test(b.default)) return res.status(400).json({ error: 'bad_default' });
      nextDefault = b.default;
    }
    const perProject: Record<string, string> = { ...cfg.perProject };
    if (b.perProject !== undefined) {
      if (b.perProject === null || typeof b.perProject !== 'object' || Array.isArray(b.perProject)) return res.status(400).json({ error: 'bad_perProject' });
      for (const [k, v] of Object.entries(b.perProject)) {
        const key = String(k).slice(0, 60);
        if (v === null) { delete perProject[key]; continue; }        // null clears an override -> falls back to default
        if (typeof v !== 'string' || !MODEL_STR_RE.test(v)) return res.status(400).json({ error: 'bad_model', message: `invalid model for ${key}` });
        perProject[key] = v;
      }
    }
    const updatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    await setSetting('model_config', JSON.stringify({ default: nextDefault, perProject, updatedAt }));
    res.json({ ok: true, default: nextDefault, perProject, updatedAt, knownModels: Object.keys(PRICES) });
  } catch (e) { internalError(res, e); }
});
// Per-agent living backlog (contract answer 4, ratified 2026-06-09): a write replaces ONLY the writer's
// own row; read composes all rows. Old single-row /council/admin/backlog stays until Arke's panel switches.
councilRouter.get('/council/backlogs', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    res.json({ backlogs: await getAgentBacklogs() });
  } catch (e) { internalError(res, e); }
});
// Singular composed alias for Arke's app panel (P1 #6, 2026-06-10): owner-gated, returns
// { sections:[{ actor, done[], planned[], updatedAt }] }. Each agent row's content jsonb is
// tolerant — done/planned default to [], and a legacy single-text blob surfaces as one note line.
councilRouter.get('/council/backlog', requireOwner, async (_req, res) => {
  try {
    // Owner directive 2026-06-18 (Mathieu): the board shows ALL FOUR canonical seats so the owner has a
    // global vision of every agent's backlog — superseding the 2026-06-11 arke+kairos-only scope. The
    // hub-self 'architect-council' row (and any retired alias) is excluded by virtue of not being a seat.
    // Nova/Logos rows surface here once their end-of-day task posts (the daily-loop standard); until then
    // a stale or absent row is itself a useful signal to the owner.
    const BOARD_ACTORS = new Set(MEETING_DEFAULT); // kairos, arke, nova, logos
    const rows = (await getAgentBacklogs()).filter((r: any) => BOARD_ACTORS.has(String(r.actor)));
    const arr = (v: any) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))) : []);
    const sections = rows.map((r: any) => {
      const c = (r.content && typeof r.content === 'object') ? r.content : {};
      const done = arr(c.done);
      const planned = arr(c.planned);
      // Legacy/fallback: a row that only carried free text (e.g. migrated single-row) → expose it as one done line.
      if (!done.length && !planned.length && typeof c.text === 'string' && c.text.trim()) done.push(c.text.trim().slice(0, 4000));
      return { actor: r.actor, done, planned, updatedAt: r.updatedAt, updatedBy: r.updatedBy };
    });
    res.json({ sections });
  } catch (e) { internalError(res, e); }
});
councilRouter.post('/council/backlog/agent', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const b = req.body || {};
    const actor = a.admin ? String(b.actor || '') : a.actor;
    if (!actor) return res.status(400).json({ error: 'actor_required', message: 'owner writes must name body.actor' });
    if (!a.admin && b.actor && b.actor !== a.actor) return res.status(403).json({ error: 'not_your_row' });
    const updatedAt = await setAgentBacklog(actor, b.content ?? {}, a.admin ? 'owner' : a.actor);
    res.json({ ok: true, actor, updatedAt });
  } catch (e) { internalError(res, e); }
});
councilRouter.get('/meeting/:id/transcript', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const m = await getMeeting(req.params.id); if (!m) return res.status(404).json({ error: 'not_found' });
    if (!a.admin && !m.participants.includes(a.actor)) return res.status(403).json({ error: 'not_a_participant' });
    const projection = projectTranscript(m);
    res.json({ id: m.id, agenda: m.agenda, participants: m.participants, phase: m.phase, turnsUsed: m.turns_used,
      transcript: m.transcript, report: m.report || null,
      projection, transcriptSha256: transcriptSha256Hex(projection), canon: 'council-jcs-1.0' });
  } catch (e) { internalError(res, e); }
});
councilRouter.get('/meetings', async (req, res) => {
  try { const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' }); res.json({ meetings: await listMeetings(20) }); }
  catch (e) { internalError(res, e); }
});
// Per-actor meeting history (Arke 2026-06-09): app History view + per-agent "Download knowledge".
// Auth: the actor's own bridge secret, or the owner token. A member may only list its own meetings.
councilRouter.get('/council/meetings', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const actor = String(req.query.actor || '');
    if (!actor) return res.status(400).json({ error: 'actor_required', message: 'query param ?actor=<name> required' });
    if (!a.admin && a.actor !== actor) return res.status(403).json({ error: 'forbidden', message: 'a member may only list its own meetings' });
    res.json({ actor, meetings: await listMeetingsForActor(actor) });
  } catch (e) { internalError(res, e); }
});

// ---------- Brain-upload pipeline (docs/CONTRACT_DELTAS_2.0.md a/d/e, 2026-06-08) ----------
// Resumable content-addressed chunk upload, consent-gated commit, x-contract-version fail-closed.
const sha256hex = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest('hex');
function requireContract2(req: Request, res: Response, next: NextFunction) {
  const v = String(req.headers['x-contract-version'] || '');
  if (v !== '2.0') return res.status(409).json({ error: 'contract_mismatch', expected: '2.0', got: v || null });
  next();
}
function readRawBody(req: Request, maxBytes = 12 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let total = 0;
    req.on('data', (d: Buffer) => { total += d.length; if (total > maxBytes) { req.destroy(); reject(new Error('chunk_too_large')); } else chunks.push(d); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const remainingIdx = (manifest: any[], received: number[]) => manifest.map((m: any) => Number(m.idx)).filter((i) => !received.includes(i));

/** #32 (meeting 2026-06-19): the brain-manifest 2.1 OPTIONAL `droppedFiles` field — files a packager
 *  intentionally excluded from its corpus, each declared `{ path, reason }` (two non-empty strings,
 *  nothing more). The hub is the CONSUMER: it validates the SHAPE only (and surfaces it on the owner
 *  dashboard). The declared-vs-actual delta equality check (count + set, both directions) is
 *  PRODUCER-side — Nova's `validateShrink` in each packager. No contract bump; absent/empty is valid. */
function parseDroppedFiles(v: any): { ok: boolean; entries: Array<{ path: string; reason: string }>; error?: string } {
  if (v == null) return { ok: true, entries: [] };
  if (!Array.isArray(v)) return { ok: false, entries: [], error: 'droppedFiles must be an array' };
  const entries: Array<{ path: string; reason: string }> = [];
  for (let i = 0; i < v.length; i++) {
    const e = v[i];
    if (!e || typeof e !== 'object' || Array.isArray(e)) return { ok: false, entries: [], error: `droppedFiles[${i}] must be an object { path, reason }` };
    if (typeof e.path !== 'string' || !e.path.trim()) return { ok: false, entries: [], error: `droppedFiles[${i}].path must be a non-empty string` };
    if (typeof e.reason !== 'string' || !e.reason.trim()) return { ok: false, entries: [], error: `droppedFiles[${i}].reason must be a non-empty string` };
    entries.push({ path: e.path, reason: e.reason });
  }
  return { ok: true, entries };
}

councilRouter.post('/bridge/brain/init', requireContract2, async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const { brainId, totalBytes, chunkSize, sha256, manifest, kind, actor } = req.body || {};
    if (!sha256 || !Array.isArray(manifest) || !manifest.length) return res.status(400).json({ error: 'bad_request', message: 'sha256 + non-empty manifest[] required' });
    // Owner-authorized upload (§11.1): the admin token may upload ON BEHALF OF any member; the upload is
    // attributed to body.actor (the consent-manifest actor, verified at commit). A member always uploads as itself.
    const target = a.admin ? String(actor || '').trim() : a.actor;
    if (a.admin && !target) return res.status(400).json({ error: 'actor_required', message: 'owner upload must name body.actor (the target member)' });
    if (a.admin && !(await getMember(target))) return res.status(404).json({ error: 'unknown_actor', actor: target });
    // Brain artifacts: kind ∈ {pack, corpus, manifest}; absent/unknown = corpus (back-compat with today's app upload).
    // manifest = corpus-contract §6 atomic pack+corpus pairing (contract 2.1), verified fail-closed at commit.
    const k = kind === 'pack' ? 'pack' : kind === 'manifest' ? 'manifest' : 'corpus';
    const uploadId = crypto.randomUUID();
    await createBrainUpload(uploadId, target, String(brainId || ''), Number(totalBytes) || 0, Number(chunkSize) || 0, String(sha256), manifest, k);
    res.json({ uploadId, actor: target, kind: k, received: [] });
  } catch (e) { internalError(res, e); }
});
councilRouter.put('/bridge/brain/:uploadId/chunk/:idx', requireContract2, async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const up = await getBrainUpload(req.params.uploadId); if (!up) return res.status(404).json({ error: 'no_such_upload' });
    if (up.actor !== a.actor && !a.admin) return res.status(403).json({ error: 'not_your_upload' });
    if (up.status === 'committed') return res.status(409).json({ error: 'already_committed' });
    const idx = Number(req.params.idx);
    const entry = (up.manifest || []).find((m: any) => Number(m.idx) === idx);
    if (!entry) return res.status(400).json({ error: 'idx_not_in_manifest', idx });
    const body = await readRawBody(req);
    const got = sha256hex(body);
    if (got !== String(entry.sha256).toLowerCase()) return res.status(422).json({ error: 'chunk_hash_mismatch', idx, expected: entry.sha256, got });
    await putBrainChunk(req.params.uploadId, idx, got, body.length, body);
    const received = await brainReceived(req.params.uploadId);
    res.json({ received, remaining: remainingIdx(up.manifest || [], received) });
  } catch (e) {
    if ((e as Error).message === 'chunk_too_large') return res.status(413).json({ error: 'chunk_too_large' });
    internalError(res, e);
  }
});
async function brainProbe(req: Request, res: Response) {
  const a = await resolveActor(req); if (!a) return res.status(401).end();
  const up = await getBrainUpload(req.params.uploadId); if (!up) return res.status(404).end();
  if (up.actor !== a.actor && !a.admin) return res.status(403).end();
  const received = await brainReceived(req.params.uploadId);
  const remaining = remainingIdx(up.manifest || [], received);
  res.setHeader('x-received-count', String(received.length));
  res.setHeader('x-remaining-count', String(remaining.length));
  if (req.method === 'HEAD') return res.status(200).end();
  res.json({ received, remaining });
}
councilRouter.get('/bridge/brain/:uploadId', (req, res) => { brainProbe(req, res).catch(() => res.status(500).end()); });
councilRouter.head('/bridge/brain/:uploadId', (req, res) => { brainProbe(req, res).catch(() => res.status(500).end()); });
councilRouter.post('/bridge/brain/:uploadId/commit', requireContract2, async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const up = await getBrainUpload(req.params.uploadId); if (!up) return res.status(404).json({ error: 'no_such_upload' });
    if (up.actor !== a.actor && !a.admin) return res.status(403).json({ error: 'not_your_upload' });
    const { sha256, consent } = req.body || {};
    const c = consent || {}; const scan = c.secretScan || {};
    // Consent must name the upload's target actor (== caller for members; == body.actor for owner uploads).
    if (c.actor !== up.actor) return res.status(403).json({ error: 'consent_actor_mismatch', expected: up.actor, got: c.actor || null });
    if (scan.ran !== true || Number(scan.findings) !== 0) return res.status(412).json({ error: 'consent_secret_scan_failed', message: 'ConsentManifest.secretScan must be {ran:true, findings:0}' });
    if (c.expiresAt && Date.parse(c.expiresAt) <= Date.now()) return res.status(412).json({ error: 'consent_expired' });
    const received = await brainReceived(req.params.uploadId);
    const missing = (up.manifest || []).map((m: any) => Number(m.idx)).filter((i: number) => !received.includes(i));
    if (missing.length) return res.status(409).json({ error: 'incomplete_upload', missing });
    const buf = await assembleBrain(req.params.uploadId);
    const whole = sha256hex(buf);
    const claimed = String(sha256 || up.claimed_sha256 || '').toLowerCase();
    if (whole !== claimed) return res.status(422).json({ error: 'object_hash_mismatch', expected: claimed, got: whole });
    // Brain-manifest 2.1 (corpus-contract §6): a manifest artifact is verified FAIL-CLOSED at commit.
    // Content is canonical JSON {actor, pack_sha256, corpus_sha256, committed_at, contract:"2.1"}; each
    // *_sha256 MUST equal the actor's currently-committed pack/corpus row — else the pair is torn (409,
    // naming which kind diverged so the packager re-uploads the lagging artifact then the manifest).
    let droppedFiles: Array<{ path: string; reason: string }> | undefined;
    if (up.kind === 'manifest') {
      let mani: any;
      try { mani = JSON.parse(buf.toString('utf8')); } catch { return res.status(422).json({ error: 'manifest_invalid_json' }); }
      if (!mani || typeof mani !== 'object') return res.status(422).json({ error: 'manifest_invalid_json' });
      if (String(mani.contract || '') !== '2.1') return res.status(400).json({ error: 'manifest_bad_contract', expected: '2.1', got: mani.contract ?? null });
      if (mani.actor !== up.actor) return res.status(412).json({ error: 'manifest_actor_mismatch', expected: up.actor, got: mani.actor ?? null });
      const wantPack = String(mani.pack_sha256 || '').toLowerCase();
      const wantCorpus = String(mani.corpus_sha256 || '').toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(wantPack) || !/^[0-9a-f]{64}$/.test(wantCorpus)) return res.status(400).json({ error: 'manifest_bad_sha', message: 'pack_sha256 + corpus_sha256 must be lowercase hex sha256' });
      const packMeta = await getBrainV2Meta(up.actor, 'pack');
      const corpusMeta = await getBrainV2Meta(up.actor, 'corpus');
      if (!packMeta || String(packMeta.sha256).toLowerCase() !== wantPack) return res.status(409).json({ error: 'manifest_mismatch', kind: 'pack', expected: wantPack, got: packMeta ? String(packMeta.sha256).toLowerCase() : null });
      if (!corpusMeta || String(corpusMeta.sha256).toLowerCase() !== wantCorpus) return res.status(409).json({ error: 'manifest_mismatch', kind: 'corpus', expected: wantCorpus, got: corpusMeta ? String(corpusMeta.sha256).toLowerCase() : null });
      // #32: accept + shape-validate the OPTIONAL droppedFiles declaration (producer computes the delta).
      const dfp = parseDroppedFiles(mani.droppedFiles);
      if (!dfp.ok) return res.status(422).json({ error: 'manifest_bad_dropped_files', message: dfp.error });
      droppedFiles = dfp.entries;
    }
    // Corpus floor-assert + delta-print (Nova's pattern, adopted 2026-06-18 from mtg e097ff64): surface a
    // shrunk/truncated corpus LOUDLY at the commit boundary so a slow corpus leak can't land unnoticed.
    // Non-blocking by design — the hub serves four packagers of varying size, so we WARN + return a
    // corpusGuard field rather than reject, to avoid false-positives on a legitimate trim. env-overridable;
    // read inside the handler (never at module top). Applies to corpus commits only (pack is small config).
    let corpusGuard: any = undefined;
    if ((up.kind || 'corpus') === 'corpus') {
      const minBytes = Number(process.env.CORPUS_MIN_BYTES) || 50_000;
      const shrinkWarnPct = Number(process.env.CORPUS_SHRINK_WARN_PCT) || 50;
      let priorBytes: number | null = null;
      try { const pm = await getBrainV2Meta(up.actor, 'corpus'); priorBytes = pm ? Number(pm.bytes) : null; } catch { /* prior-size read is best-effort; guard never fails the commit */ }
      const newBytes = buf.length;
      const deltaBytes = priorBytes == null ? null : newBytes - priorBytes;
      const belowFloor = newBytes < minBytes;
      const shrinkPct = (priorBytes && priorBytes > 0) ? Math.round((1 - newBytes / priorBytes) * 100) : 0;
      const flagged = belowFloor || (priorBytes != null && shrinkPct >= shrinkWarnPct);
      corpusGuard = { priorBytes, newBytes, deltaBytes, floor: minBytes, belowFloor, shrinkPct, flagged };
      const sign = deltaBytes == null ? 'n/a' : (deltaBytes >= 0 ? '+' + deltaBytes : String(deltaBytes));
      if (flagged) console.warn(`[corpus-guard] WARN actor=${up.actor} newBytes=${newBytes} priorBytes=${priorBytes} delta=${sign} floor=${minBytes} belowFloor=${belowFloor} shrinkPct=${shrinkPct}`);
      else console.log(`[corpus-guard] ok actor=${up.actor} newBytes=${newBytes} delta=${sign}`);
    }
    // Attribute the brain to the UPLOAD's actor (the target member), never to 'owner' on an admin upload.
    const brainVersion = `${up.actor}@sha256:${whole}`;
    await commitBrainV2(up.actor, String(up.brain_id || ''), brainVersion, whole, buf.length, buf, c, up.kind || 'corpus');
    // #28: echo the SERVER-stamped committed_at (commitBrainV2 writes now()) so the client records the
    // authoritative commit time rather than its own wall clock. Best-effort: a meta-read miss never fails the commit.
    let committedAt: string | null = null;
    try { const cm = await getBrainV2Meta(up.actor, up.kind || 'corpus'); committedAt = cm ? cm.committed_at : null; } catch { /* echo is best-effort */ }
    // #28 + RESPONSE_SHAPES.md: ok + schemaVersion are additive. Clients gate on ok===true and branch on
    // schemaVersion; committedAt is the authoritative server time, sha256 is the whole-blob content hash.
    // #50 (2026-07-01): echo an explicit hub-origin `pack_sha` on a PACK commit so a client's corpusVerify
    // can assert hubReturnedPackSha === manifest.pack_sha without reading the generic `sha256` field. For a
    // pack commit `whole` IS the pack sha256; the field is omitted for corpus/manifest kinds (self-documenting).
    const pack_sha = up.kind === 'pack' ? whole : undefined;
    // #52: dirty-tree prep tracking + escalation. The packager stamps consent.code_sha = the git sha it built
    // from, or the literal 'dirty' for an uncommitted tree. On a PACK commit: 'dirty' bumps the streak and
    // alerts THREE ways (this response's codeShaWarning + a hub message to the agent + an owner email); a clean
    // sha resets the streak; an absent value is neutral (safe-demote-only). At streak >= 3 the readiness gate
    // demotes the seat to LISTENER until a clean pack resets it, and the owner email says so.
    let codeShaWarning: any = undefined;
    if (up.kind === 'pack') {
      const codeSha = c.code_sha != null ? String(c.code_sha).trim() : null;
      if (codeSha === 'dirty') {
        const streak = await bumpDirtyStreak(up.actor).catch(() => 0);
        const demoted = streak >= 3;
        codeShaWarning = { dirty: true, streak, ceiling: 3, demoted };
        queueEnvTask(SELF, up.actor, 'message', 'Dirty-tree prep warning (#52)',
          { text: `Your latest brain pack was built from a DIRTY git working tree (uncommitted changes). Consecutive dirty streak ${streak}/3. Commit a clean tree before the next meeting; at 3 you attend as a LISTENER only until you commit clean.` },
          demoted ? 'high' : 'normal').catch(() => { /* alert is best-effort */ });
        void notifyOwnerDirty(up.actor, streak, demoted);
      } else if (codeSha && /^[0-9a-f]{7,64}$/.test(codeSha)) {
        await resetDirtyStreak(up.actor, codeSha).catch(() => { /* best-effort */ });
      }
    }
    res.json({ ok: true, schemaVersion: 1, brainVersion, actor: up.actor, kind: up.kind || 'corpus', sha256: whole, pack_sha, codeShaWarning, bytes: buf.length, committedAt, corpusGuard, droppedFiles });
  } catch (e) { internalError(res, e); }
});
councilRouter.get('/bridge/brain-meta/:actor', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const meta = await getBrainV2Meta(req.params.actor, String(req.query.kind || 'corpus')); if (!meta) return res.status(404).json({ error: 'no_brain' });
    res.json(meta);
  } catch (e) { internalError(res, e); }
});
// Cross-read. ?kind=pack|corpus, default corpus (documented for Arke 2026-06-09; contract answer 3).
councilRouter.get('/bridge/brain-content/:actor', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const got = await getBrainV2Content(req.params.actor, String(req.query.kind || 'corpus')); if (!got) return res.status(404).json({ error: 'no_brain' });
    const scope = (got.meta.consent && Array.isArray(got.meta.consent.scope)) ? got.meta.consent.scope : [];
    if (!a.admin && a.actor !== req.params.actor && !scope.includes('code')) return res.status(403).json({ error: 'consent_scope_denied' });
    res.setHeader('x-brain-version', got.meta.brain_version || '');
    res.json({ ...got.meta, contentBase64: got.content.toString('base64') });
  } catch (e) { internalError(res, e); }
});
// #43 self-serve fix (2026-07-04, Argus fa3d2137): the corpus/pack/manifest upload contract, served so no
// agent has to grep the source blind. Member-OR-owner gated like corpus-status/brains. Backed by
// contract/corpusUploadContract.json (shipped in the image; docs/ is not). `sha256` is over canonical JSON.
councilRouter.get('/bridge/corpus-contract', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const c = corpusUploadContract(); if (!c) return res.status(404).json({ error: 'contract_unavailable' });
    res.json({ ok: true, sha256: c.sha256, ...c.json });
  } catch (e) { internalError(res, e); }
});

// Plain-English meeting "translator" (owner request 2026-06-26). Owner-gated. Builds/serves an
// incremental plain-language summary + per-actor gist + per-turn plain lines for a meeting — so the
// cockpit can show a LIVE glance while a meeting runs, and the owner can read the meeting back later.
// Cheap + cached: through_seq = SPEAK turns covered; a poll with no new turns spends ZERO model tokens
// (returns the stored row). ?since=<seq> trims the returned per-turn list to seq >= since; the overall
// summary is always the full current state. 404 unknown id; { ok:false, notReady:true } before any turn.
councilRouter.get('/council/meeting/:id/summary', requireOwner, async (req, res) => {
  try {
    const m = await getMeeting(req.params.id);
    if (!m) return res.status(404).json({ error: 'not_found' });
    const transcript = Array.isArray(m.transcript) ? m.transcript : [];
    const speak = transcript
      .filter((t: any) => t && t.kind === 'speak' && t.payload)
      .map((t: any, i: number) => ({ seq: i, actor: String(t.actor || 'unknown'), text: clip(String(t.payload.text ?? ''), 4000) }));
    const nowCount = speak.length;
    const sinceRaw = req.query.since;
    const since = (sinceRaw != null && sinceRaw !== '') ? Math.max(0, Number(sinceRaw) || 0) : null;
    if (nowCount === 0) return res.json({ ok: false, notReady: true, meetingId: m.id, throughSeq: 0 });
    const prior = await getMeetingTranslation(m.id).catch(() => null);
    let allTurns: any[] = prior ? prior.turns : [];
    let summary = prior ? prior.summary : '';
    let perActor: any[] = prior ? prior.perActor : [];
    // Resume from ACTUAL coverage, not through_seq alone: if a prior call truncated (fewer gists than
    // turns), turns.length is the true watermark, so we re-translate the gap instead of dropping it.
    let cursor = Math.min(prior ? prior.throughSeq : 0, allTurns.length);
    // Translate in bounded batches so a long backfill can't truncate; advance ONLY by gists actually
    // produced. Cap calls per request to bound latency/spend — a very long meeting finishes over a few
    // polls. The cache means once covered, later polls cost zero.
    const BATCH = 6, MAX_CALLS = 6;
    let calls = 0, ledgerChanged = false;
    const led = (m.cost_ledger && m.cost_ledger.total) ? m.cost_ledger : { total: emptyTotals(), perAgent: {} };
    while (cursor < nowCount && calls < MAX_CALLS) {
      const batch = speak.slice(cursor, cursor + BATCH).map((t) => ({ seq: t.seq, actor: t.actor, text: t.text }));
      const out = await synthesizeMeetingTranslation(m.agenda || '', allTurns, batch);
      calls++;
      if (out.usage && (out.usage.input_tokens || out.usage.output_tokens)) {
        led.total = addUsage(led.total, OWNER_REPORT_MODEL, out.usage);
        led.perAgent['translator'] = addUsage(led.perAgent['translator'] || emptyTotals(), OWNER_REPORT_MODEL, out.usage);
        ledgerChanged = true;
      }
      const got = out.newGists.slice(0, batch.length);
      if (!got.length) break; // produced nothing this batch — stop (avoid a stall); a later poll retries
      allTurns = allTurns.concat(got);
      summary = out.summary || summary;
      perActor = out.perActor.length ? out.perActor : perActor;
      cursor += got.length;
      if (got.length < batch.length) break; // partial batch — persist progress; next poll resumes the gap
    }
    if (allTurns.length) {
      await saveMeetingTranslation(m.id, { throughSeq: cursor, summary, perActor, turns: allTurns, model: OWNER_REPORT_MODEL }).catch(() => {});
    }
    if (ledgerChanged) await setMeetingLedger(m.id, led).catch(() => {});
    const outTurns = (since != null) ? allTurns.filter((t) => Number(t.seq) >= since) : allTurns;
    res.json({ ok: true, meetingId: m.id, phase: m.phase, throughSeq: cursor, complete: cursor >= nowCount, summary, perActor, turns: outTurns });
  } catch (e) { internalError(res, e); }
});

// ---------- Hub-mediated agent transfer (owner vision 2026-06-26, Arke 8d00b58f) ----------
// The hub is the single source of truth for which machine each agent lives on (single-home), so an agent
// only ever authors on one PC. App side (Arke): drag-to-transfer UX + bundle package/unpack. All owner-gated.
const clipName = (s: any, n = 120) => String(s ?? '').trim().slice(0, n);

// Home registry — who lives where + whether a move is in flight.
councilRouter.get('/council/agents/home', requireOwner, async (_req, res) => {
  try { res.json({ ok: true, agents: await listAgentHomes() }); } catch (e) { internalError(res, e); }
});
// Owner sets/seeds (or clears) an agent's home machine, to populate the registry with current reality.
// { agent, machine } sets home; { agent, machine:"" } (or null) clears the row (e.g. a stray test entry).
// Ongoing moves keep the registry correct via completeTransfer's atomic flip.
councilRouter.post('/council/agents/home', requireOwner, async (req, res) => {
  try {
    const b = req.body || {};
    const agent = clipName(b.agent, 40);
    if (!agent) return res.status(400).json({ error: 'agent_required' });
    const machine = (b.machine === null || b.machine === undefined) ? '' : clipName(b.machine);
    if (machine) { await setAgentHome(agent, machine); } else { await deleteAgentHome(agent); }
    res.json({ ok: true, agent, home_machine: machine || null });
  } catch (e) { internalError(res, e); }
});

// ---------- Agent provisioning, app-driven (owner directive 2026-07-01) ----------
// Phase 1: each owner runs THEIR OWN hub instance and adds agents to it entirely through the app (the cockpit
// "add agent" wizard calls these two endpoints). Fully generic — any id/name, gated by OWNER auth only, nothing
// hardcoded per-agent, so a future user provisions their agents with zero hub-operator involvement.
// KEY INVARIANT: MEETING_DEFAULT (the founding roster) is ALSO the standards ratification quorum — standardStatus
// counts only MEETING_DEFAULT members, so a new seat can NEVER regress an already-adopted standard. New seats join
// the SEATING roster only (via the `council_seats` app_setting); they get seated in meetings once they have a fresh
// brain (the seat-everyone gate), but never change the ratification quorum. A registered seat with no brain reads
// no_brain and is excluded — so "registered before born" never lets an empty seat into a meeting.
const AGENT_ID_RE = /^[a-z][a-z0-9-]{1,30}$/;
async function extraSeats(): Promise<{ id: string; name: string }[]> {
  try {
    const raw = await getSetting('council_seats');
    if (!raw) return [];
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j.filter((s: any) => s && AGENT_ID_RE.test(String(s.id))).map((s: any) => ({ id: String(s.id), name: String(s.name || s.id) })) : [];
  } catch { return []; }
}
/** The full SEATING roster = founding seats + app-registered extra seats (deduped). Used by the readiness gate
 *  and meeting seating. NOT the ratification quorum (that stays MEETING_DEFAULT). */
async function seatingRoster(): Promise<string[]> {
  const extra = (await extraSeats()).map((s) => s.id).filter((id) => !MEETING_DEFAULT.includes(id));
  return [...MEETING_DEFAULT, ...extra];
}
councilRouter.post('/council/agents/register', requireOwner, async (req, res) => {
  try {
    const b = req.body || {};
    const id = String(b.id || '').toLowerCase();
    if (!AGENT_ID_RE.test(id)) return res.status(400).json({ error: 'bad_id', message: 'id must match ^[a-z][a-z0-9-]{1,30}$' });
    if (MEETING_DEFAULT.includes(id)) return res.status(409).json({ error: 'founding_seat', message: 'id is a founding seat; already seated' });
    const name = clip(b.name, 60) || id;
    const seats = await extraSeats();
    const found = seats.find((s) => s.id === id);
    if (!found) { seats.push({ id, name }); await setSetting('council_seats', JSON.stringify(seats)); }
    else if (b.name && found.name !== name) { found.name = name; await setSetting('council_seats', JSON.stringify(seats)); }
    res.json({ ok: true, id, name, autoJoin: b.autoJoin !== false, seats: await seatingRoster() });
  } catch (e) { internalError(res, e); }
});
// whoami (Arke, 2026-07-02): echo the actor a presented secret maps to, so a new member self-verifies its
// identity instead of probing for=<id> empirically. Any valid secret; 401 otherwise.
councilRouter.get('/council/whoami', async (req, res) => {
  try {
    const a = await resolveActor(req);
    if (!a) return res.status(401).json({ error: 'unauthorized' });
    res.json({ actor: a.actor, admin: a.admin });
  } catch (e) { internalError(res, e); }
});
// Member self-activation (Arke, 2026-07-02): a member sets ITS OWN displayName/charter with its own secret.
// Scoped to the caller (a.actor) only — never another member, never a privilege change; owner may also call.
councilRouter.post('/council/me/profile', async (req, res) => {
  try {
    const a = await resolveActor(req);
    if (!a) return res.status(401).json({ error: 'unauthorized' });
    const b = req.body || {};
    const displayName = b.displayName != null ? clip(b.displayName, 60) : undefined;
    const charter = b.charter != null ? clip(b.charter, 4000) : undefined;
    if (displayName === undefined && charter === undefined) return res.status(400).json({ error: 'nothing_to_update', message: 'provide displayName and/or charter' });
    await setMemberProfile(a.actor, displayName, charter);
    res.json({ ok: true, actor: a.actor, displayName: displayName ?? null, charterSet: charter !== undefined });
  } catch (e) { internalError(res, e); }
});
// #53 living handbook (owner directive via Arke, 2026-07-02): ONE canonical, versioned best-practices doc the
// hub serves so every project injects/re-pulls the same always-current copy. GET is member-or-owner; POST is
// owner-only and bumps the version (meetings update it on standard adoption via the owner-token path).
councilRouter.get('/council/handbook', async (req, res) => {
  try {
    const a = await resolveActor(req);
    if (!a) return res.status(401).json({ error: 'unauthorized' });
    res.json(await getHandbookDoc());
  } catch (e) { internalError(res, e); }
});
councilRouter.post('/council/handbook', requireOwner, async (req, res) => {
  try {
    const md = String((req.body || {}).markdown ?? '');
    if (!md.trim()) return res.status(400).json({ error: 'empty_markdown' });
    const r = await setHandbookDoc(md);
    res.json({ ok: true, version: r.version, updatedAt: r.updatedAt });
  } catch (e) { internalError(res, e); }
});
councilRouter.get('/council/agents/:id/secret', requireOwner, async (req, res) => {
  try {
    const id = String(req.params.id || '').toLowerCase();
    if (!AGENT_ID_RE.test(id)) return res.status(400).json({ error: 'bad_id' });
    if (MEETING_DEFAULT.includes(id)) return res.status(409).json({ error: 'founding_seat', message: 'refusing to expose a founding-seat secret' });
    // Idempotent: the member row stores the secret in the vault (recoverable on read), so a re-fetch returns the
    // SAME secret. Mint on first request for a not-yet-provisioned seat. The value is returned to the app to write
    // into the new agent's .env (as <ID>_SECRET) and is NEVER logged hub-side. Creating the member row also enables
    // the agent's brain-upload / corpus-status / manifest paths (they key on the members table, same as every seat).
    const existing = await getMember(id);
    if (existing && existing.secret) return res.json({ ok: true, id, secret: existing.secret, minted: false });
    const secret = crypto.randomBytes(24).toString('base64url');
    await upsertMember({ name: id, base_url: `https://cowork.local/${id}`, rules: 'Council agent (app-provisioned).', capabilities: [] }, secret);
    res.json({ ok: true, id, secret, minted: true });
  } catch (e) { internalError(res, e); }
});

// Stage a move: marks the agent in_transit (single-home invariant — refuses a second concurrent move).
councilRouter.post('/council/transfer/initiate', requireOwner, async (req, res) => {
  try {
    const b = req.body || {};
    const agent = clipName(b.agent, 40); const from = clipName(b.from_machine); const to = clipName(b.to_machine);
    if (!agent || !to) return res.status(400).json({ error: 'agent_and_to_machine_required' });
    const id = crypto.randomUUID();
    const r = await initiateTransfer(id, agent, from, to);
    if (!r.ok) return res.status(409).json({ error: r.reason || 'conflict' });
    res.json({ ok: true, transfer_id: id, status: 'staged' });
  } catch (e) { internalError(res, e); }
});

// Source uploads the SUBSTRATE bundle (base64) — memory + council/ folder + app config. Code travels via git;
// brain pack/corpus already live on the hub. Large body: see the per-path json limit in server.ts.
councilRouter.post('/council/transfer/:id/bundle', requireOwner, async (req, res) => {
  try {
    const t = await getTransfer(req.params.id);
    if (!t) return res.status(404).json({ error: 'not_found' });
    if (t.status === 'completed') return res.status(409).json({ error: 'already_completed' });
    const b = req.body || {};
    const contentB64 = String(b.content_b64 || '');
    if (!contentB64) return res.status(400).json({ error: 'content_b64_required' });
    let buf: Buffer;
    try { buf = Buffer.from(contentB64, 'base64'); } catch { return res.status(400).json({ error: 'bad_base64' }); }
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (b.sha256 && String(b.sha256).toLowerCase() !== sha) return res.status(400).json({ error: 'sha256_mismatch', computed: sha });
    await saveTransferBundle(req.params.id, contentB64, sha, buf.length);
    res.json({ ok: true, transfer_id: req.params.id, status: 'bundled', sha256: sha, size: buf.length });
  } catch (e) { internalError(res, e); }
});

// Destination polls for bundled transfers addressed to it.
councilRouter.get('/council/transfers', requireOwner, async (req, res) => {
  try {
    const to = clipName(req.query.to_machine);
    if (!to) return res.status(400).json({ error: 'to_machine_required' });
    res.json({ ok: true, transfers: await listTransfersForMachine(to) });
  } catch (e) { internalError(res, e); }
});

// Transfer status (either side may check).
councilRouter.get('/council/transfer/:id', requireOwner, async (req, res) => {
  try { const t = await getTransfer(req.params.id); if (!t) return res.status(404).json({ error: 'not_found' }); res.json({ ok: true, transfer: t }); }
  catch (e) { internalError(res, e); }
});

// Destination downloads the substrate bundle.
councilRouter.get('/council/transfer/:id/bundle', requireOwner, async (req, res) => {
  try {
    const t = await getTransfer(req.params.id);
    if (!t) return res.status(404).json({ error: 'not_found' });
    const bundle = await getTransferBundle(req.params.id);
    if (!bundle) return res.status(404).json({ error: 'no_bundle' });
    res.json({ ok: true, transfer_id: req.params.id, agent: t.agent, content_b64: bundle.contentB64, sha256: bundle.sha256, size: bundle.size });
  } catch (e) { internalError(res, e); }
});

// Destination confirms unpack — hub ATOMICALLY flips home_machine to the destination + clears in_transit.
// After this, only the destination is 'home'; the source app tears down its local copy (stops authoring).
councilRouter.post('/council/transfer/:id/complete', requireOwner, async (req, res) => {
  try {
    const to = clipName((req.body || {}).to_machine);
    if (!to) return res.status(400).json({ error: 'to_machine_required' });
    const r = await completeTransfer(req.params.id, to);
    if (!r.ok) return res.status(r.reason === 'not_found' ? 404 : 409).json({ error: r.reason || 'conflict' });
    const t = await getTransfer(req.params.id);
    res.json({ ok: true, transfer: t });
  } catch (e) { internalError(res, e); }
});

// #46: owner aborts an in-flight move. Sets the transfer `cancelled` (terminal) from any non-completed state
// and releases the single-home lock (the agent returns home on its SOURCE). Idempotent: a re-cancel is 200;
// a completed transfer can't be cancelled (409 already_completed). Makes the abort an explicit, named state
// instead of a transfer silently abandoned at `bundled`/`staged`.
councilRouter.post('/council/transfer/:id/cancel', requireOwner, async (req, res) => {
  try {
    const r = await cancelTransfer(req.params.id);
    if (!r.ok) return res.status(r.reason === 'not_found' ? 404 : 409).json({ error: r.reason || 'conflict' });
    const t = await getTransfer(req.params.id);
    res.json({ ok: true, transfer: t });
  } catch (e) { internalError(res, e); }
});

// Machine PRESENCE registry (Arke cef127e6, 2026-06-26). Each app instance registers its hostname on launch
// + ~60s heartbeat so the transfer destination can be a dropdown. Presence only; agent_homes stays the
// source of truth for where each agent lives. Owner-gated. A machine is marked stale if unseen > 5 min.
councilRouter.post('/council/machines/register', requireOwner, async (req, res) => {
  try {
    const name = clipName((req.body || {}).machine_name, 120);
    if (!name) return res.status(400).json({ error: 'machine_name_required' });
    await registerMachine(name);
    res.json({ ok: true, machine_name: name });
  } catch (e) { internalError(res, e); }
});
councilRouter.get('/council/machines', requireOwner, async (_req, res) => {
  try {
    const rows = await listMachines();
    const now = Date.now();
    const machines = rows.map((m) => ({ machine_name: m.machine_name, last_seen: m.last_seen, stale: (now - Date.parse(m.last_seen)) > 5 * 60_000 }));
    res.json({ ok: true, machines });
  } catch (e) { internalError(res, e); }
});

// ---------- Hub-side v2 auto-scheduler (owner 2026-06-18) ----------
// Fires the SAME open + run-autonomous sequence the external trigger does, but from inside the hub on a
// timer — so meeting-scheduling no longer depends on any computer being on. Two gates: the owner-toggleable
// app_setting 'hub_meeting_scheduler'=='on' (default OFF; flip via POST /api/council/scheduler), AND the
// existing money gate VOICE_LOOP_ENABLED. Once per Toronto day, and never over a live meeting (no double-fire).
const SCHED_AGENDA = 'daily council meeting: code review, backlog, friction log, owner summaries, story updates';
let lastSchedDate = '';
async function schedulerEnabled(): Promise<boolean> {
  try { return (await getSetting('hub_meeting_scheduler')) === 'on'; } catch { return false; }
}
const VALID_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
async function getSchedTime(): Promise<string> {
  try { const t = String(await getSetting('hub_meeting_time') || ''); return VALID_HHMM.test(t) ? t : '03:00'; } catch { return '03:00'; }
}
// #47 (convergence meeting d5cb11ce, 2026-06-27): the next scheduled fire as a UTC ISO instant, so each
// seat's prep ritual can assert(fresh_until > next_fire_at) off the hub instead of hardcoding 03:00 ET.
// Returns null when the scheduler is OFF (nothing scheduled to assert against). DST-correct: resolves the
// Toronto zone offset AT the candidate instant (two-pass, handles spring-forward / fall-back edges) so a
// 03:00 Toronto fire maps to the right UTC hour year-round without a tz library.
function tzWallAsUtcMs(d: Date): number {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value || '0');
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
}
function torontoWallToUtc(y: number, mo: number, d: number, hh: number, mm: number): Date {
  const guess = Date.UTC(y, mo - 1, d, hh, mm, 0);          // treat the wall time as if it were UTC
  let off = tzWallAsUtcMs(new Date(guess)) - guess;         // zone offset at that guess instant
  let real = guess - off;
  off = tzWallAsUtcMs(new Date(real)) - real;               // re-resolve at the corrected instant (DST edge)
  real = guess - off;
  return new Date(real);
}
async function nextFireAtUtc(): Promise<string | null> {
  if (!(await schedulerEnabled())) return null;
  const [hh, mm] = (await getSchedTime()).split(':').map(Number);
  const { date } = torontoParts();                          // today's Toronto calendar date
  const [y, mo, d] = date.split('-').map(Number);
  let fire = torontoWallToUtc(y, mo, d, hh, mm);
  if (fire.getTime() <= Date.now()) fire = torontoWallToUtc(y, mo, d + 1, hh, mm); // past today -> tomorrow (Date.UTC normalizes day overflow)
  return fire.toISOString();
}

// #35 (meeting 2026-06-22, ratified family-wide): the /api/health "missed_meeting" signal. Computed
// HUB-SIDE so the cockpit does ZERO threshold math — Arke/Nova render the boolean + timestamp tooltip,
// Logos logs the ISO lag. The threshold is the daily cadence (24h) + a fixed grace, NOT a magic 26h.
// `missed_meeting` is time-based, with one refinement (#41, 2026-06-26): a RECENT intentional scheduler
// decision (skipped_quorum / already_live) clears it, but a scheduler that is OFF or DEAD still reads true
// (the loop IS dark) — `scheduler_enabled` is what lets the badge say "disabled" (grey) vs "MISSED MEETING"
// (alarm). Fail-soft throughout: any read error returns a safe default so /api/health never throws (Railway
// liveness probe must always get a 200).
const SCHED_INTERVAL_MS = 24 * 60 * 60 * 1000; // hub scheduler fires once per Toronto day
const SCHED_GRACE_MS = 2 * 60 * 60 * 1000;     // grace past the daily mark before we call it missed
export async function healthMeetingSignal(): Promise<{ last_meeting_created_at: string | null; missed_meeting: boolean; scheduler_enabled: boolean; last_scheduler_status: string | null }> {
  let last_meeting_created_at: string | null = null;
  let scheduler_enabled = false;
  try { scheduler_enabled = (await getSetting('hub_meeting_scheduler')) === 'on'; } catch { /* default false */ }
  try { last_meeting_created_at = await latestRealMeetingCreatedAtUtc(); } catch { /* default null */ }
  let missed_meeting = true; // no meeting on record => missed by definition
  if (last_meeting_created_at) {
    const ageMs = Date.now() - Date.parse(last_meeting_created_at);
    missed_meeting = ageMs > (SCHED_INTERVAL_MS + SCHED_GRACE_MS);
  }
  // #36: the last scheduled-fire decision (opened | skipped_quorum | no_voice_loop | already_live | error |
  // null). Lets the cockpit distinguish an intentional readiness SKIP from a real miss without exposing seats.
  let last_scheduler_status: string | null = null;
  let last_scheduler_at: string | null = null;
  try { const r = await latestSchedulerRun(); if (r) { last_scheduler_status = String(r.status); last_scheduler_at = r.fired_at ?? null; } } catch { /* default null */ }
  // #41 (2026-06-26): a RECENT, INTENTIONAL scheduler decision is not a missed meeting. When the readiness
  // gate deliberately held the meeting (`skipped_quorum`) or one was already live (`already_live`), the loop
  // did its job — clear the alarm so the badge reads yellow, not red. Gated on RECENCY: only a run within the
  // daily cadence + grace can suppress, so a DEAD scheduler (no run in >26h) still reads missed=true and is
  // never masked. Scheduler-OFF states (no_voice_loop / scheduler off) keep missed=true (loop is genuinely
  // dark); `scheduler_enabled` flips the badge to "disabled" (grey) vs "MISSED MEETING" (alarm).
  if (missed_meeting && last_scheduler_at && (last_scheduler_status === 'skipped_quorum' || last_scheduler_status === 'already_live')) {
    const runAgeMs = Date.now() - Date.parse(last_scheduler_at);
    if (runAgeMs <= (SCHED_INTERVAL_MS + SCHED_GRACE_MS)) missed_meeting = false;
  }
  return { last_meeting_created_at, missed_meeting, scheduler_enabled, last_scheduler_status };
}
// #36 readiness gate (owner 2026-06-24). A seat is FRESH if it has a committed pack whose sha differs from
// the pack sha it carried at the meeting it last attended (sha equality, not timestamps — Nova's clock-skew
// fix); a seat with no committed pack is NO_BRAIN; a seat whose pack is unchanged since last attendance is
// STALE. A seat with no recorded attendance yet reads FRESH (fail-toward-inclusive: never exclude on missing
// history). FIRING (owner 2026-06-29): the scheduler fires only when >= QUORUM_MIN seats are FRESH (>=2 seats
// arrive with new material), but it then SEATS EVERYONE WITH A BRAIN - fresh seats as contributors, stale seats
// as listeners (told in-band via the agenda) - and excludes ONLY no_brain seats. A quiet night (<2 fresh) skips.
// #57 (meeting 7ddcb23c 2026-07-04): `reason` REFINES `status` for the excluded[]/brains surface without
// changing WHO is seated. It splits a `stale` seat into `stale` (has genuine accepted history — merely did
// not re-pack) vs `no_accepted_history`/`onboarding` (a pack committed but NEVER seated in a real meeting).
// The seating decision still keys ONLY on `status` (fresh->contributor, stale->listener, no_brain->excluded),
// so `reason` is purely descriptive metadata and can NEVER bench a seat or starve quorum. Enum pinned in
// RESPONSE_SHAPES.md; consumed by Logos's #47 admin predicate + page.
type ReadinessReason = 'fresh' | 'stale' | 'no_brain' | 'no_accepted_history' | 'onboarding';
type SeatReadiness = { actor: string; status: 'fresh' | 'stale' | 'no_brain'; reason: ReadinessReason; packSha: string | null; lastPackSha: string | null; packedAt: string | null; dirtyStreak?: number };
const QUORUM_MIN = 2; // a scheduled meeting needs at least this many freshly-prepped seats to fire
async function computeReadiness(): Promise<SeatReadiness[]> {
  const out: SeatReadiness[] = [];
  // #57 two-signal debounce (Argus catch): a never-accepted stale seat reads `onboarding` (transient) on
  // first sight and only ESCALATES to `no_accepted_history` once the SAME never-accepted reason persisted
  // across the PREVIOUS scheduler run AND its pack committed_at has NOT advanced since that run fired (a
  // genuinely stuck onboarding, not a mid-upload race where corpus/manifest land minutes after the pack).
  // Read the prior run BEFORE recording this one (fire path records after computeReadiness), so this is the
  // last decision, never the current. Best-effort: no prior run -> every never-accepted seat starts `onboarding`.
  const prevReason = new Map<string, string>();
  let prevAtMs: number | null = null;
  try {
    const prev = await latestSchedulerRun();
    if (prev) {
      prevAtMs = prev.fired_at ? Date.parse(prev.fired_at) : null;
      for (const e of (Array.isArray(prev.excluded) ? prev.excluded : [])) {
        if (e && e.actor) prevReason.set(String(e.actor), String(e.reason || ''));
      }
    }
  } catch { /* no prior run readable -> onboarding-first, never escalate falsely */ }
  // Score the full SEATING roster (founding + app-registered seats), so a newly-provisioned agent is scored
  // (no_brain until it uploads) and seated once fresh. The ratification quorum stays MEETING_DEFAULT.
  for (const actor of await seatingRoster()) {
    let packMeta: any = null;
    try { packMeta = await getBrainV2Meta(actor, 'pack'); } catch { /* treat as no_brain below */ }
    const packSha = packMeta ? String(packMeta.sha256) : null;
    const packedAt = packMeta ? (packMeta.committed_at || null) : null; // #47: server-stamped pack commit time (UTC ISO)
    if (!packSha) { out.push({ actor, status: 'no_brain', reason: 'no_brain', packSha: null, lastPackSha: null, packedAt: null }); continue; }
    let lastPackSha: string | null = null;
    try { lastPackSha = await lastAttendedPackSha(actor); } catch { lastPackSha = null; }
    // #4 (2026-06-30): freshness = sha changed AND RECENT. A pack whose sha moved but was committed >26h ago
    // predates the last daily cycle, so it is not "new material for tonight" and attends as a LISTENER, not a
    // contributor. SAFE-DEMOTE ONLY: a null/unparseable packedAt (age unprovable) never demotes, so a missing
    // timestamp can never bench a seat or starve quorum. 26h > the 24h cadence + grace so a nightly re-pack stays fresh.
    const FRESH_FLOOR_MS = 26 * 60 * 60 * 1000;
    const shaChanged = (lastPackSha === null || packSha !== lastPackSha);
    const ageMs = packedAt ? (Date.now() - Date.parse(packedAt)) : null;
    const recent = ageMs === null || !Number.isFinite(ageMs) || ageMs < FRESH_FLOOR_MS;
    let status: SeatReadiness['status'] = (shaChanged && recent) ? 'fresh' : 'stale';
    // #52: an agent with >= 3 consecutive dirty-tree packs is demoted to LISTENER regardless of content
    // freshness, until a clean pack resets the streak. Safe-demote-only: 0/absent never demotes, so this can
    // never bench a seat or starve quorum on its own.
    let dirtyStreak = 0;
    try { dirtyStreak = await getDirtyStreak(actor); } catch { dirtyStreak = 0; }
    if (status === 'fresh' && dirtyStreak >= 3) status = 'stale';
    // #57: refine the reason for the excluded[]/brains surface. A stale seat WITH accepted history is plain
    // `stale`; a stale seat that has NEVER been seated in a real meeting (lastPackSha === null) is
    // `onboarding` on first sight, escalating to `no_accepted_history` only under the two-signal debounce.
    let reason: ReadinessReason;
    if (status === 'fresh') reason = 'fresh';
    else if (lastPackSha !== null) reason = 'stale';
    else {
      const wasFlagged = ['no_accepted_history', 'onboarding'].includes(prevReason.get(actor) ?? '');
      const packedAtMs = packedAt ? Date.parse(packedAt) : NaN;
      const noMovement = prevAtMs !== null && Number.isFinite(packedAtMs) && packedAtMs <= prevAtMs;
      reason = (wasFlagged && noMovement) ? 'no_accepted_history' : 'onboarding';
    }
    out.push({ actor, status, reason, packSha, lastPackSha, packedAt, dirtyStreak });
  }
  return out;
}
async function fireScheduledMeeting(): Promise<void> {
  if (process.env.VOICE_LOOP_ENABLED !== 'true') { console.warn('[hub:sched] skip — VOICE_LOOP_ENABLED not true'); await recordSchedulerRun('no_voice_loop', null, [], [], {}).catch(() => {}); return; }
  const tok = process.env.COUNCIL_ADMIN_TOKEN; if (!tok) { console.warn('[hub:sched] skip — no admin token'); return; }
  try { const live = (await listMeetings()).some((mm: any) => mm.phase === 'rounds'); if (live) { console.warn('[hub:sched] skip — a meeting is already live'); await recordSchedulerRun('already_live', null, [], [], {}).catch(() => {}); return; } } catch { /* if the live-check fails, do NOT fire (fail closed) */ return; }
  // Readiness gate: fire only with the freshly-prepped quorum; keep stale/no-brain seats OUT and RECORD why.
  let readiness: SeatReadiness[] = [];
  try { readiness = await computeReadiness(); } catch (e) { console.warn('[hub:sched] readiness error: ' + (e as Error).message); await recordSchedulerRun('error', null, [], [], { error: (e as Error).message }).catch(() => {}); return; }
  // Owner 2026-06-29 redesign: a meeting FIRES when >= QUORUM_MIN seats arrive with NEW material since the last
  // meeting (something to say), but once it fires we SEAT EVERYONE who has a committed brain. Fresh seats are
  // CONTRIBUTORS; stale seats ATTEND AS LISTENERS (present to hear + give feedback, NOT to re-litigate an
  // unchanged brain). Only no_brain seats can't be seated (no persona/context to run a voice). This replaces the
  // old "exclude every stale seat" gate - nobody is benched for a quiet day - while a fully quiet night (no fresh
  // material anywhere) still skips. The listener instruction rides the agenda (buildSystem injects it into every
  // voice's persona), so no schema or voice-loop change is needed. Recorded contributors/listeners in the run.
  const fresh = readiness.filter((r) => r.status === 'fresh').map((r) => r.actor);
  const stale = readiness.filter((r) => r.status === 'stale').map((r) => r.actor);
  const noBrain = readiness.filter((r) => r.status === 'no_brain').map((r) => r.actor);
  const excluded = noBrain.map((a) => ({ actor: a, reason: 'no_brain' }));
  if (fresh.length < QUORUM_MIN) {
    console.warn(`[hub:sched] skip - quorum not met (${fresh.length}/${QUORUM_MIN} with new material): ${readiness.map((r) => r.actor + '=' + r.status).join(', ')}`);
    await recordSchedulerRun('skipped_quorum', null, [], readiness.filter((r) => r.status !== 'fresh').map((r) => ({ actor: r.actor, reason: r.reason })), { fresh, stale, freshCount: fresh.length, quorumMin: QUORUM_MIN, readiness }).catch(() => {});
    return;
  }
  const seated = [...fresh, ...stale];
  const rolesPreamble = stale.length
    ? `MEETING ROLES (owner 2026-06-29): CONTRIBUTORS arriving with new work since the last meeting = [${fresh.join(', ')}]. LISTENERS whose brain is unchanged since the last meeting = [${stale.join(', ')}] - attend to LISTEN and give feedback on others' work; do NOT re-raise or re-litigate items already settled, and pass early once you have given your feedback.\n\n`
    : '';
  const base = `http://127.0.0.1:${process.env.PORT || '8080'}`;
  const H = { 'x-admin-token': tok, 'content-type': 'application/json' };
  try {
    const openRes = await fetch(base + '/api/meeting/open', { method: 'POST', headers: H, body: JSON.stringify({ participants: seated, agenda: rolesPreamble + SCHED_AGENDA }) });
    if (!openRes.ok) { console.warn('[hub:sched] open failed ' + openRes.status); await recordSchedulerRun('error', null, seated, excluded, { openStatus: openRes.status, freshCount: fresh.length, contributors: fresh, listeners: stale }).catch(() => {}); return; }
    const open: any = await openRes.json();
    const id = open.meetingId;
    const runRes = await fetch(base + `/api/council/meeting/${id}/run-autonomous`, { method: 'POST', headers: H, body: JSON.stringify({}) });
    console.log(`[hub:sched] opened ${id} seats=[${seated.join(',')}] contributors=[${fresh.join(',')}] listeners=[${stale.join(',')}] excluded=[${excluded.map((e) => e.actor + ':' + e.reason).join(',')}] + run-autonomous -> ${runRes.status}`);
    await recordSchedulerRun('opened', id, seated, excluded, { runStatus: runRes.status, freshCount: fresh.length, contributors: fresh, listeners: stale }).catch(() => {});
  } catch (e) { console.warn('[hub:sched] fire error: ' + (e as Error).message); await recordSchedulerRun('error', null, seated, excluded, { error: (e as Error).message, freshCount: fresh.length, contributors: fresh, listeners: stale }).catch(() => {}); }
}

export function startScheduler(): void {
  // On-boot stale-close (§3 robustness): any meeting still marked voice_running died with a prior
  // process (Railway redeploy/crash mid-loop). Mark them endedReason hub_restart so they never zombie.
  closeStaleVoiceMeetings().then((n) => { if (n) console.log(`✓ closed ${n} stale voice meeting(s) on boot (hub_restart)`); }).catch(() => {});
  // Loud-failure guard (#5, 2026-06-30): the 30s tick used to swallow every error ("keep ticking"), so a
  // persistently-broken loop would silently no-op forever. Now each failure is LOGGED, and after a run of
  // consecutive failures we exit(1) so Railway restarts a clean process instead of spinning half-dead.
  const SWEEP_MAX_CONSECUTIVE_FAILS = 5;
  let sweepFails = 0;
  setInterval(async () => {
    try {
      const { date, hhmm } = torontoParts();
      // Hub-side v2 auto-scheduler (owner 2026-06-18) — independent of the dead v1 COUNCIL_PAUSED gate;
      // its own app_setting + VOICE_LOOP_ENABLED gates. Fires at the app-configured time (default 03:00
      // Toronto). Replaces the external trigger task.
      if (lastSchedDate !== date && await schedulerEnabled()) {
        if (hhmm === await getSchedTime()) {
          lastSchedDate = date; await fireScheduledMeeting();
          // Sentry cron check-in: the daily job RAN (any decision). A MISSED check-in = the scheduler died
          // silently = the council stopped meeting with nobody noticing. Schedule tracks the configured time.
          const [sh, sm] = hhmm.split(':');
          cronCheckIn('nightly-council-meeting', 'ok', `${Number(sm)} ${Number(sh)} * * *`, 'America/Toronto');
        }
      }
      // Daily outbox retention sweep (council 2026-06-07) — quiet hour, after the meeting window. Runs even while paused.
      if (hhmm === '04:30' && lastSweepDate !== date) { lastSweepDate = date; await sweepOutbox(); await sweepEnvTasks(); }
      // #46: every tick, mark any bundled transfer past its flip_deadline `receive_stalled` so a dead/offline
      // destination surfaces LOUD within ~30s instead of hanging on the app's "finishing" guess. Cheap UPDATE.
      try { const n = await stampStalledTransfers(); if (n) console.log(`[hub:transfer] stamped ${n} stalled transfer(s) receive_stalled`); } catch { /* best-effort: a stall-stamp miss is not a tick failure */ }
      sweepFails = 0; // a tick that reached the end cleanly clears the consecutive-failure streak
    } catch (e) {
      sweepFails++;
      console.warn(`[hub:sched] tick failure ${sweepFails}/${SWEEP_MAX_CONSECUTIVE_FAILS}: ${(e as Error).message}`);
      if (sweepFails >= SWEEP_MAX_CONSECUTIVE_FAILS) { console.error('[hub:fatal] scheduler tick failing repeatedly; exiting(1) for a clean restart'); process.exit(1); }
    }
  }, 30000);
}

/** Ensure architect-council is registered as a member of itself (idempotent, at boot). */
export async function selfRegister(): Promise<void> {
  const secret = process.env.COUNCIL_MEMBER_SECRET;
  if (!secret) return;
  const base = process.env.SELF_BASE_URL || 'https://architectscouncil.com';
  await upsertMember({ name: SELF, base_url: base, owner_email: process.env.OWNER_EMAIL, rules: 'The hub itself, participating as a member.', capabilities: CAPABILITIES }, secret);
}
