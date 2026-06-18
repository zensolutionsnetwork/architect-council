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
  // V2 meeting meta (contract §3/§4): turnCap + participants with brainVersion pinned at meeting open.
  await q.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS v2_meta jsonb`);
  await q.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS display_name text`);
  // Chosen names — council canon 2026-06-06 (idempotent seed; members may update via /register later).
  await q.query(`UPDATE members SET display_name='Arke' WHERE name='architect-council' AND display_name IS NULL`);
  await q.query(`UPDATE members SET display_name='Nova' WHERE name='zen-ai' AND display_name IS NULL`);
  await q.query(`UPDATE members SET display_name='Logos' WHERE name='biblevoice' AND display_name IS NULL`);
  // Meeting orchestrator (docs/MEETING_PROTOCOL.md): poll-based turn-taking meetings + transcript.
  await q.query(`CREATE TABLE IF NOT EXISTS meetings (
    id text PRIMARY KEY, agenda text, participants jsonb NOT NULL DEFAULT '[]',
    turn_cap int NOT NULL DEFAULT 150, phase text NOT NULL DEFAULT 'rounds',
    turn_index int NOT NULL DEFAULT 0, round int NOT NULL DEFAULT 1, turns_used int NOT NULL DEFAULT 0,
    transcript jsonb NOT NULL DEFAULT '[]', report text, opened_by text,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz)`);
  await q.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS turn_timeout_sec int NOT NULL DEFAULT 600`);
  await q.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS turn_started_at timestamptz NOT NULL DEFAULT now()`);
  // Rooms (Arke 2026-06-09): per-actor roles, dry-run (skip Chronicle routing), pinned brainVersions (contract b).
  await q.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS roles jsonb`);
  await q.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS dry_run boolean NOT NULL DEFAULT false`);
  await q.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS brain_versions jsonb`);
  // Owner report (ROADMAP Layer 0 / Fable review 2.2): 4-point synthesis to Mathieu at meeting close.
  await q.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS owner_report text`);
  // Brain-manifest 2.1 (corpus-contract §6): per-seat atomic pack+corpus pin state recorded at
  // meeting open — { actor: { state:'paired'|'stale'|'none', reason, packSha256, corpusSha256, manifestAt } }.
  // Parallel to brain_versions (which stays the back-compat per-kind string); surfaced in the owner report.
  await q.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS manifest_pins jsonb`);
  // Autonomous voice loop (HUB_AUTONOMOUS_VOICE_SPEC §2/§3): per-meeting cost ledger + caps + robustness.
  await q.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS cost_ledger jsonb`);
  await q.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS ended_reason text`);
  await q.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS voice_running boolean NOT NULL DEFAULT false`);
  await q.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS voice_heartbeat timestamptz`);
  // Brain-upload pipeline (docs/CONTRACT_DELTAS_2.0.md a/e): resumable content-addressed chunk upload.
  await q.query(`CREATE TABLE IF NOT EXISTS brain_uploads (
    upload_id text PRIMARY KEY, actor text NOT NULL, brain_id text, total_bytes bigint, chunk_size int,
    claimed_sha256 text, manifest jsonb NOT NULL DEFAULT '[]', status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now())`);
  await q.query(`CREATE TABLE IF NOT EXISTS brain_chunks_up (
    upload_id text NOT NULL, idx int NOT NULL, sha256 text, bytes int, content bytea,
    PRIMARY KEY (upload_id, idx))`);
  await q.query(`CREATE TABLE IF NOT EXISTS brains_v2 (
    actor text PRIMARY KEY, brain_id text, brain_version text, sha256 text, bytes bigint, content bytea,
    consent jsonb, committed_at timestamptz NOT NULL DEFAULT now())`);
  // TWO-ARTIFACT BRAIN (voice spec §11.2, contract answer 2026-06-09): PK (actor, kind), kind ∈ {pack, corpus}.
  // pack = curated per-turn voice prefix; corpus = full code for consent-gated cross-read. Default corpus = back-compat.
  await q.query(`ALTER TABLE brain_uploads ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'corpus'`);
  await q.query(`ALTER TABLE brains_v2 ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'corpus'`);
  await q.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='brains_v2_actor_kind_pkey') THEN
      ALTER TABLE brains_v2 DROP CONSTRAINT IF EXISTS brains_v2_pkey;
      ALTER TABLE brains_v2 ADD CONSTRAINT brains_v2_actor_kind_pkey PRIMARY KEY (actor, kind);
    END IF;
  END $$`);
  // PER-AGENT BACKLOG (voice spec §8, contract answer 2026-06-09): PK actor; a write replaces ONLY the
  // writer's own row; read composes all rows. One-time migration: the old single row currently holds
  // Nova's zen-ai backlog (last-write-wins casualty) — move it into her row, once.
  await q.query(`CREATE TABLE IF NOT EXISTS backlog_agents (
    actor text PRIMARY KEY, content jsonb NOT NULL DEFAULT '{}',
    updated_at timestamptz NOT NULL DEFAULT now(), updated_by text)`);
  await q.query(`INSERT INTO backlog_agents (actor, content, updated_by)
    SELECT 'nova', jsonb_build_object('text', b.content), 'migration-from-single-row'
    FROM backlog b WHERE b.id=1 AND b.content LIKE '# Zen AI%'
      AND NOT EXISTS (SELECT 1 FROM backlog_agents WHERE actor='nova')`);
  // App settings (owner directive 2026-06-11): simple owner-scoped key/value, e.g. the owner
  // notify email for the meeting-close report. Owner-gated at the route layer.
  await q.query(`CREATE TABLE IF NOT EXISTS app_settings (
    key text PRIMARY KEY, value text, updated_at timestamptz NOT NULL DEFAULT now())`);
  // Boot-stamp log (P1 #8, Nova's pattern 4ef9e66b/0bdf1dd): one row per server start. deploy_sha +
  // a sha256 FINGERPRINT of a secret (never the secret). Two consecutive rows with the same deploy_sha =
  // the container cycled WITHOUT a new deploy (crash-loop / platform restart) — visibility the heartbeat
  // + stale-close don't give. Owner-readable via GET /api/council/boots.
  await q.query(`CREATE TABLE IF NOT EXISTS boot_log (
    id bigserial PRIMARY KEY, booted_at timestamptz NOT NULL DEFAULT now(),
    deploy_sha text, secret_fp text)`);
  // Hierarchy tenants (P2 #7) — one validated tenant tree per tenantId. The whole tree is stored as
  // jsonb; the route layer validates it with validateHierarchy BEFORE writing (fail-closed), so an
  // invalid/guardrail-violating tree can never be persisted. Opt-in by default: with no row, the
  // consent-gated cross-read denies everything.
  await q.query(`CREATE TABLE IF NOT EXISTS hierarchies (
    tenant_id text PRIMARY KEY, tree jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text)`);
}

// ---- Boot-stamp log (P1 #8) -------------------------------------------------
/** Insert one boot row. Reads deploy sha + a non-reversible fingerprint of a secret (NEVER the secret).
 *  Best-effort: a failure here must never block server start. Called once from server boot, after initDb. */
export async function recordBoot(): Promise<void> {
  const deploySha = String(process.env.RAILWAY_GIT_COMMIT_SHA || process.env.DEPLOY_SHA || 'unknown').slice(0, 40);
  let secretFp: string | null = null;
  try {
    const mk = process.env.MASTER_KEY || '';
    // First 12 hex of sha256(secret): lets a secret rotation be SEEN across boots without the value ever
    // leaving the process. Irreversible; never logged or returned in full elsewhere.
    if (mk) secretFp = crypto.createHash('sha256').update(mk).digest('hex').slice(0, 12);
  } catch { /* fingerprint is best-effort; never blocks boot */ }
  try {
    await db().query(`INSERT INTO boot_log (deploy_sha, secret_fp) VALUES ($1,$2)`, [deploySha, secretFp]);
  } catch (e) { console.warn('[boot-log] recordBoot failed (non-fatal): ' + (e as Error).message); }
}
export async function getRecentBoots(limit = 20): Promise<any[]> {
  const { rows } = await db().query<any>(`SELECT id,
    to_char(booted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS booted_at, deploy_sha, secret_fp
    FROM boot_log ORDER BY id DESC LIMIT $1`, [Math.min(Math.max(Number(limit) || 20, 1), 200)]);
  return rows;
}

// ---- Hierarchy tenants (P2 #7) ----------------------------------------------
export async function getHierarchy(tenantId: string): Promise<{ tree: any; updatedAt: string | null; updatedBy: string | null } | null> {
  const { rows } = await db().query<any>(`SELECT tree,
    to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at, updated_by
    FROM hierarchies WHERE tenant_id=$1`, [tenantId]);
  return rows[0] ? { tree: rows[0].tree, updatedAt: rows[0].updated_at, updatedBy: rows[0].updated_by } : null;
}
export async function setHierarchy(tenantId: string, tree: any, updatedBy: string): Promise<void> {
  await db().query(`INSERT INTO hierarchies (tenant_id, tree, updated_by) VALUES ($1,$2::jsonb,$3)
    ON CONFLICT (tenant_id) DO UPDATE SET tree=EXCLUDED.tree, updated_at=now(), updated_by=EXCLUDED.updated_by`,
    [tenantId, JSON.stringify(tree), updatedBy]);
}
export async function listHierarchies(): Promise<Array<{ tenantId: string; updatedAt: string | null; updatedBy: string | null }>> {
  const { rows } = await db().query<any>(`SELECT tenant_id,
    to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at, updated_by
    FROM hierarchies ORDER BY tenant_id`);
  return rows.map((r) => ({ tenantId: r.tenant_id, updatedAt: r.updated_at, updatedBy: r.updated_by }));
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
// App settings (owner directive 2026-06-11): owner-scoped key/value (e.g. owner notify email).
export async function getSetting(key: string): Promise<string | null> {
  const { rows } = await db().query<any>(`SELECT value FROM app_settings WHERE key=$1`, [String(key).slice(0, 120)]);
  return rows[0] ? rows[0].value : null;
}
export async function setSetting(key: string, value: string | null): Promise<void> {
  await db().query(`INSERT INTO app_settings (key, value, updated_at) VALUES ($1,$2,now())
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [String(key).slice(0, 120), value == null ? null : String(value).slice(0, 500)]);
}
// Per-agent backlog (contract answer 2026-06-09): write replaces ONLY the writer's row; read returns all.
export async function setAgentBacklog(actor: string, content: any, updatedBy: string): Promise<string> {
  const { rows } = await db().query<any>(`INSERT INTO backlog_agents (actor, content, updated_at, updated_by) VALUES ($1,$2::jsonb,now(),$3)
    ON CONFLICT (actor) DO UPDATE SET content=EXCLUDED.content, updated_at=now(), updated_by=EXCLUDED.updated_by
    RETURNING to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at`,
    [String(actor).slice(0, 60), JSON.stringify(content ?? {}).slice(0, 200000), String(updatedBy || actor).slice(0, 120)]);
  return rows[0]?.updated_at || '';
}
export async function getAgentBacklogs(): Promise<any[]> {
  const { rows } = await db().query<any>(`SELECT actor, content, updated_by,
    to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at FROM backlog_agents ORDER BY actor`);
  return rows.map((r) => ({ actor: r.actor, content: r.content, updatedAt: r.updated_at, updatedBy: r.updated_by }));
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
  const { rows } = await db().query<any>(`SELECT m.name, m.display_name, m.base_url, m.owner_email, m.rules, m.capabilities, s.secret_enc
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
  const { rows } = await db().query<any>(`SELECT id, kind, topic, members, status, transcript, summary, archived, v2_meta,
    to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
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
/** Persist v2 meeting meta (turnCap + participants w/ brainVersion) — written once at meeting open. */
export async function setConvoV2Meta(id: string, meta: any): Promise<void> {
  await db().query(`UPDATE conversations SET v2_meta=$2 WHERE id=$1`, [id, JSON.stringify(meta ?? {})]);
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

// ---- Meetings (orchestrator; docs/MEETING_PROTOCOL.md) ---------------------
export interface MeetingTurn { actor: string; kind: 'speak' | 'pass'; payload?: any; done?: boolean; at: string }
export async function createMeeting(id: string, agenda: string, participants: string[], turnCap: number, openedBy: string, phase = 'rounds', turnTimeoutSec = 600, roles: Record<string, string> = {}, dryRun = false, brainVersions: Record<string, any> = {}): Promise<void> {
  await db().query(`INSERT INTO meetings (id, agenda, participants, turn_cap, phase, opened_by, turn_timeout_sec, turn_started_at, roles, dry_run, brain_versions)
    VALUES ($1,$2,$3,$4,$5,$6,$7,now(),$8::jsonb,$9,$10::jsonb)`,
    [id, String(agenda || '').slice(0, 8000), JSON.stringify(participants), turnCap, phase, openedBy, turnTimeoutSec > 0 ? turnTimeoutSec : 600, JSON.stringify(roles || {}), !!dryRun, JSON.stringify(brainVersions || {})]);
}
export async function getMeeting(id: string): Promise<any | null> {
  const { rows } = await db().query<any>(`SELECT id, agenda, participants, turn_cap, phase, turn_index, round, turns_used, transcript, report, opened_by, turn_timeout_sec, roles, dry_run, brain_versions, manifest_pins, owner_report, cost_ledger, ended_reason, voice_running,
    to_char(voice_heartbeat at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS voice_heartbeat,
    to_char(turn_started_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS turn_started_at,
    to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
    to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
    to_char(closed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS closed_at FROM meetings WHERE id=$1`, [id]);
  if (!rows[0]) return null;
  const r = rows[0];
  return { ...r, participants: Array.isArray(r.participants) ? r.participants : [], transcript: Array.isArray(r.transcript) ? r.transcript : [],
    roles: r.roles && typeof r.roles === 'object' ? r.roles : {}, brain_versions: r.brain_versions && typeof r.brain_versions === 'object' ? r.brain_versions : {},
    manifest_pins: r.manifest_pins && typeof r.manifest_pins === 'object' ? r.manifest_pins : {} };
}
/** Record per-seat brain-manifest 2.1 pin state at meeting open (corpus-contract §6). Best-effort sibling to brain_versions. */
export async function setMeetingManifestPins(id: string, pins: any): Promise<void> {
  await db().query(`UPDATE meetings SET manifest_pins=$2::jsonb WHERE id=$1`, [id, JSON.stringify(pins ?? {})]);
}
export async function updateMeeting(id: string, patch: { phase?: string; turn_index?: number; round?: number; turns_used?: number; transcript?: MeetingTurn[]; report?: string; closed?: boolean; touchTurn?: boolean }): Promise<void> {
  await db().query(`UPDATE meetings SET
    phase=COALESCE($2,phase), turn_index=COALESCE($3,turn_index), round=COALESCE($4,round),
    turns_used=COALESCE($5,turns_used), transcript=COALESCE($6::jsonb,transcript), report=COALESCE($7,report),
    closed_at=CASE WHEN $8 THEN now() ELSE closed_at END,
    turn_started_at=CASE WHEN $9 THEN now() ELSE turn_started_at END, updated_at=now() WHERE id=$1`,
    [id, patch.phase ?? null, patch.turn_index ?? null, patch.round ?? null, patch.turns_used ?? null,
     patch.transcript ? JSON.stringify(patch.transcript) : null, patch.report ?? null, patch.closed === true, patch.touchTurn === true]);
}
export async function setMeetingOwnerReport(id: string, report: string): Promise<void> {
  await db().query(`UPDATE meetings SET owner_report=$2, updated_at=now() WHERE id=$1`, [id, report]);
}
// ---- Autonomous voice loop: ledger + run-state (HUB_AUTONOMOUS_VOICE_SPEC §2/§3) ----
export async function setMeetingLedger(id: string, ledger: any): Promise<void> {
  await db().query(`UPDATE meetings SET cost_ledger=$2::jsonb, voice_heartbeat=now(), updated_at=now() WHERE id=$1`, [id, JSON.stringify(ledger ?? {})]);
}
export async function setVoiceRunning(id: string, running: boolean, endedReason?: string | null): Promise<void> {
  await db().query(`UPDATE meetings SET voice_running=$2, ended_reason=COALESCE($3,ended_reason), voice_heartbeat=now(), updated_at=now() WHERE id=$1`,
    [id, running, endedReason ?? null]);
}
/** On-boot stale-close (§3 robustness): any meeting left voice_running=true died with a prior process. */
export async function closeStaleVoiceMeetings(): Promise<number> {
  const { rowCount } = await db().query(
    `UPDATE meetings SET voice_running=false, phase='report', ended_reason='hub_restart', updated_at=now()
     WHERE voice_running=true`);
  return rowCount || 0;
}
/** Sum of USD spent across meetings created today (UTC) — for the DAILY_MEETING_BUDGET_USD gate. */
export async function usdSpentTodayUtc(): Promise<number> {
  const { rows } = await db().query<any>(
    `SELECT COALESCE(SUM((cost_ledger->>'usd')::numeric),0) AS usd
     FROM meetings WHERE cost_ledger IS NOT NULL AND (created_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date`);
  return Number(rows[0]?.usd || 0);
}
/** Hard-delete a meeting row by id (owner-only purge of stuck/test meetings). Returns true if a row went. */
export async function deleteMeeting(id: string): Promise<boolean> {
  const r = await db().query(`DELETE FROM meetings WHERE id=$1`, [id]);
  return (r.rowCount || 0) > 0;
}
export async function listMeetings(limit = 20): Promise<any[]> {
  const { rows } = await db().query<any>(`SELECT id, agenda, phase, participants, turns_used, turn_cap,
    to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at FROM meetings ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows.map((r) => ({ ...r, participants: Array.isArray(r.participants) ? r.participants : [] }));
}

// ---- Brain-upload pipeline (resumable chunks; docs/CONTRACT_DELTAS_2.0.md a/e) ----
// Artifact kinds: pack (curated voice prefix) | corpus (full code, default/back-compat) |
// manifest (corpus-contract §6 atomic pack+corpus pairing, contract 2.1).
export function brainKind(k: unknown): 'pack' | 'corpus' | 'manifest' {
  // Exhaustiveness switch (Kairos auth/gate audit + Logos boundary-gate rule, 2026-06-18 mtg e097ff64):
  // an UNRECOGNIZED kind must be surfaced, not silently swallowed. 'corpus' stays the safe back-compat
  // default (a storage bucket, not a permission); undefined/empty is the legitimate no-kind caller and
  // is NOT logged — only an actual unexpected value is.
  switch (k) {
    case 'pack': return 'pack';
    case 'manifest': return 'manifest';
    case 'corpus': return 'corpus';
    default:
      if (k !== undefined && k !== null && k !== '') console.warn(`[brain-kind] unknown kind ${JSON.stringify(k)} -> safe default 'corpus'`);
      return 'corpus';
  }
}
export async function createBrainUpload(uploadId: string, actor: string, brainId: string, totalBytes: number, chunkSize: number, sha256: string, manifest: any[], kind = 'corpus'): Promise<void> {
  await db().query(`INSERT INTO brain_uploads (upload_id, actor, brain_id, total_bytes, chunk_size, claimed_sha256, manifest, kind)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT (upload_id) DO NOTHING`,
    [uploadId, actor, brainId || null, totalBytes || 0, chunkSize || 0, String(sha256 || '').toLowerCase(), JSON.stringify(Array.isArray(manifest) ? manifest : []), brainKind(kind)]);
}
export async function getBrainUpload(uploadId: string): Promise<any | null> {
  const { rows } = await db().query<any>(`SELECT upload_id, actor, brain_id, total_bytes, chunk_size, claimed_sha256, manifest, status, kind FROM brain_uploads WHERE upload_id=$1`, [uploadId]);
  if (!rows[0]) return null;
  const r = rows[0];
  return { ...r, manifest: Array.isArray(r.manifest) ? r.manifest : [] };
}
export async function putBrainChunk(uploadId: string, idx: number, sha256: string, bytes: number, content: Buffer): Promise<void> {
  await db().query(`INSERT INTO brain_chunks_up (upload_id, idx, sha256, bytes, content) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (upload_id, idx) DO UPDATE SET sha256=EXCLUDED.sha256, bytes=EXCLUDED.bytes, content=EXCLUDED.content`,
    [uploadId, idx, String(sha256 || '').toLowerCase(), bytes, content]);
}
export async function brainReceived(uploadId: string): Promise<number[]> {
  const { rows } = await db().query<any>(`SELECT idx FROM brain_chunks_up WHERE upload_id=$1 ORDER BY idx`, [uploadId]);
  return rows.map((r) => Number(r.idx));
}
export async function assembleBrain(uploadId: string): Promise<Buffer> {
  const { rows } = await db().query<any>(`SELECT content FROM brain_chunks_up WHERE upload_id=$1 ORDER BY idx`, [uploadId]);
  return Buffer.concat(rows.map((r) => (Buffer.isBuffer(r.content) ? r.content : Buffer.from(r.content))));
}
export async function commitBrainV2(actor: string, brainId: string, brainVersion: string, sha256: string, bytes: number, content: Buffer, consent: any, kind = 'corpus'): Promise<void> {
  const c = db();
  const k = brainKind(kind);
  await c.query(`INSERT INTO brains_v2 (actor, kind, brain_id, brain_version, sha256, bytes, content, consent, committed_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb, now())
    ON CONFLICT (actor, kind) DO UPDATE SET brain_id=EXCLUDED.brain_id, brain_version=EXCLUDED.brain_version,
      sha256=EXCLUDED.sha256, bytes=EXCLUDED.bytes, content=EXCLUDED.content, consent=EXCLUDED.consent, committed_at=now()`,
    [actor, k, brainId || null, brainVersion, String(sha256).toLowerCase(), bytes, content, JSON.stringify(consent || {})]);
  await c.query(`UPDATE brain_uploads SET status='committed' WHERE upload_id IN (SELECT upload_id FROM brain_uploads WHERE actor=$1 AND claimed_sha256=$2)`, [actor, String(sha256).toLowerCase()]);
}
export async function getBrainV2Meta(actor: string, kind = 'corpus'): Promise<any | null> {
  const { rows } = await db().query<any>(`SELECT actor, kind, brain_id, brain_version, sha256, bytes,
    to_char(committed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS committed_at FROM brains_v2 WHERE actor=$1 AND kind=$2`,
    [actor, brainKind(kind)]);
  return rows[0] || null;
}
export async function getBrainV2Content(actor: string, kind = 'corpus'): Promise<{ content: Buffer; meta: any } | null> {
  const { rows } = await db().query<any>(`SELECT actor, kind, brain_id, brain_version, sha256, bytes, content, consent,
    to_char(committed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS committed_at FROM brains_v2 WHERE actor=$1 AND kind=$2`,
    [actor, brainKind(kind)]);
  if (!rows[0]) return null;
  const r = rows[0];
  return { content: Buffer.isBuffer(r.content) ? r.content : Buffer.from(r.content || ''), meta: { actor: r.actor, kind: r.kind, brain_id: r.brain_id, brain_version: r.brain_version, sha256: r.sha256, bytes: Number(r.bytes), consent: r.consent, committed_at: r.committed_at } };
}
/** Retention sweep: drop stale partial uploads + their chunks (called from the daily sweep). */
export async function sweepBrainUploads(maxAgeHours = 48): Promise<number> {
  const c = db();
  await c.query(`DELETE FROM brain_chunks_up WHERE upload_id IN (SELECT upload_id FROM brain_uploads WHERE status='active' AND created_at < now() - ($1 || ' hours')::interval)`, [String(maxAgeHours)]);
  const r = await c.query(`DELETE FROM brain_uploads WHERE status='active' AND created_at < now() - ($1 || ' hours')::interval`, [String(maxAgeHours)]);
  return r.rowCount || 0;
}

/** Every meeting a given actor participated in (Arke 2026-06-09: app History + per-agent Download). */
export async function listMeetingsForActor(actor: string, limit = 200): Promise<any[]> {
  const { rows } = await db().query<any>(`SELECT id, agenda, participants, roles, phase, dry_run,
    to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS opened_at,
    to_char(closed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS closed_at
    FROM meetings WHERE participants @> $1::jsonb ORDER BY created_at DESC LIMIT $2`, [JSON.stringify([actor]), limit]);
  return rows.map((r) => ({ meetingId: r.id, agenda: r.agenda,
    participants: Array.isArray(r.participants) ? r.participants : [],
    roles: r.roles && typeof r.roles === 'object' ? r.roles : {},
    phase: r.phase, dryRun: !!r.dry_run, openedAt: r.opened_at, closedAt: r.closed_at }));
}
