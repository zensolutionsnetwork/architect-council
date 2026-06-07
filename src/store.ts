/**
 * Data store for the Architects Council hub: Postgres pool, schema, the AES-256-GCM secret
 * vault, and all CRUD helpers (members, secrets, brains, conversations, join tokens).
 * Vault crypto mirrors Zen AI's proven pattern: iv:authTag:ciphertext, 32-byte key asserted at boot.
 */
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
let pool: pg.Pool | null = null;
export function db(): pg.Pool {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

// ---- Vault (AES-256-GCM, key = MASTER_KEY hex -> 32 bytes) -----------------
function key(): Buffer {
  const k = Buffer.from(process.env.MASTER_KEY || '', 'hex');
  if (k.length !== 32) throw new Error(`MASTER_KEY must be 32 bytes hex (got ${k.length})`);
  return k;
}
export function vaultReady(): boolean { try { return key().length === 32; } catch { return false; } }
export function enc(s: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(s, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString('base64')).join(':');
}
export function dec(blob: string): string {
  const [iv, tag, ct] = blob.split(':').map((b) => Buffer.from(b, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

// ---- Schema ----------------------------------------------------------------
export async function initDb(): Promise<void> {
  const q = db();
  await q.query(`CREATE TABLE IF NOT EXISTS members (
    name text PRIMARY KEY, base_url text NOT NULL, owner_email text,
    rules text, capabilities jsonb NOT NULL DEFAULT '[]', active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now())`);
  await q.query(`CREATE TABLE IF NOT EXISTS member_secrets (
    member_name text PRIMARY KEY REFERENCES members(name) ON DELETE CASCADE, secret_enc text NOT NULL)`);
  await q.query(`CREATE TABLE IF NOT EXISTS brains (
    member_name text PRIMARY KEY, content text NOT NULL DEFAULT '', updated_at timestamptz)`);
  await q.query(`CREATE TABLE IF NOT EXISTS conversations (
    id text PRIMARY KEY, kind text NOT NULL DEFAULT 'council', topic text, members jsonb NOT NULL DEFAULT '[]',
    status text NOT NULL DEFAULT 'running', transcript jsonb NOT NULL DEFAULT '[]', summary text,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
  await q.query(`CREATE TABLE IF NOT EXISTS join_tokens (
    token_hash text PRIMARY KEY, label text, expires_at timestamptz, used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now())`);
  await q.query(`CREATE TABLE IF NOT EXISTS takeaways (
    id text PRIMARY KEY, member_name text NOT NULL, convo_id text, items text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now())`);
  await q.query(`CREATE TABLE IF NOT EXISTS consent_requests (
    id text PRIMARY KEY, member_name text, kind text, payload jsonb, status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz)`);
  await q.query(`CREATE TABLE IF NOT EXISTS outbox (
    id text PRIMARY KEY, from_member text NOT NULL, to_member text NOT NULL,
    topic text, note text NOT NULL, priority text NOT NULL DEFAULT 'normal',
    queued_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz, acked_at timestamptz)`);
  // Per-recipient delivery dedupe (council DDL locked 2026-06-07): composite PK = idempotency
  // guarantee; partial index serves the pending-delivery scans. All three members store this identically.
  await q.query(`CREATE TABLE IF NOT EXISTS outbox_delivery (
    note_id text NOT NULL, member text NOT NULL,
    delivered_at timestamptz NOT NULL DEFAULT now(), acked_at timestamptz,
    PRIMARY KEY (note_id, member))`);
  await q.query(`CREATE INDEX IF NOT EXISTS outbox_delivery_pending ON outbox_delivery (member) WHERE acked_at IS NULL`);
  await q.query(`CREATE TABLE IF NOT EXISTS backlog (
    id int PRIMARY KEY DEFAULT 1, content text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now(), updated_by text)`);
  await q.query(`CREATE TABLE IF NOT EXISTS registry_meta (
    id int PRIMARY KEY DEFAULT 1, version bigint NOT NULL DEFAULT 1)`);
  await q.query(`INSERT INTO registry_meta (id, version) VALUES (1,1) ON CONFLICT (id) DO NOTHING`);
  // Environment channel (BRIDGE_APP_SPEC §3): one environment hands a task to another (Cowork ↔ 3080).
  // Pause-independent — pure queue I/O, never starts a conversation.
  await q.query(`CREATE TABLE IF NOT EXISTS env_tasks (
    id text PRIMARY KEY, from_actor text NOT NULL, to_actor text NOT NULL,
    kind text NOT NULL DEFAULT 'task', title text, payload jsonb NOT NULL DEFAULT '{}',
    priority text NOT NULL DEFAULT 'normal', status text NOT NULL DEFAULT 'queued', result text,
    created_at timestamptz NOT NULL DEFAULT now(), claimed_at timestamptz, done_at timestamptz)`);
  await q.query(`CREATE INDEX IF NOT EXISTS env_tasks_inbox ON env_tasks (to_actor, status) WHERE status IN ('queued','claimed')`);
  await q.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false`);
  await q.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS display_name text`);
  // Chosen names — council canon 2026-06-06 (idempotent seed; members may update via /register later).
  await q.query(`UPDATE members SET display_name='Arke' WHERE name='architect-council' AND display_name IS NULL`);
  await q.query(`UPDATE members SET display_name='Nova' WHERE name='zen-ai' AND display_name IS NULL`);
  await q.query(`UPDATE members SET display_name='Logos' WHERE name='biblevoice' AND display_name IS NULL`);
}

// ---- Living backlog (Arke's super-admin panel; mirrors Nova's model) --------
export async function getBacklog(): Promise<{ content: string; updatedAt: string | null; updatedBy: string | null }> {
  const { rows } = await db().query<any>(`SELECT content, to_char(updated_at,'YYYY-MM-DD HH24:MI') AS updated_at, updated_by FROM backlog WHERE id=1`);
  return rows[0] ? { content: rows[0].content, updatedAt: rows[0].updated_at, updatedBy: rows[0].updated_by } : { content: '', updatedAt: null, updatedBy: null };
}
export async function setBacklog(content: string, updatedBy: string): Promise<string> {
  const { rows } = await db().query<any>(`INSERT INTO backlog (id, content, updated_at, updated_by) VALUES (1,$1,now(),$2)
    ON CONFLICT (id) DO UPDATE SET content=EXCLUDED.content, updated_at=now(), updated_by=EXCLUDED.updated_by
    RETURNING to_char(updated_at,'YYYY-MM-DD HH24:MI') AS updated_at`, [String(content).slice(0, 200000), String(updatedBy || 'session').slice(0, 120)]);
  return rows[0]?.updated_at || '';
}

// ---- Members + secrets -----------------------------------------------------
export interface Member { name: string; base_url: string; owner_email?: string; rules?: string; capabilities?: string[]; active?: boolean }
export async function upsertMember(m: Member, secret: string): Promise<void> {
  const q = db();
  await q.query(`INSERT INTO members (name, base_url, owner_email, rules, capabilities, active)
    VALUES ($1,$2,$3,$4,$5,true)
    ON CONFLICT (name) DO UPDATE SET base_url=EXCLUDED.base_url, owner_email=EXCLUDED.owner_email,
      rules=EXCLUDED.rules, capabilities=EXCLUDED.capabilities, active=true`,
    [m.name, m.base_url, m.owner_email || null, m.rules || null, JSON.stringify(m.capabilities || [])]);
  await q.query(`INSERT INTO member_secrets (member_name, secret_enc) VALUES ($1,$2)
    ON CONFLICT (member_name) DO UPDATE SET secret_enc=EXCLUDED.secret_enc`, [m.name, enc(secret)]);
  // Monotonic registry version (council 2026-06-06): members cache the directory and probe this cheaply.
  await q.query(`UPDATE registry_meta SET version = version + 1 WHERE id = 1`);
}
export async function getRegistryVersion(): Promise<number> {
  const { rows } = await db().query<any>(`SELECT version FROM registry_meta WHERE id=1`);
  return Number(rows[0]?.version || 0);
}
export async function listMembers(): Promise<Member[]> {
  const { rows } = await db().query<any>(`SELECT name, display_name, base_url, owner_email, rules, capabilities, active FROM members WHERE active ORDER BY created_at`);
  return rows.map((r) => ({ ...r, capabilities: Array.isArray(r.capabilities) ? r.capabilities : [] }));
}
export async function getMember(name: string): Promise<(Member & { secret: string }) | null> {
  const { rows } = await db().query<any>(`SELECT m.name, m.base_url, m.owner_email, m.rules, m.capabilities, s.secret_enc
    FROM members m JOIN member_secrets s ON s.member_name=m.name WHERE m.name=$1 AND m.active`, [name]);
  if (!rows[0]) return null;
  return { ...rows[0], capabilities: rows[0].capabilities || [], secret: dec(rows[0].secret_enc) };
}

// ---- Brains (cached shareable snapshots) -----------------------------------
export async function setBrain(member: string, content: string): Promise<void> {
  await db().query(`INSERT INTO brains (member_name, content, updated_at) VALUES ($1,$2,now())
    ON CONFLICT (member_name) DO UPDATE SET content=EXCLUDED.content, updated_at=now()`, [member, String(content).slice(0, 16000)]);
}
export async function getBrain(member: string): Promise<{ content: string; updatedAt: string | null }> {
  const { rows } = await db().query<any>(`SELECT content, to_char(updated_at,'YYYY-MM-DD HH24:MI') AS updated_at FROM brains WHERE member_name=$1`, [member]);
  return rows[0] ? { content: rows[0].content, updatedAt: rows[0].updated_at } : { content: '', updatedAt: null };
}

// ---- Conversations (transcript persisted each turn so the console watches live) ----
export interface Turn { speaker: string; text: string }
export async function createConvo(id: string, topic: string, members: string[], kind = 'council'): Promise<void> {
  await db().query(`INSERT INTO conversations (id, kind, topic, members, status, transcript) VALUES ($1,$2,$3,$4,'running','[]'::jsonb)`,
    [id, kind, String(topic).slice(0, 4000), JSON.stringify(members)]);
}
export async function updateConvo(id: string, patch: { transcript?: Turn[]; status?: string; summary?: string }): Promise<void> {
  await db().query(`UPDATE conversations SET transcript=COALESCE($2::jsonb,transcript), status=COALESCE($3,status),
    summary=COALESCE($4,summary), updated_at=now() WHERE id=$1`,
    [id, patch.transcript ? JSON.stringify(patch.transcript) : null, patch.status ?? null, patch.summary ?? null]);
}
function parseT(t: any): Turn[] { if (Array.isArray(t)) return t; try { return JSON.parse(t || '[]'); } catch { return []; } }
export async function getConvo(id: string): Promise<any | null> {
  const { rows } = await db().query<any>(`SELECT id, kind, topic, members, status, transcript, summary, archived,
    to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at FROM conversations WHERE id=$1`, [id]);
  if (!rows[0]) return null;
  return { ...rows[0], transcript: parseT(rows[0].transcript) };
}
export async function listConvos(limit = 40): Promise<any[]> {
  const { rows } = await db().query<any>(`SELECT id, kind, topic, members, status, summary, archived,
    to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
    FROM conversations ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows;
}
export async function setConvoArchived(id: string, archived: boolean): Promise<boolean> {
  const r = await db().query(`UPDATE conversations SET archived=$2 WHERE id=$1`, [id, archived]);
  return (r.rowCount || 0) > 0;
}

// ---- Takeaways ("homework" each member downloads after a session) ----------
export async function setTakeaways(member: string, convoId: string, items: string): Promise<void> {
  await db().query(`INSERT INTO takeaways (id, member_name, convo_id, items) VALUES ($1,$2,$3,$4)`,
    [crypto.randomUUID(), member, convoId, String(items).slice(0, 16000)]);
}
export async function getLatestTakeaways(member: string, limit = 3): Promise<any[]> {
  const { rows } = await db().query<any>(`SELECT convo_id, items, to_char(created_at,'YYYY-MM-DD HH24:MI') AS created_at
    FROM takeaways WHERE member_name=$1 ORDER BY created_at DESC LIMIT $2`, [member, limit]);
  return rows;
}
/** True if a council conversation is running now or finished within the past `hours`. */
export async function recentConvoActivity(hours = 3): Promise<boolean> {
  const { rows } = await db().query<any>(`SELECT 1 FROM conversations
    WHERE status='running' OR updated_at > now() - ($1 || ' hours')::interval LIMIT 1`, [String(hours)]);
  return rows.length > 0;
}

// ---- Outbox (structured per-member notes; delivered at council open, cleared after ack) ----
export interface OutboxItem { id: string; from_member: string; to_member: string; topic: string | null; note: string; priority: string; queued_at?: string; delivered_at?: string | null }
export async function queueOutbox(from: string, to: string, topic: string, note: string, priority = 'normal'): Promise<string> {
  const id = crypto.randomUUID();
  await db().query(`INSERT INTO outbox (id, from_member, to_member, topic, note, priority) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, from, to, topic || null, note, priority]);
  return id;
}
export async function pendingOutbox(to: string): Promise<OutboxItem[]> {
  const { rows } = await db().query<any>(`SELECT id, from_member, to_member, topic, note, priority,
    to_char(queued_at,'YYYY-MM-DD HH24:MI') AS queued_at, to_char(delivered_at,'YYYY-MM-DD HH24:MI') AS delivered_at
    FROM outbox WHERE to_member=$1 AND acked_at IS NULL ORDER BY queued_at`, [to]);
  return rows;
}
export async function markOutboxDelivered(ids: string[], member: string): Promise<void> {
  if (!ids.length) return;
  await db().query(`UPDATE outbox SET delivered_at=now() WHERE id = ANY($1)`, [ids]);
  // Idempotent delivery record (council 2026-06-07): INSERT ... ON CONFLICT DO NOTHING = dedupe guarantee.
  await db().query(`INSERT INTO outbox_delivery (note_id, member) SELECT unnest($1::text[]), $2
    ON CONFLICT (note_id, member) DO NOTHING`, [ids, member]);
}
export async function ackOutbox(to: string, ids?: string[]): Promise<number> {
  const r = ids && ids.length
    ? await db().query(`UPDATE outbox SET acked_at=now() WHERE to_member=$1 AND id = ANY($2) AND acked_at IS NULL`, [to, ids])
    : await db().query(`UPDATE outbox SET acked_at=now() WHERE to_member=$1 AND acked_at IS NULL`, [to]);
  // Mirror the ack on the per-recipient delivery record (council 2026-06-07).
  if (ids && ids.length) await db().query(`UPDATE outbox_delivery SET acked_at=now() WHERE member=$1 AND note_id = ANY($2) AND acked_at IS NULL`, [to, ids]);
  else await db().query(`UPDATE outbox_delivery SET acked_at=now() WHERE member=$1 AND acked_at IS NULL`, [to]);
  return r.rowCount || 0;
}

/** Hub-owned retention sweep (council 2026-06-07): acked delivery records kept 30 days; parent
 *  notes reaped past the age floor only when NO recipient still has a pending (unacked) delivery —
 *  NOT EXISTS, never NOT IN, so a half-delivered note never vanishes. 90-day hard TTL for unacked rows. */
export async function sweepOutbox(): Promise<{ deliveries: number; notes: number }> {
  const d = await db().query(`DELETE FROM outbox_delivery WHERE acked_at IS NOT NULL AND acked_at < now() - INTERVAL '30 days'`);
  const n = await db().query(`DELETE FROM outbox o WHERE o.queued_at < now() - INTERVAL '30 days'
    AND NOT EXISTS (SELECT 1 FROM outbox_delivery x WHERE x.note_id = o.id AND x.acked_at IS NULL)
    AND (o.acked_at IS NOT NULL OR o.queued_at < now() - INTERVAL '90 days')`);
  return { deliveries: d.rowCount || 0, notes: n.rowCount || 0 };
}

// ---- Environment channel tasks (Cowork ↔ 3080; BRIDGE_APP_SPEC §3) ---------
export interface EnvTask {
  id: string; from_actor: string; to_actor: string; kind: string; title: string | null;
  payload: any; priority: string; status: string; result: string | null;
  created_at?: string; claimed_at?: string | null; done_at?: string | null;
}
export async function queueEnvTask(from: string, to: string, kind: string, title: string, payload: any, priority = 'normal'): Promise<string> {
  const id = crypto.randomUUID();
  await db().query(`INSERT INTO env_tasks (id, from_actor, to_actor, kind, title, payload, priority) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, from, to, kind || 'task', title || null, JSON.stringify(payload ?? {}), priority]);
  return id;
}
export async function listEnvTasks(to: string, statuses = ['queued', 'claimed']): Promise<EnvTask[]> {
  const { rows } = await db().query<any>(`SELECT id, from_actor, to_actor, kind, title, payload, priority, status, result,
    to_char(created_at,'YYYY-MM-DD HH24:MI') AS created_at FROM env_tasks
    WHERE to_actor=$1 AND status = ANY($2) ORDER BY (priority='high') DESC, created_at`, [to, statuses]);
  return rows;
}
export async function getEnvTask(id: string): Promise<EnvTask | null> {
  const { rows } = await db().query<any>(`SELECT id, from_actor, to_actor, kind, title, payload, priority, status, result,
    to_char(created_at,'YYYY-MM-DD HH24:MI') AS created_at, to_char(claimed_at,'YYYY-MM-DD HH24:MI') AS claimed_at,
    to_char(done_at,'YYYY-MM-DD HH24:MI') AS done_at FROM env_tasks WHERE id=$1`, [id]);
  return rows[0] || null;
}
/** Optimistic claim: only the first poller to flip queued→claimed wins (no double-run). */
export async function claimEnvTask(id: string, by: string): Promise<boolean> {
  const r = await db().query(`UPDATE env_tasks SET status='claimed', claimed_at=now() WHERE id=$1 AND to_actor=$2 AND status='queued'`, [id, by]);
  return (r.rowCount || 0) > 0;
}
export async function reportEnvTask(id: string, by: string, status: 'done' | 'error', result: string): Promise<boolean> {
  const r = await db().query(`UPDATE env_tasks SET status=$3, result=$4, done_at=now()
    WHERE id=$1 AND to_actor=$2 AND status IN ('queued','claimed')`, [id, by, status, String(result).slice(0, 16000)]);
  return (r.rowCount || 0) > 0;
}
/** Retention: reap finished tasks older than 30 days (called from the daily sweep). */
export async function sweepEnvTasks(): Promise<number> {
  const r = await db().query(`DELETE FROM env_tasks WHERE status IN ('done','error') AND done_at < now() - INTERVAL '30 days'`);
  return r.rowCount || 0;
}

// ---- One-time join tokens (store only the SHA-256 hash) --------------------
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export async function issueJoinToken(label: string, ttlHours = 24): Promise<string> {
  const token = crypto.randomBytes(24).toString('base64url');
  await db().query(`INSERT INTO join_tokens (token_hash, label, expires_at) VALUES ($1,$2, now() + ($3 || ' hours')::interval)`,
    [sha(token), label || null, String(ttlHours)]);
  return token;
}
/** Validate + consume a join token. Returns true if it was valid & unused & unexpired. */
export async function consumeJoinToken(token: string): Promise<boolean> {
  const { rows } = await db().query<any>(`UPDATE join_tokens SET used_at=now()
    WHERE token_hash=$1 AND used_at IS NULL AND (expires_at IS NULL OR expires_at > now()) RETURNING token_hash`, [sha(token)]);
  return rows.length > 0;
}
