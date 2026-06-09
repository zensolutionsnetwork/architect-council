/**
 * Routers for the Architects Council hub:
 *  - bridgeRouter  (/api/bridge/*)  : architect-council's OWN member endpoints (it's a brain too).
 *  - councilRouter (/api/council/*) : the broker — register, orchestrator relay, convos, console API.
 * Auth: members use x-bridge-secret (the hub's own COUNCIL_MEMBER_SECRET); admin/console use x-admin-token.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import { architectReply, reviewProposal, councilBrain, summarize, extractTakeaways } from './architect.js';
import { projectTranscript, transcriptSha256Hex } from './protocol.js';
import {
  upsertMember, listMembers, getMember, getBrain, setBrain,
  createConvo, updateConvo, getConvo, listConvos, consumeJoinToken, issueJoinToken,
  setTakeaways, getLatestTakeaways, recentConvoActivity, type Turn,
  queueOutbox, pendingOutbox, markOutboxDelivered, ackOutbox, sweepOutbox,
  getBacklog, setBacklog, setConvoArchived, setConvoV2Meta, getRegistryVersion,
  queueEnvTask, listEnvTasks, getEnvTask, claimEnvTask, reportEnvTask, sweepEnvTasks,
  createMeeting, getMeeting, updateMeeting, listMeetings,
  createBrainUpload, getBrainUpload, putBrainChunk, brainReceived, assembleBrain,
  commitBrainV2, getBrainV2Meta, getBrainV2Content, sweepBrainUploads,
} from './store.js';

const clip = (s: any, n: number) => String(s ?? '').slice(0, n);
/** Timing-safe credential compare (council 2026-06-07): length check + timingSafeEqual, never ===. */
function safeEqual(given: unknown, expected: string): boolean {
  const a = Buffer.from(String(given ?? ''), 'utf8'), b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const SELF = 'architect-council';
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
  if (!safeEqual(req.headers['x-admin-token'], tok)) return res.status(401).json({ error: 'unauthorized' });
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
    const adminOk = !!process.env.COUNCIL_ADMIN_TOKEN && safeEqual(req.headers['x-admin-token'], process.env.COUNCIL_ADMIN_TOKEN);
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
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
/** Cheap "did the registry change?" probe (council 2026-06-06). Same auth as the directory. */
councilRouter.get('/council/registry-version', async (req, res) => {
  try {
    const adminOk = !!process.env.COUNCIL_ADMIN_TOKEN && safeEqual(req.headers['x-admin-token'], process.env.COUNCIL_ADMIN_TOKEN);
    if (!adminOk && !(await anyMemberOk(req))) return res.status(401).json({ error: 'unauthorized' });
    res.json({ version: await getRegistryVersion() });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
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
  // V2 (contract §3/§4): pin each participant's brainVersion at meeting OPEN. Unreachable or not yet
  // implemented -> null (recorded absent — never defaulted, never impersonated).
  try {
    const participants = await Promise.all(members.map(async (m) => {
      let brainVersion: string | null = null;
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
        const r = await fetch(m.base_url.replace(/\/+$/, '') + '/api/bridge/brain-version', { headers: { 'x-bridge-secret': m.secret }, signal: ctl.signal });
        clearTimeout(t);
        if (r.ok) { const d: any = await r.json(); if (typeof d.brainVersion === 'string') brainVersion = clip(d.brainVersion, 100); }
      } catch { /* absent */ }
      return { member: m.name, displayName: (m as any).display_name || m.name, brainVersion };
    }));
    await setConvoV2Meta(id, { contractVersion: '2.0-draft1', turnCap: cap, participants });
  } catch { /* meta is best-effort; the meeting itself must not die on it */ }
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
          await markOutboxDelivered(items.map((o) => o.id), member.name);
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
    // COUNCIL V1 PAUSED (owner 2026-06-07): fail loudly while v2 is rebuilt. Override only via COUNCIL_V2_LIVE=1.
    if (COUNCIL_PAUSED()) return res.status(503).json({ error: 'council_paused', message: 'Council v1 is paused — v2 rebuild in progress (new room, new contract). No meetings until the owner re-enables.' });
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
/** Archive / unarchive a conversation (console housekeeping — owner's request 2026-06-06). */
councilRouter.post('/council/convo/:id/archive', requireAdmin, async (req, res) => {
  try {
    const ok = await setConvoArchived(req.params.id, (req.body || {}).archived !== false);
    if (!ok) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// ---------- V2 meeting transcript (contract §4: RAW, hashed, participants-only) ----------
// The hub records; the architects interpret. Same canonical hash as arke-bridge-app/src/protocol.ts:
// sha256 over JSON.stringify(turns.map(({speaker,text}))) — reimplementable byte-for-byte, node:crypto only.
const canonicalTurns = (turns: Turn[]): string => JSON.stringify(turns.map((t) => ({ speaker: t.speaker, text: t.text })));
const transcriptSha256 = (turns: Turn[]): string => 'sha256:' + crypto.createHash('sha256').update(Buffer.from(canonicalTurns(turns), 'utf8')).digest('hex');
councilRouter.get('/council/meeting/:id/transcript', async (req, res) => {
  try {
    const c = await getConvo(req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    const adminOk = !!process.env.COUNCIL_ADMIN_TOKEN && safeEqual(req.headers['x-admin-token'], process.env.COUNCIL_ADMIN_TOKEN);
    if (!adminOk) {
      // Participants-only: the credential resolves the actor, and the actor must have sat in this meeting.
      const sec = req.headers['x-bridge-secret'] as string;
      let actor: string | null = null;
      if (sec) for (const mm of await listMembers()) { const m = await getMember(mm.name); if (m && safeEqual(sec, m.secret)) { actor = m.name; break; } }
      const memberList: string[] = Array.isArray(c.members) ? c.members : [];
      if (!actor || !memberList.includes(actor)) return res.status(403).json({ error: 'participants_only' });
    }
    const turns: Turn[] = Array.isArray(c.transcript) ? c.transcript : [];
    const meta: any = c.v2_meta || {};
    res.json({
      header: {
        contractVersion: meta.contractVersion || '2.0-draft1',
        meetingId: c.id,
        openedAt: c.created_at || null,
        closedAt: c.status === 'running' ? null : (c.updated_at || null),
        status: c.status,
        turnsUsed: turns.length,
        turnCap: meta.turnCap ?? null,
        participants: meta.participants ?? (Array.isArray(c.members) ? c.members.map((n: string) => ({ member: n, displayName: n, brainVersion: null })) : []),
        transcriptSha256: transcriptSha256(turns),
      },
      turns,
    });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

/** Each member downloads its own homework, machine-to-machine, with its OWN bridge secret (or the admin token). */
councilRouter.get('/council/takeaways/:member', async (req, res) => {
  try {
    const name = req.params.member;
    const adminOk = !!process.env.COUNCIL_ADMIN_TOKEN && safeEqual(req.headers['x-admin-token'], process.env.COUNCIL_ADMIN_TOKEN);
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

// ---------- Environment channel (Cowork ↔ 3080; BRIDGE_APP_SPEC §3) ----------
// One environment hands a task to another and reads the result. Pause-INDEPENDENT: pure queue I/O,
// never starts a conversation, so it works while the council is paused. Same auth canon as everything
// else — the credential resolves the actor; no body field names the sender.
async function resolveActor(req: Request): Promise<{ actor: string; admin: boolean } | null> {
  if (!!process.env.COUNCIL_ADMIN_TOKEN && safeEqual(req.headers['x-admin-token'], process.env.COUNCIL_ADMIN_TOKEN)) return { actor: 'owner', admin: true };
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
    if (!(await getMember(String(to)))) return res.status(404).json({ error: 'unknown_recipient' });
    const id = await queueEnvTask(actor.actor, clip(to, 60), clip(kind, 40) || 'task', clip(title, 300),
      payload ?? {}, ['low', 'normal', 'high'].includes(String(priority)) ? String(priority) : 'normal');
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
/** The recipient polls its inbox. Auth: that agent's secret (or admin). */
councilRouter.get('/env/tasks', async (req, res) => {
  try {
    const forA = String(req.query.for || '');
    if (!forA) return res.status(400).json({ error: 'for is required' });
    if (!(await memberOrAdminOk(req, forA))) return res.status(401).json({ error: 'unauthorized' });
    res.json({ for: forA, tasks: await listEnvTasks(forA) });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
/** Optimistic claim — first poller to flip queued→claimed wins, so a task runs at most once. */
councilRouter.post('/env/task/:id/claim', async (req, res) => {
  try {
    const t = await getEnvTask(req.params.id);
    if (!t) return res.status(404).json({ error: 'not_found' });
    if (!(await memberOrAdminOk(req, t.to_actor))) return res.status(401).json({ error: 'unauthorized' });
    res.json({ ok: true, claimed: await claimEnvTask(t.id, t.to_actor) });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
/** Completion report from the recipient. */
councilRouter.post('/env/task/:id/report', async (req, res) => {
  try {
    const t = await getEnvTask(req.params.id);
    if (!t) return res.status(404).json({ error: 'not_found' });
    if (!(await memberOrAdminOk(req, t.to_actor))) return res.status(401).json({ error: 'unauthorized' });
    const status = (req.body || {}).status === 'error' ? 'error' : 'done';
    res.json({ ok: true, updated: await reportEnvTask(t.id, t.to_actor, status, clip((req.body || {}).result, 16000)) });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
/** Read one task + its result. Auth: either involved actor, or admin. */
councilRouter.get('/env/task/:id', async (req, res) => {
  try {
    const t = await getEnvTask(req.params.id);
    if (!t) return res.status(404).json({ error: 'not_found' });
    const actor = await resolveActor(req);
    if (!actor || (!actor.admin && actor.actor !== t.from_actor && actor.actor !== t.to_actor)) return res.status(401).json({ error: 'unauthorized' });
    res.json(t);
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
  // Fail-closed (council 2026-06-07): if NO owner-auth mechanism is configured, 503 — never an open door.
  const tok = process.env.COUNCIL_ADMIN_TOKEN;
  if (!tok && !process.env.GOOGLE_CLIENT_ID) { res.status(503).json({ error: 'owner_auth_not_configured' }); return; }
  if (tok && safeEqual(req.headers['x-admin-token'], tok)) return next();
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

// ---------- COUNCIL V1 PAUSED (owner's order 2026-06-07) ----------
// All meetings aborted while v2 is rebuilt (new dedicated machine, new contract). Set COUNCIL_V2_LIVE=1
// to re-enable. Read endpoints, bridge endpoints, backlog and admin stay live; scheduling and new
// conversations fail LOUDLY (Logos's advice: never silently).
const COUNCIL_PAUSED = () => process.env.COUNCIL_V2_LIVE !== '1';

// ---------- Nightly schedule (America/Toronto): 02:45 brain pull, 03:00 council meeting ----------
// Owner's daily cycle: 02:00/02:15/02:30 close rituals (Cowork side) write handoffs + queue outboxes,
// 02:45 brain pull, 03:00 meeting, wrap-up writes per-member homework SUGGESTIONS, mornings 05:30/06:00/06:30 implement.
const TZ = 'America/Toronto';
let lastPullDate = '', lastRetroDate = '', lastSweepDate = '';
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
  const topic = 'Nightly council meeting. Start with the FRICTION ROUND: each member shares the friction it hit in today\'s work, how it resolved it (or didn\'t), and asks the others for advice. Then the CODE REVIEW ROUND (owner\'s rule, 2026-06-06): review together the ACTUAL CODE each member shipped today — share real diffs, functions and specs from your day\'s work; critique for correctness, efficiency and security; evaluate together which version of a pattern is the most efficient; do not cut quality for brevity, take the turns you need. CLOSING ROUND (owner\'s rule): each member ends by assigning ITSELF homework — the concrete improvements from the review and what it learned tonight that it suggests implementing in its own project tomorrow, always within its own project rules and guardrails. These are suggestions to your Cowork architect, who applies what it judges good and aligned with the owner\'s direction, and asks the owner when in doubt.';
  await createConvo(id, topic, names, 'retro');
  // Cap 150 (owner 2026-06-06): never cut code-review quality. Track turns-used vs cap in the morning digest to retune.
  runCouncil(id, topic, names, 150).catch(() => updateConvo(id, { status: 'error' }).catch(() => {}));
}

// ---------- Meeting orchestrator (docs/MEETING_PROTOCOL.md, 2026-06-08) ------
// Poll-based turn-taking among the chosen-name actors. Own state machine; pause-independent.
const MEETING_DEFAULT = ['kairos', 'arke', 'nova', 'logos'];
function meetingView(m: any, actor: string | null) {
  const cur = m.participants[m.turn_index] || null;
  return { id: m.id, phase: m.phase, round: m.round, turnIndex: m.turn_index, currentActor: cur,
    cap: m.turn_cap, turnsUsed: m.turns_used, participants: m.participants, agenda: m.agenda,
    roles: m.roles || {}, dryRun: !!m.dry_run, brainVersions: m.brain_versions || {},
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
    const cap = Number(b.turnCap) > 0 ? Math.min(Number(b.turnCap), 1000) : 150;
    const tto = Number(b.turnTimeoutSec) > 0 ? Math.min(Number(b.turnTimeoutSec), 86400) : 600;
    // Rooms (Arke 2026-06-09): per-actor roles; validate against participants, at most one facilitator.
    const ROLE_SET = ['listen', 'facilitate', 'speak', 'teach', 'learn', 'review'];
    const roles: Record<string, string> = {};
    const rawRoles = (b.roles && typeof b.roles === 'object') ? b.roles : {};
    for (const p of participants) { const r = String(rawRoles[p] || '').toLowerCase(); if (ROLE_SET.includes(r)) roles[p] = r; }
    if (Object.values(roles).filter((r) => r === 'facilitate').length > 1) return res.status(400).json({ error: 'too_many_facilitators', message: 'at most one facilitator per room' });
    const dryRun = b.dryRun === true || b.test === true;
    // Pin each participant's committed brainVersion (contract b): "the brain in the room == what I sent".
    const brainVersions: Record<string, any> = {};
    for (const p of participants) { try { const meta = await getBrainV2Meta(p); brainVersions[p] = meta ? meta.brain_version : null; } catch { brainVersions[p] = null; } }
    const id = crypto.randomUUID();
    await createMeeting(id, clip(b.agenda, 8000), participants, cap, a.actor, 'rounds', tto, roles, dryRun, brainVersions);
    res.json({ ok: true, meetingId: id, ...meetingView(await getMeeting(id), a.actor) });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
councilRouter.get('/meeting/:id/state', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const m = await getMeeting(req.params.id); if (!m) return res.status(404).json({ error: 'not_found' });
    if (!a.admin && !m.participants.includes(a.actor)) return res.status(403).json({ error: 'not_a_participant' });
    res.json(meetingView(await autoExpire(m), a.actor));
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
councilRouter.post('/meeting/:id/say', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    let m = await getMeeting(req.params.id); if (!m) return res.status(404).json({ error: 'not_found' });
    m = await autoExpire(m);
    if (m.phase !== 'rounds') return res.status(409).json({ error: 'not_in_rounds', phase: m.phase });
    const cur = m.participants[m.turn_index];
    if (a.actor !== cur) return res.status(409).json({ error: 'not_your_turn', currentActor: cur });
    if (roleOf(m, a.actor) === 'listen') return res.status(403).json({ error: 'listen_only', message: 'observers do not take speaking turns' });
    const b = req.body || {};
    const kind = b.pass ? 'pass' : 'speak';
    const turns = m.transcript.concat([{ actor: a.actor, kind, payload: kind === 'speak' ? (b.payload ?? {}) : undefined, done: b.done === true, at: new Date().toISOString() }]);
    const ti = (m.turn_index + 1) % m.participants.length;
    const round = m.round + (ti === 0 ? 1 : 0);
    const used = m.turns_used + 1;
    let phase = m.phase;
    if (used >= m.turn_cap) phase = 'report';
    const lastRound = turns.slice(-m.participants.length);
    if (lastRound.length === m.participants.length && lastRound.every((t: any) => t.kind === 'pass')) phase = 'report';
    await updateMeeting(m.id, { transcript: turns, turn_index: ti, round, turns_used: used, phase, touchTurn: true });
    res.json({ ok: true, nextActor: m.participants[ti], phase, round });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
councilRouter.post('/meeting/:id/close', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a || !a.admin) return res.status(401).json({ error: 'unauthorized' });
    const m = await getMeeting(req.params.id); if (!m) return res.status(404).json({ error: 'not_found' });
    await updateMeeting(m.id, { phase: 'report', report: clip((req.body || {}).report, 16000) || m.report, closed: true });
    // Route each storyUpdate to Logos for the Chronicle (Arke refinement 5) — UNLESS this is a dry-run/test
    // room, in which case mock storyUpdates must NOT pollute the Chronicle (Arke finding 3, 2026-06-09).
    let storyCount = 0;
    if (!m.dry_run) {
      for (const t of (m.transcript || [])) {
        const su = t && t.payload && t.payload.storyUpdate;
        if (su) { storyCount++; try { await queueEnvTask('hub', 'logos', 'story', clip('storyUpdate from ' + t.actor + ' (meeting ' + m.id + ')', 300), { text: String(su), actor: t.actor, meetingId: m.id }, 'normal'); } catch { /* best effort */ } }
      }
    }
    res.json({ ok: true, dryRun: !!m.dry_run, storyUpdatesRouted: storyCount });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
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
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
councilRouter.get('/meetings', async (req, res) => {
  try { const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' }); res.json({ meetings: await listMeetings(20) }); }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
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

councilRouter.post('/bridge/brain/init', requireContract2, async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const { brainId, totalBytes, chunkSize, sha256, manifest } = req.body || {};
    if (!sha256 || !Array.isArray(manifest) || !manifest.length) return res.status(400).json({ error: 'bad_request', message: 'sha256 + non-empty manifest[] required' });
    const uploadId = crypto.randomUUID();
    await createBrainUpload(uploadId, a.actor, String(brainId || ''), Number(totalBytes) || 0, Number(chunkSize) || 0, String(sha256), manifest);
    res.json({ uploadId, received: [] });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
councilRouter.put('/bridge/brain/:uploadId/chunk/:idx', requireContract2, async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const up = await getBrainUpload(req.params.uploadId); if (!up) return res.status(404).json({ error: 'no_such_upload' });
    if (up.actor !== a.actor) return res.status(403).json({ error: 'not_your_upload' });
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
    res.status(500).json({ error: (e as Error).message });
  }
});
async function brainProbe(req: Request, res: Response) {
  const a = await resolveActor(req); if (!a) return res.status(401).end();
  const up = await getBrainUpload(req.params.uploadId); if (!up) return res.status(404).end();
  if (up.actor !== a.actor) return res.status(403).end();
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
    if (up.actor !== a.actor) return res.status(403).json({ error: 'not_your_upload' });
    const { sha256, consent } = req.body || {};
    const c = consent || {}; const scan = c.secretScan || {};
    if (c.actor !== a.actor) return res.status(403).json({ error: 'consent_actor_mismatch' });
    if (scan.ran !== true || Number(scan.findings) !== 0) return res.status(412).json({ error: 'consent_secret_scan_failed', message: 'ConsentManifest.secretScan must be {ran:true, findings:0}' });
    if (c.expiresAt && Date.parse(c.expiresAt) <= Date.now()) return res.status(412).json({ error: 'consent_expired' });
    const received = await brainReceived(req.params.uploadId);
    const missing = (up.manifest || []).map((m: any) => Number(m.idx)).filter((i: number) => !received.includes(i));
    if (missing.length) return res.status(409).json({ error: 'incomplete_upload', missing });
    const buf = await assembleBrain(req.params.uploadId);
    const whole = sha256hex(buf);
    const claimed = String(sha256 || up.claimed_sha256 || '').toLowerCase();
    if (whole !== claimed) return res.status(422).json({ error: 'object_hash_mismatch', expected: claimed, got: whole });
    const brainVersion = `${a.actor}@sha256:${whole}`;
    await commitBrainV2(a.actor, String(up.brain_id || ''), brainVersion, whole, buf.length, buf, c);
    res.json({ brainVersion, sha256: whole, bytes: buf.length });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
councilRouter.get('/bridge/brain-meta/:actor', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const meta = await getBrainV2Meta(req.params.actor); if (!meta) return res.status(404).json({ error: 'no_brain' });
    res.json(meta);
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
councilRouter.get('/bridge/brain-content/:actor', async (req, res) => {
  try {
    const a = await resolveActor(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const got = await getBrainV2Content(req.params.actor); if (!got) return res.status(404).json({ error: 'no_brain' });
    const scope = (got.meta.consent && Array.isArray(got.meta.consent.scope)) ? got.meta.consent.scope : [];
    if (!a.admin && a.actor !== req.params.actor && !scope.includes('code')) return res.status(403).json({ error: 'consent_scope_denied' });
    res.setHeader('x-brain-version', got.meta.brain_version || '');
    res.json({ ...got.meta, contentBase64: got.content.toString('base64') });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

export function startScheduler(): void {
  setInterval(async () => {
    try {
      const { date, hhmm } = torontoParts();
      if (!COUNCIL_PAUSED()) {
        if (hhmm === '02:45' && lastPullDate !== date) { lastPullDate = date; await pullAllBrains(); }
        if (hhmm === '03:00' && lastRetroDate !== date) { lastRetroDate = date; await nightlyRetro(); }
      }
      // Daily outbox retention sweep (council 2026-06-07) — quiet hour, after the meeting window. Runs even while paused.
      if (hhmm === '04:30' && lastSweepDate !== date) { lastSweepDate = date; await sweepOutbox(); await sweepEnvTasks(); }
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
