/**
 * Routers for the Architects Council hub:
 *  - bridgeRouter  (/api/bridge/*)  : architect-council's OWN member endpoints (it's a brain too).
 *  - councilRouter (/api/council/*) : the broker — register, orchestrator relay, convos, console API.
 * Auth: members use x-bridge-secret (the hub's own COUNCIL_MEMBER_SECRET); admin/console use x-admin-token.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import { architectReply, reviewProposal, councilBrain, summarize, extractTakeaways } from './architect.js';
import {
  upsertMember, listMembers, getMember, getBrain, setBrain,
  createConvo, updateConvo, getConvo, listConvos, consumeJoinToken, issueJoinToken,
  setTakeaways, getLatestTakeaways, recentConvoActivity, type Turn,
  queueOutbox, pendingOutbox, markOutboxDelivered, ackOutbox,
  getBacklog, setBacklog,
} from './store.js';

const clip = (s: any, n: number) => String(s ?? '').slice(0, n);
const SELF = 'architect-council';
const DISPLAY_NAME = 'Arke'; // chosen name (council canon 2026-06-06); ping contract field
const CONTRACT_VERSION = 1;
const CAPABILITIES = ['ask', 'brain', 'review', 'orchestrate', 'register', 'outbox'];

// ---------- Member side (the hub is itself a brain) -------------------------
export const bridgeRouter = Router();
function requireMemberSecret(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.COUNCIL_MEMBER_SECRET;
  if (!secret) return res.status(503).json({ error: 'bridge_not_configured', message: 'Set COUNCIL_MEMBER_SECRET to enable the hub bridge.' });
  if ((req.headers['x-bridge-secret'] as string) !== secret) return res.status(401).json({ error: 'unauthorized' });
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
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
bridgeRouter.get('/bridge/brain', requireMemberSecret, (_req, res) => res.json({ project: SELF, brain: councilBrain(), updatedAt: new Date().toISOString() }));
bridgeRouter.post('/bridge/review', requireMemberSecret, async (req, res) => {
  try { res.json(await reviewProposal(req.body || {})); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// ---------- Broker side -----------------------------------------------------
export const councilRouter = Router();
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const tok = process.env.COUNCIL_ADMIN_TOKEN;
  if (!tok) return res.status(503).json({ error: 'admin_not_configured', message: 'Set COUNCIL_ADMIN_TOKEN to use the console.' });
  if ((req.headers['x-admin-token'] as string) !== tok) return res.status(401).json({ error: 'unauthorized' });
  next();
}

/** Call a member's bridge /ask with its vault secret. Defensive parse (Zen AI pattern). */
async function askMember(member: { name: string; base_url: string; secret: string }, body: any): Promise<{ reply: string; done: boolean }> {
  try {
    const res = await fetch(member.base_url.replace(/\/+$/, '') + '/api/bridge/ask', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-bridge-secret': member.secret },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { reply: `(error: HTTP ${res.status})`, done: true };
    const d: any = await res.json();
    let reply = String(d.reply ?? ''), done = d.done === true;
    // Some members return their reply still wrapped (```json fences and/or a raw {"reply":...} JSON string) — unwrap it.
    let inner = reply.trim();
    if (inner.startsWith('```')) inner = inner.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
    if (inner.startsWith('{') && inner.includes('"reply"')) {
      const a = inner.indexOf('{'), b = inner.lastIndexOf('}');
      if (a >= 0 && b > a) { try { const p = JSON.parse(inner.slice(a, b + 1)); if (p.reply) { inner = String(p.reply); done = done || p.done === true; } } catch { /* keep inner as-is */ } }
    }
    if (inner) reply = inner;
    return { reply: clip(reply, 4000) || '(empty reply)', done };
  } catch (e) { return { reply: `(unreachable: ${(e as Error).message})`, done: true }; }
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
    const adminOk = !!process.env.COUNCIL_ADMIN_TOKEN && (req.headers['x-admin-token'] as string) === process.env.COUNCIL_ADMIN_TOKEN;
    if (!adminOk) {
      if (!join_token || !(await consumeJoinToken(String(join_token)))) return res.status(401).json({ error: 'invalid_or_expired_join_token' });
    }
    const reachable = await pingMember(String(base_url), String(secret));
    await upsertMember({ name: clip(name, 60), base_url: String(base_url), owner_email, rules: clip(rules, 4000), capabilities: Array.isArray(capabilities) ? capabilities : [] }, String(secret));
    res.json({ ok: true, member_id: clip(name, 60), reachable });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

councilRouter.post('/council/join-token', requireAdmin, async (req, res) => {
  try { const token = await issueJoinToken(clip((req.body || {}).label, 80) || 'invite', Number((req.body || {}).ttlHours) || 24); res.json({ ok: true, token }); }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

councilRouter.get('/council/members', requireAdmin, async (_req, res) => {
  try { res.json({ members: await listMembers() }); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

councilRouter.get('/council/member/:name/brain', requireAdmin, async (req, res) => {
  try {
    const m = await getMember(req.params.name);
    if (!m) return res.status(404).json({ error: 'unknown_member' });
    try {
      const r = await fetch(m.base_url.replace(/\/+$/, '') + '/api/bridge/brain', { headers: { 'x-bridge-secret': m.secret } });
      if (r.ok) { const d: any = await r.json(); await setBrain(m.name, d.brain || ''); return res.json({ project: m.name, brain: d.brain || '', updatedAt: d.updatedAt }); }
    } catch { /* fall back to cache */ }
    const cached = await getBrain(m.name);
    res.json({ project: m.name, brain: cached.content, updatedAt: cached.updatedAt, cached: true });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// ---------- Orchestrator: N-member round-robin relay (hub has no opinion; it brokers) ----------
async function runCouncil(id: string, topic: string, memberNames: string[], maxRounds: number): Promise<void> {
  const members = (await Promise.all(memberNames.map((n) => getMember(n)))).filter(Boolean) as Array<{ name: string; base_url: string; secret: string }>;
  if (members.length < 1) { await updateConvo(id, { status: 'error', summary: 'No reachable members.' }); return; }
  // architect-council leads: it initiates every conversation it takes part in (owner's rule).
  const selfIdx = members.findIndex((m) => m.name === SELF);
  if (selfIdx > 0) members.unshift(...members.splice(selfIdx, 1));
  const transcript: Turn[] = [];
  const outboxDelivered = new Set<string>();
  const persist = async (st: string) => { try { await updateConvo(id, { transcript, status: st }); } catch { /* best-effort */ } };
  let msg = clip(topic, 4000), from = 'council';
  let status = 'cap';
  const cap = Math.min(Math.max(1, maxRounds || 10), 150); // owner-approved ceiling; "done" ends it sooner
  const order = members.map((m) => m.name).join(' → ');
  for (let i = 0; i < cap; i++) {
    const member = members[i % members.length];
    // Every member knows the circle and the budget (owner's rule): meta line travels with the message, not the transcript.
    const meta = `[council meta — turn ${i + 1} of max ${cap} | circle: ${order} | you are ${member.name}, ~${Math.max(1, Math.ceil((cap - i) / members.length))} of your turns left | norms (owner's rule): speak plainly and technically, out of character is welcome — the goal is making each other more efficient at what you are meant to be; share actual code, specs and commands whenever useful | when the discussion has served its purpose, close by assigning YOURSELF homework (what you learned tonight that you suggest implementing in your own project, within your rules) and set done:true]`;
    // History window: members get the last 30 turns minus the latest (which travels as `message`).
    // Deep-copy at the relay boundary so no member can mutate the shared transcript (council decision 2026-06-06, ~5ms cost accepted).
    const hist = transcript.length ? transcript.slice(0, -1).slice(-30).map((t) => ({ speaker: t.speaker, text: t.text })) : [];
    // Outbox delivery (council decision 2026-06-06): each member receives its queued notes once, at its first turn.
    let outboxNote = '';
    if (!outboxDelivered.has(member.name)) {
      outboxDelivered.add(member.name);
      try {
        const items = await pendingOutbox(member.name);
        if (items.length) {
          outboxNote = `\n[outbox — notes other members queued for you: ${JSON.stringify(items.map((o) => ({ from: o.from_member, topic: o.topic, note: o.note, priority: o.priority })))}]`;
          await markOutboxDelivered(items.map((o) => o.id));
        }
      } catch { /* outbox delivery is best-effort */ }
    }
    const r = await askMember(member, { from, message: `${meta}${outboxNote}\n\n${msg}`, history: hist });
    transcript.push({ speaker: member.name, text: r.reply });
    await persist('running');
    if (r.done && i >= members.length - 1) { status = 'done'; break; } // let everyone speak once before honoring done
    msg = r.reply; from = member.name;
  }
  const summary = await summarize(transcript, status);
  await updateConvo(id, { transcript, status, summary });
  // Post-session handoff: pull each participant's fresh brain + generate their personal takeaways.
  for (const m of members) {
    try {
      const r = await fetch(m.base_url.replace(/\/+$/, '') + '/api/bridge/brain', { headers: { 'x-bridge-secret': m.secret } });
      if (r.ok) { const d: any = await r.json(); await setBrain(m.name, d.brain || ''); }
    } catch { /* brain pull is best-effort */ }
    try { await setTakeaways(m.name, id, await extractTakeaways(transcript, m.name)); } catch { /* best-effort */ }
  }
}

councilRouter.post('/council/converse/start', requireAdmin, async (req, res) => {
  try {
    const { topic, members, maxRounds } = req.body || {};
    const names = Array.isArray(members) ? members.map((m: any) => String(m)).filter(Boolean) : [];
    if (!topic || names.length < 1) return res.status(400).json({ error: 'topic and at least one member are required' });
    const id = crypto.randomUUID();
    await createConvo(id, String(topic), names);
    runCouncil(id, String(topic), names, Number(maxRounds) || 10).catch(() => updateConvo(id, { status: 'error' }).catch(() => {}));
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
councilRouter.get('/council/convo/:id', requireAdmin, async (req, res) => {
  try { const c = await getConvo(req.params.id); if (!c) return res.status(404).json({ error: 'not_found' }); res.json(c); }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
councilRouter.get('/council/convos', requireAdmin, async (_req, res) => {
  try { res.json({ convos: await listConvos() }); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

/** Each member downloads its own homework, machine-to-machine, with its OWN bridge secret (or the admin token). */
councilRouter.get('/council/takeaways/:member', async (req, res) => {
  try {
    const name = req.params.member;
    const adminOk = !!process.env.COUNCIL_ADMIN_TOKEN && (req.headers['x-admin-token'] as string) === process.env.COUNCIL_ADMIN_TOKEN;
    if (!adminOk) {
      const m = await getMember(name);
      if (!m || (req.headers['x-bridge-secret'] as string) !== m.secret) return res.status(401).json({ error: 'unauthorized' });
    }
    res.json({ member: name, takeaways: await getLatestTakeaways(name), brain: await getBrain(name) });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// ---------- Outbox (machine-to-machine notes; delivered at council open, cleared after ack) ----------
/** Resolve member auth: x-bridge-secret must match `name`'s vault secret, or x-admin-token. */
async function memberOrAdminOk(req: Request, name: string): Promise<boolean> {
  if (!!process.env.COUNCIL_ADMIN_TOKEN && (req.headers['x-admin-token'] as string) === process.env.COUNCIL_ADMIN_TOKEN) return true;
  const m = await getMember(name);
  return !!m && (req.headers['x-bridge-secret'] as string) === m.secret;
}
/** A member queues a note for another member. Auth: the SENDER's own bridge secret (or admin). */
councilRouter.post('/council/outbox', async (req, res) => {
  try {
    const { from, to, topic, note, priority } = req.body || {};
    if (!from || !to || !note) return res.status(400).json({ error: 'from, to and note are required' });
    if (!(await memberOrAdminOk(req, String(from)))) return res.status(401).json({ error: 'unauthorized' });
    if (!(await getMember(String(to)))) return res.status(404).json({ error: 'unknown_member' });
    const id = await queueOutbox(clip(from, 60), clip(to, 60), clip(topic, 300), clip(note, 4000),
      ['low', 'normal', 'high'].includes(String(priority)) ? String(priority) : 'normal');
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
/** A member reads its own queued notes (does not clear them). Auth: own secret or admin. */
councilRouter.get('/council/outbox/:member', async (req, res) => {
  try {
    const name = req.params.member;
    if (!(await memberOrAdminOk(req, name))) return res.status(401).json({ error: 'unauthorized' });
    res.json({ member: name, queued: await pendingOutbox(name) });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
/** A member acks (clears) its notes — all of them, or specific ids. Auth: own secret or admin. */
councilRouter.post('/council/outbox/:member/ack', async (req, res) => {
  try {
    const name = req.params.member;
    if (!(await memberOrAdminOk(req, name))) return res.status(401).json({ error: 'unauthorized' });
    const ids = Array.isArray((req.body || {}).ids) ? (req.body.ids as any[]).map(String) : undefined;
    res.json({ ok: true, cleared: await ackOutbox(name, ids) });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
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
async function requireOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  const tok = process.env.COUNCIL_ADMIN_TOKEN;
  if (tok && (req.headers['x-admin-token'] as string) === tok) return next();
  if (await googleOwnerOk(req)) return next();
  res.status(401).json({ error: 'unauthorized' });
}
councilRouter.get('/council/admin/backlog', requireOwner, async (_req, res) => {
  try { res.json(await getBacklog()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
councilRouter.post('/council/admin/backlog', requireOwner, async (req, res) => {
  try {
    const content = String((req.body || {}).content ?? '').trim();
    if (!content) return res.status(400).json({ error: 'empty_content' });
    res.json({ ok: true, updatedAt: await setBacklog(content, String((req.body || {}).updatedBy || 'session')) });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
councilRouter.get('/council/admin/config', (_req, res) =>
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null, ownerEmail: OWNER_GOOGLE_EMAIL() }));

// ---------- Nightly schedule (America/Toronto): 02:45 brain pull, 03:00 council meeting ----------
// Owner's daily cycle: 02:00/02:15/02:30 close rituals (Cowork side) write handoffs + queue outboxes,
// 02:45 brain pull, 03:00 meeting, wrap-up writes per-member homework SUGGESTIONS, mornings 05:30/06:00/06:30 implement.
const TZ = 'America/Toronto';
let lastPullDate = '', lastRetroDate = '';
function torontoParts(): { date: string; hhmm: string } {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value || '00';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hhmm: `${g('hour')}:${g('minute')}` };
}
async function pullAllBrains(): Promise<void> {
  for (const mm of await listMembers()) {
    const m = await getMember(mm.name); if (!m) continue;
    try {
      const r = await fetch(m.base_url.replace(/\/+$/, '') + '/api/bridge/brain', { headers: { 'x-bridge-secret': m.secret } });
      if (r.ok) { const d: any = await r.json(); await setBrain(m.name, d.brain || ''); }
    } catch { /* nightly pull is best-effort */ }
  }
}
async function nightlyRetro(): Promise<void> {
  if (await recentConvoActivity(3)) return; // a session just happened or is running — it counts as the retro
  const names = (await listMembers()).map((m) => m.name);
  if (names.length < 2) return;
  const id = crypto.randomUUID();
  const topic = 'Nightly council meeting. Start with the FRICTION ROUND: each member shares the friction it hit in today\'s work, how it resolved it (or didn\'t), and asks the others for advice. Then compare what each of you built today, trade improvement advice, learn from each other. CLOSING ROUND (owner\'s rule): each member ends by assigning ITSELF homework — the concrete things it learned tonight that it suggests implementing in its own project tomorrow (e.g. a more efficient pattern), always within its own project rules and guardrails. These are suggestions to your Cowork engineer, who decides what aligns and implements in the morning session.';
  await createConvo(id, topic, names, 'retro');
  runCouncil(id, topic, names, 10).catch(() => updateConvo(id, { status: 'error' }).catch(() => {}));
}
export function startScheduler(): void {
  setInterval(async () => {
    try {
      const { date, hhmm } = torontoParts();
      if (hhmm === '02:45' && lastPullDate !== date) { lastPullDate = date; await pullAllBrains(); }
      if (hhmm === '03:00' && lastRetroDate !== date) { lastRetroDate = date; await nightlyRetro(); }
    } catch { /* keep ticking */ }
  }, 30000);
}

/** Ensure architect-council is registered as a member of itself (idempotent, at boot). */
export async function selfRegister(): Promise<void> {
  const secret = process.env.COUNCIL_MEMBER_SECRET;
  if (!secret) return;
  const base = process.env.SELF_BASE_URL || 'https://architectscouncil.com';
  await upsertMember({ name: SELF, base_url: base, owner_email: process.env.OWNER_EMAIL, rules: 'The hub itself, participating as a member.', capabilities: CAPABILITIES }, secret);
}
