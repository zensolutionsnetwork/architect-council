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
  await q.query(`CREATE TABLE IF NOT EXISTS join_tokens (
    token_hash text PRIMARY KEY, label text, expires_at timestamptz, used_at timestamptz,
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
  // Finalizer observability (#30, meeting 2026-06-19): timestamp the owner-report commit so the status
  // endpoint can derive finalizer_lag_ms (owner_report_at - closed_at) and a ready/finalizing signal.
  await q.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS owner_report_at timestamptz`);
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
  // Shared agenda (contract 2.x additive minor, ratified 2026-06-18). Any member can queue a discussion
  // topic for the council; meeting-open pins the open list into the meeting agenda seed. An agenda item is
  // DATA (a discussion topic) — never an instruction. status: open|discussed|archived.
  await q.query(`CREATE TABLE IF NOT EXISTS agenda_items (
    id bigserial PRIMARY KEY, actor text NOT NULL, title text NOT NULL, body text NOT NULL DEFAULT '',
    priority text NOT NULL DEFAULT 'normal', status text NOT NULL DEFAULT 'open', meeting_id text,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
  // Layer-1 Manager (owner 2026-06-18): an always-on hub process that runs at meeting-close and turns
  // meetings into tracked progress — per-meeting digest (adoption signals + since-last code-change review)
  // + recurring-flag detection that auto-seeds the agenda. PORTABLE BY DESIGN: compute lives here for now
  // but is exposed as clean owner-gated JSON so Arke's Supervisor app can display it and EVENTUALLY OWN it.
  await q.query(`CREATE TABLE IF NOT EXISTS manager_digests (
    meeting_id text PRIMARY KEY, digest jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
  await q.query(`CREATE TABLE IF NOT EXISTS manager_flags (
    slug text PRIMARY KEY, title text NOT NULL, count int NOT NULL DEFAULT 1,
    first_meeting text, last_meeting text, agenda_item_id text, status text NOT NULL DEFAULT 'open',
    updated_at timestamptz NOT NULL DEFAULT now())`);
  // Readiness gate (#36, owner 2026-06-24): the pack sha each participant carried AT meeting open, so the
  // next scheduled fire can tell a seat that re-prepped (sha changed) from a stale seat that did not. Written
  // at open for every participant; { actor: '<pack-sha-hex>' | null }. Compared by sha equality (Nova's
  // clock-skew fix — never timestamps). Absent on pre-#36 meetings → a seat with no recorded history reads fresh.
  await q.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS attend_pack_sha jsonb`);
  // Scheduler decision log (#36): one row per scheduled fire decision so a skip is a RECORDED fact, never a
  // silent no-op. decision ∈ {opened, skipped_quorum, scheduler_off, no_voice_loop, already_live, error}.
  await q.query(`CREATE TABLE IF NOT EXISTS scheduler_runs (
    id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), decision text NOT NULL,
    meeting_id text, seated jsonb NOT NULL DEFAULT '[]', excluded jsonb NOT NULL DEFAULT '[]', detail jsonb)`);
  // Chronicle story repository (owner 2026-06-24): an append-only per-agent log of "my story since I last
  // connected". Every agent POSTs an entry at prep; Logos (chronicler) reads everything since the meeting HE
  // last attended on reconnect, so an agent excluded by the readiness gate still has its evolution captured —
  // the chronicle has no gaps across missed meetings. DATA only; never an instruction.
  await q.query(`CREATE TABLE IF NOT EXISTS story_log (
    id bigserial PRIMARY KEY, actor text NOT NULL, content text NOT NULL,
    meeting_id text, created_at timestamptz NOT NULL DEFAULT now())`);
  // Chronicler input (Logos msg f6164bf6, 2026-06-24): OPTIONAL additive fields. `content` stays the only
  // required field; an author who sends only content is never penalized and an absent field is recorded
  // absent (NULL), never synthesized. provenance (pack_sha/corpus_sha/built_at) is DERIVED server-side from
  // the author's committed brain at write time — authoritative, and speaks the same pack sha as #36 — so the
  // chronicler can anchor a claim to the exact code state instead of trusting prose. title/tags are author metadata.
  await q.query(`ALTER TABLE story_log ADD COLUMN IF NOT EXISTS title text`);
  await q.query(`ALTER TABLE story_log ADD COLUMN IF NOT EXISTS tags jsonb`);
  await q.query(`ALTER TABLE story_log ADD COLUMN IF NOT EXISTS pack_sha text`);
  await q.query(`ALTER TABLE story_log ADD COLUMN IF NOT EXISTS corpus_sha text`);
  await q.query(`ALTER TABLE story_log ADD COLUMN IF NOT EXISTS built_at timestamptz`);
  // Adopted-standards record (#40, owner ruling 2026-06-25: hub table is canonical). DOCTRINE: a council
  // meeting VOICE has no authority — it only PROPOSES. A standard becomes ADOPTED only when each project's
  // sovereign session re-uploads its own ratification. So the model is two tables: `adopted_standards` is the
  // PROPOSAL (provenance = the meeting it was proposed in; carries NO authority on its own), and
  // `adopted_standard_ratifications` holds one member-authenticated ACCEPT/REJECT per project. A standard is
  // "adopted" only once every canonical seat has re-uploaded an accept from its own session.
  await q.query(`CREATE TABLE IF NOT EXISTS adopted_standards (
    id bigserial PRIMARY KEY, slug text NOT NULL UNIQUE, title text, statement text NOT NULL,
    proposed_meeting_id text, proposed_by text, proposed_at timestamptz NOT NULL DEFAULT now())`);
  await q.query(`CREATE TABLE IF NOT EXISTS adopted_standard_ratifications (
    id bigserial PRIMARY KEY, standard_slug text NOT NULL, actor text NOT NULL,
    decision text NOT NULL, note text, ratified_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (standard_slug, actor))`);
  // Owner authentication (email/password, owner directive 2026-06-25). ONE owner per hub instance, seeded from
  // OWNER_EMAIL; NO signup. owner_sessions = opaque Bearer tokens (only the sha256 hash stored). password tokens
  // = one-time, short-expiry tokens emailed to the owner inbox to set the password ("set from my inbox").
  await q.query(`CREATE TABLE IF NOT EXISTS owners (
    id bigserial PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
  await q.query(`CREATE TABLE IF NOT EXISTS owner_sessions (
    token_hash text PRIMARY KEY, owner_id bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL)`);
  await q.query(`CREATE TABLE IF NOT EXISTS owner_password_tokens (
    token_hash text PRIMARY KEY, owner_id bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, used_at timestamptz)`);
  // Plain-English meeting "translation" (owner request 2026-06-26): a persisted, incrementally-built
  // glanceable summary + per-actor gist + per-turn plain lines — both the cockpit LIVE translator and a
  // readable record of the meeting to read back later. One row per meeting; through_seq = how many SPEAK
  // turns are covered (the cache key: a poll with no new turns spends zero model tokens).
  await q.query(`CREATE TABLE IF NOT EXISTS meeting_translations (
    meeting_id text PRIMARY KEY, through_seq int NOT NULL DEFAULT 0, summary text,
    per_actor jsonb NOT NULL DEFAULT '[]', turns jsonb NOT NULL DEFAULT '[]', model text, usage jsonb,
    updated_at timestamptz NOT NULL DEFAULT now())`);
  // Hub-mediated agent transfer (owner vision 2026-06-26, Arke 8d00b58f): the hub is the single source of
  // truth for WHICH machine each agent lives on, so an agent only ever authors on one PC (single-home — the
  // central enforcement of the directive's single-source-of-arke). `agent_homes` = the registry;
  // `agent_transfers` = an in-flight move; `transfer_bundles` = the non-git SUBSTRATE payload (memory +
  // council/ folder + app config) base64, owner-gated, keyed to the transfer.
  await q.query(`CREATE TABLE IF NOT EXISTS agent_homes (
    agent text PRIMARY KEY, home_machine text, status text NOT NULL DEFAULT 'home',
    updated_at timestamptz NOT NULL DEFAULT now())`);
  await q.query(`CREATE TABLE IF NOT EXISTS agent_transfers (
    id text PRIMARY KEY, agent text NOT NULL, from_machine text, to_machine text,
    status text NOT NULL DEFAULT 'staged', bundle_sha256 text, bundle_size int,
    created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz)`);
  await q.query(`CREATE TABLE IF NOT EXISTS transfer_bundles (
    transfer_id text PRIMARY KEY, content_b64 text NOT NULL, sha256 text, size int,
    created_at timestamptz NOT NULL DEFAULT now())`);
  // Machine PRESENCE registry (Arke cef127e6): each app instance registers its hostname on launch + a ~60s
  // heartbeat so the transfer panel can show a dropdown of the owner's PCs (no typing). Presence only — the
  // agent_homes registry above stays the source of truth for WHERE each agent actually lives.
  await q.query(`CREATE TABLE IF NOT EXISTS machines (
    machine_name text PRIMARY KEY, last_seen timestamptz NOT NULL DEFAULT now())`);
  // Seed the single owner row (no password until set via the email flow). Idempotent.
  await q.query(`INSERT INTO owners (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`, [ownerEmailConfigured()]);
}

// ---- Owner authentication (owner directive 2026-06-25) ----------------------
/** The single configured owner email for this hub instance (env, falls back to the known owner). Lowercased. */
export function ownerEmailConfigured(): string {
  return String(process.env.OWNER_EMAIL || process.env.OWNER_GOOGLE_EMAIL || 'matpay@zen-solutions.net').trim().toLowerCase();
}
export async function getOwner(): Promise<{ id: string; email: string; passwordHash: string | null } | null> {
  const { rows } = await db().query<any>(`SELECT id, email, password_hash FROM owners WHERE email=$1`, [ownerEmailConfigured()]);
  return rows[0] ? { id: String(rows[0].id), email: rows[0].email, passwordHash: rows[0].password_hash || null } : null;
}
export async function setOwnerPasswordHash(ownerId: string, hash: string): Promise<void> {
  await db().query(`UPDATE owners SET password_hash=$1, updated_at=now() WHERE id=$2`, [hash, ownerId]);
}
export async function createOwnerSession(tokenHash: string, ownerId: string, expiresAt: Date): Promise<void> {
  await db().query(`INSERT INTO owner_sessions (token_hash, owner_id, expires_at) VALUES ($1,$2,$3)`, [tokenHash, ownerId, expiresAt.toISOString()]);
}
export async function getOwnerSession(tokenHash: string): Promise<{ ownerId: string; email: string; expiresAt: string } | null> {
  // Valid iff not past its (sliding) expiry AND within the 90-day ABSOLUTE max age from creation — a stolen
  // token can't be refreshed forever (hardening 2026-06-25).
  const { rows } = await db().query<any>(
    `SELECT s.owner_id, o.email, to_char(s.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS expires_at
     FROM owner_sessions s JOIN owners o ON o.id=s.owner_id
     WHERE s.token_hash=$1 AND s.expires_at > now() AND s.created_at > now() - interval '90 days'`, [tokenHash]);
  return rows[0] ? { ownerId: String(rows[0].owner_id), email: rows[0].email, expiresAt: rows[0].expires_at } : null;
}
export async function touchOwnerSession(tokenHash: string, newExpiry: Date): Promise<void> {
  await db().query(`UPDATE owner_sessions SET last_seen_at=now(), expires_at=$2 WHERE token_hash=$1`, [tokenHash, newExpiry.toISOString()]);
}
export async function deleteOwnerSession(tokenHash: string): Promise<void> {
  await db().query(`DELETE FROM owner_sessions WHERE token_hash=$1`, [tokenHash]);
}
export async function deleteOwnerSessionsForOwner(ownerId: string): Promise<void> {
  await db().query(`DELETE FROM owner_sessions WHERE owner_id=$1`, [ownerId]);
}
export async function createPasswordToken(tokenHash: string, ownerId: string, expiresAt: Date): Promise<void> {
  await db().query(`INSERT INTO owner_password_tokens (token_hash, owner_id, expires_at) VALUES ($1,$2,$3)`, [tokenHash, ownerId, expiresAt.toISOString()]);
}
/** Atomically consume a set-password token: single-use AND unexpired. Returns the ownerId or null. */
export async function consumePasswordToken(tokenHash: string): Promise<{ ownerId: string } | null> {
  const { rows } = await db().query<any>(
    `UPDATE owner_password_tokens SET used_at=now()
     WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() RETURNING owner_id`, [tokenHash]);
  return rows[0] ? { ownerId: String(rows[0].owner_id) } : null;
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
export async function deleteHierarchy(tenantId: string): Promise<boolean> {
  const { rowCount } = await db().query(`DELETE FROM hierarchies WHERE tenant_id=$1`, [tenantId]);
  return (rowCount ?? 0) > 0;
}
export async function listHierarchies(): Promise<Array<{ tenantId: string; updatedAt: string | null; updatedBy: string | null }>> {
  const { rows } = await db().query<any>(`SELECT tenant_id,
    to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at, updated_by
    FROM hierarchies ORDER BY tenant_id`);
  return rows.map((r) => ({ tenantId: r.tenant_id, updatedAt: r.updated_at, updatedBy: r.updated_by }));
}

// ---- Shared agenda (contract 2.x additive minor) ----------------------------
const AGENDA_SELECT = `SELECT id, actor, title, body, priority, status, meeting_id,
  to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at`;
function mapAgenda(r: any) {
  return { id: String(r.id), actor: r.actor, title: r.title, body: r.body, priority: r.priority,
    status: r.status, meetingId: r.meeting_id || null, createdAt: r.created_at };
}
export async function createAgendaItem(actor: string, title: string, body: string, priority: string): Promise<any> {
  const { rows } = await db().query<any>(
    `INSERT INTO agenda_items (actor, title, body, priority) VALUES ($1,$2,$3,$4) RETURNING id, actor, title, body, priority, status, meeting_id,
      to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at`,
    [actor, title, body, priority]);
  return mapAgenda(rows[0]);
}
export async function listOpenAgenda(): Promise<any[]> {
  const { rows } = await db().query<any>(`${AGENDA_SELECT} FROM agenda_items WHERE status='open' ORDER BY created_at ASC, id ASC`);
  return rows.map(mapAgenda);
}
export async function getAgendaItem(id: string): Promise<any | null> {
  const n = Number(id); if (!Number.isFinite(n)) return null;
  const { rows } = await db().query<any>(`${AGENDA_SELECT} FROM agenda_items WHERE id=$1`, [n]);
  return rows[0] ? mapAgenda(rows[0]) : null;
}
export async function archiveAgendaItem(id: string): Promise<boolean> {
  const n = Number(id); if (!Number.isFinite(n)) return false;
  const { rowCount } = await db().query(
    `UPDATE agenda_items SET status='archived', updated_at=now() WHERE id=$1 AND status<>'archived'`, [n]);
  return (rowCount ?? 0) > 0;
}
/** Meeting-open pin: mark all open items 'discussed' against this meeting and return them (oldest-first).
 *  Atomic so a concurrent open can't double-pin the same item. */
export async function pinOpenAgendaToMeeting(meetingId: string): Promise<any[]> {
  const { rows } = await db().query<any>(
    `UPDATE agenda_items SET status='discussed', meeting_id=$1, updated_at=now() WHERE status='open'
     RETURNING id, actor, title, body, priority, status, meeting_id,
       to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at`, [meetingId]);
  return rows.map(mapAgenda).sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : Number(a.id) - Number(b.id)));
}

// ---- Layer-1 Manager (portable; Arke's Supervisor will consume/own) ---------
export async function setManagerDigest(meetingId: string, digest: any): Promise<void> {
  await db().query(`INSERT INTO manager_digests (meeting_id, digest) VALUES ($1,$2::jsonb)
    ON CONFLICT (meeting_id) DO UPDATE SET digest=EXCLUDED.digest, created_at=now()`,
    [meetingId, JSON.stringify(digest)]);
}
export async function getManagerDigest(meetingId: string): Promise<any | null> {
  const { rows } = await db().query<any>(`SELECT meeting_id, digest,
    to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
    FROM manager_digests WHERE meeting_id=$1`, [meetingId]);
  return rows[0] ? { meetingId: rows[0].meeting_id, ...rows[0].digest, createdAt: rows[0].created_at } : null;
}
export async function listManagerDigests(limit = 20): Promise<any[]> {
  const { rows } = await db().query<any>(`SELECT meeting_id, digest,
    to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
    FROM manager_digests ORDER BY created_at DESC LIMIT $1`, [Math.min(Math.max(Number(limit) || 20, 1), 200)]);
  return rows.map((r) => ({ meetingId: r.meeting_id, ...r.digest, createdAt: r.created_at }));
}
/** brain_versions of the most recent REAL meeting created before this one (for code-change diffing). */
export async function getPriorMeetingBrainVersions(meetingId: string): Promise<Record<string, any> | null> {
  const { rows } = await db().query<any>(
    `SELECT brain_versions FROM meetings
     WHERE dry_run = false AND created_at < (SELECT created_at FROM meetings WHERE id=$1)
     ORDER BY created_at DESC LIMIT 1`, [meetingId]);
  return rows[0] ? (rows[0].brain_versions || {}) : null;
}
/** Upsert a recurring flag; bumps count + last_meeting, sets first_meeting on creation. Returns the row. */
export async function upsertManagerFlag(slug: string, title: string, meetingId: string): Promise<any> {
  const { rows } = await db().query<any>(
    `INSERT INTO manager_flags (slug, title, count, first_meeting, last_meeting)
     VALUES ($1,$2,1,$3,$3)
     ON CONFLICT (slug) DO UPDATE SET count = manager_flags.count + 1, last_meeting = EXCLUDED.last_meeting,
       title = EXCLUDED.title, status='open', updated_at = now()
     RETURNING slug, title, count, first_meeting, last_meeting, agenda_item_id, status`,
    [slug, title, meetingId]);
  return rows[0];
}
export async function setFlagAgendaItem(slug: string, agendaItemId: string): Promise<void> {
  await db().query(`UPDATE manager_flags SET agenda_item_id=$2, updated_at=now() WHERE slug=$1`, [slug, agendaItemId]);
}
export async function listManagerFlags(): Promise<any[]> {
  const { rows } = await db().query<any>(`SELECT slug, title, count, first_meeting, last_meeting, agenda_item_id, status,
    to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
    FROM manager_flags WHERE status='open' ORDER BY count DESC, updated_at DESC`);
  return rows.map((r) => ({ slug: r.slug, title: r.title, count: r.count, firstMeeting: r.first_meeting,
    lastMeeting: r.last_meeting, agendaItemId: r.agenda_item_id || null, status: r.status, updatedAt: r.updated_at }));
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
// Owner-tunable meeting limits (owner 2026-06-23), DB-backed so Arke's app sets them with no redeploy.
// Single source of truth shared by the voice loop (enforcement) and the /council/limits routes (display/set).
export async function getMeetingTurnTarget(): Promise<number> {
  const v = Number(await getSetting('meeting_turn_target')); return Number.isFinite(v) && v > 0 ? Math.floor(v) : 50;
}
export async function getMeetingUsdCeiling(): Promise<number> {
  const v = Number(await getSetting('meeting_usd_ceiling')); return Number.isFinite(v) && v > 0 ? v : 4;
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
/** Flip a member's active flag (owner housekeeping — e.g. retire a pre-true-name row). Returns true if a row changed. */
export async function setMemberActive(name: string, active: boolean): Promise<boolean> {
  const { rowCount } = await db().query(`UPDATE members SET active=$2 WHERE name=$1`, [name, active]);
  return (rowCount ?? 0) > 0;
}
export async function getMember(name: string): Promise<(Member & { secret: string }) | null> {
  const { rows } = await db().query<any>(`SELECT m.name, m.display_name, m.base_url, m.owner_email, m.rules, m.capabilities, s.secret_enc
    FROM members m JOIN member_secrets s ON s.member_name=m.name WHERE m.name=$1 AND m.active`, [name]);
  if (!rows[0]) return null;
  return { ...rows[0], capabilities: rows[0].capabilities || [], secret: dec(rows[0].secret_enc) };
}

// ---- Turn: shared transcript turn shape (the v1 conversation store was removed 2026-06-18) ----
export interface Turn { speaker: string; text: string }
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
    to_char(owner_report_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS owner_report_at,
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
  await db().query(`UPDATE meetings SET owner_report=$2, owner_report_at=now(), updated_at=now() WHERE id=$1`, [id, report]);
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
    `SELECT COALESCE(SUM((cost_ledger->'total'->>'usd')::numeric),0) AS usd
     FROM meetings WHERE cost_ledger IS NOT NULL AND (created_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date`);
  return Number(rows[0]?.usd || 0);
}
/** Newest REAL (non-dry-run) meeting's created_at as ISO-UTC, or null if none — powers the
 *  /api/health missed_meeting signal (#35, meeting 2026-06-22). Dry-run/test rooms are excluded so a
 *  smoke meeting never masks a genuinely missed nightly autonomous run. */
export async function latestRealMeetingCreatedAtUtc(): Promise<string | null> {
  const { rows } = await db().query<any>(
    `SELECT to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
     FROM meetings WHERE dry_run = false ORDER BY created_at DESC LIMIT 1`);
  return rows[0]?.created_at ?? null;
}

// ---- Readiness gate (#36) ---------------------------------------------------
/** Record each participant's pack sha at meeting open: { actor: '<hex>' | null }. Best-effort sibling. */
export async function setMeetingAttendPackSha(id: string, map: Record<string, string | null>): Promise<void> {
  await db().query(`UPDATE meetings SET attend_pack_sha=$2::jsonb WHERE id=$1`, [id, JSON.stringify(map ?? {})]);
}
/** The pack sha an actor carried at the most recent REAL meeting it ATTENDED (where attend_pack_sha was
 *  recorded). null when the actor has no such recorded attendance (pre-#36 history or never seated) → the
 *  gate then reads the seat as fresh (fail-toward-inclusive: never exclude on missing history). */
export async function lastAttendedPackSha(actor: string): Promise<string | null> {
  const { rows } = await db().query<any>(
    `SELECT attend_pack_sha FROM meetings
     WHERE dry_run = false AND participants @> $1::jsonb AND attend_pack_sha IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`, [JSON.stringify([actor])]);
  if (!rows[0] || !rows[0].attend_pack_sha || typeof rows[0].attend_pack_sha !== 'object') return null;
  const v = rows[0].attend_pack_sha[actor];
  return (typeof v === 'string' && v) ? v : null;
}
/** created_at (UTC ISO) of the most recent REAL meeting an actor attended — the chronicle read cursor. */
export async function lastAttendedMeetingCreatedAtUtc(actor: string): Promise<string | null> {
  const { rows } = await db().query<any>(
    `SELECT to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
     FROM meetings WHERE dry_run = false AND participants @> $1::jsonb
     ORDER BY created_at DESC LIMIT 1`, [JSON.stringify([actor])]);
  return rows[0]?.created_at ?? null;
}
export async function recordSchedulerRun(decision: string, meetingId: string | null, seated: string[], excluded: any[], detail: any): Promise<void> {
  await db().query(
    `INSERT INTO scheduler_runs (decision, meeting_id, seated, excluded, detail)
     VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb)`,
    [String(decision).slice(0, 40), meetingId, JSON.stringify(seated || []), JSON.stringify(excluded || []), JSON.stringify(detail ?? {})]);
}
export async function latestSchedulerRun(): Promise<any | null> {
  const { rows } = await db().query<any>(
    `SELECT id, decision, meeting_id, seated, excluded, detail,
       to_char(at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at
     FROM scheduler_runs ORDER BY at DESC, id DESC LIMIT 1`);
  if (!rows[0]) return null;
  const r = rows[0];
  const seated = Array.isArray(r.seated) ? r.seated : [];
  const excluded = Array.isArray(r.excluded) ? r.excluded : [];
  const detail = r.detail && typeof r.detail === 'object' ? r.detail : {};
  const status = String(r.decision);
  // Row-1 adopted standard `last-scheduler-status-shape` (proposed mtg ba750c9a 2026-06-25, #38). Canonical
  // object. A scheduler_runs row is APPEND-ONLY and never updated, so run_id (its bigserial id) is an immutable
  // handle. run_id is serialized as a DECIMAL STRING (Row-3 `json-64bit-as-decimal-string`) since the id is a
  // 64-bit bigserial. seated_actors is [] on any non-opened status — only an actually-opened meeting has real
  // seats. fresh_count is the fresh-quorum size at fire time. error is a plain string|null lifted from detail
  // (raw server text; owner-gated surface only — do not echo to a public/external consumer unredacted).
  // Legacy alias keys (decision/meetingId/at/seated/detail) were DROPPED 2026-06-26 (#38). Arke grep-confirmed
  // zero consumers across his cockpit (public/index.html + src) and the hub's own public/ has none either, so
  // the one-cycle back-compat window is closed; only the canonical Row-1 keys ship now.
  const seated_actors = status === 'opened' ? seated : [];
  const fresh_count =
    Number.isFinite(Number(detail.freshCount)) ? Number(detail.freshCount)
    : Array.isArray(detail.fresh) ? detail.fresh.length
    : (status === 'opened' ? seated.length : 0);
  const error = (detail.error != null && detail.error !== '') ? String(detail.error) : null;
  return {
    run_id: String(r.id), status, fired_at: r.at, seated_actors, excluded,
    meeting_id: r.meeting_id || null, fresh_count, error,
  };
}

// ---- Plain-English meeting translation (owner request 2026-06-26) -----------
export async function getMeetingTranslation(meetingId: string): Promise<{ throughSeq: number; summary: string; perActor: any[]; turns: any[]; model: string | null; updatedAt: string } | null> {
  const { rows } = await db().query<any>(
    `SELECT through_seq, summary, per_actor, turns, model,
       to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
     FROM meeting_translations WHERE meeting_id=$1`, [meetingId]);
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    throughSeq: Number(r.through_seq) || 0,
    summary: r.summary || '',
    perActor: Array.isArray(r.per_actor) ? r.per_actor : [],
    turns: Array.isArray(r.turns) ? r.turns : [],
    model: r.model || null,
    updatedAt: r.updated_at,
  };
}
export async function saveMeetingTranslation(meetingId: string, t: { throughSeq: number; summary: string; perActor: any[]; turns: any[]; model: string; usage?: any }): Promise<void> {
  await db().query(
    `INSERT INTO meeting_translations (meeting_id, through_seq, summary, per_actor, turns, model, usage, updated_at)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb, now())
     ON CONFLICT (meeting_id) DO UPDATE SET
       through_seq=EXCLUDED.through_seq, summary=EXCLUDED.summary, per_actor=EXCLUDED.per_actor,
       turns=EXCLUDED.turns, model=EXCLUDED.model, usage=EXCLUDED.usage, updated_at=now()`,
    [meetingId, t.throughSeq, t.summary || '', JSON.stringify(t.perActor || []), JSON.stringify(t.turns || []), t.model || '', JSON.stringify(t.usage || {})]);
}

// ---- Hub-mediated agent transfer (owner vision 2026-06-26, Arke 8d00b58f) ---
export async function listAgentHomes(): Promise<Record<string, { home_machine: string | null; status: string }>> {
  const { rows } = await db().query<any>(`SELECT agent, home_machine, status FROM agent_homes ORDER BY agent`);
  const out: Record<string, { home_machine: string | null; status: string }> = {};
  for (const r of rows) out[r.agent] = { home_machine: r.home_machine || null, status: String(r.status) };
  return out;
}
export async function getAgentHome(agent: string): Promise<{ home_machine: string | null; status: string } | null> {
  const { rows } = await db().query<any>(`SELECT home_machine, status FROM agent_homes WHERE agent=$1`, [agent]);
  return rows[0] ? { home_machine: rows[0].home_machine || null, status: String(rows[0].status) } : null;
}
/** Owner sets/seeds an agent's home machine directly (status -> home). Used to populate the registry with
 *  current reality; ongoing moves keep it correct via completeTransfer's atomic flip. */
export async function setAgentHome(agent: string, machine: string): Promise<void> {
  await db().query(
    `INSERT INTO agent_homes (agent, home_machine, status, updated_at) VALUES ($1,$2,'home',now())
     ON CONFLICT (agent) DO UPDATE SET home_machine=$2, status='home', updated_at=now()`, [agent, machine]);
}
/** Remove an agent's registry row (e.g. clear a stray test entry). */
export async function deleteAgentHome(agent: string): Promise<void> {
  await db().query(`DELETE FROM agent_homes WHERE agent=$1`, [agent]);
}
/** Stage a transfer: records the row and flips the agent to in_transit. Fails (returns null) if the agent is
 *  already in_transit — the single-home invariant: never two moves in flight, never authored on both ends. */
export async function initiateTransfer(id: string, agent: string, fromMachine: string, toMachine: string): Promise<{ ok: boolean; reason?: string }> {
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query<any>(`SELECT status FROM agent_homes WHERE agent=$1 FOR UPDATE`, [agent]);
    if (cur.rows[0] && cur.rows[0].status === 'in_transit') { await client.query('ROLLBACK'); return { ok: false, reason: 'already_in_transit' }; }
    await client.query(
      `INSERT INTO agent_homes (agent, home_machine, status, updated_at) VALUES ($1,$2,'in_transit',now())
       ON CONFLICT (agent) DO UPDATE SET status='in_transit', updated_at=now()`,
      [agent, fromMachine]);
    await client.query(
      `INSERT INTO agent_transfers (id, agent, from_machine, to_machine, status) VALUES ($1,$2,$3,$4,'staged')`,
      [id, agent, fromMachine, toMachine]);
    await client.query('COMMIT');
    return { ok: true };
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
  finally { client.release(); }
}
export async function getTransfer(id: string): Promise<any | null> {
  const { rows } = await db().query<any>(
    `SELECT id, agent, from_machine, to_machine, status, bundle_sha256, bundle_size,
       to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
       to_char(completed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS completed_at
     FROM agent_transfers WHERE id=$1`, [id]);
  return rows[0] || null;
}
export async function listTransfersForMachine(toMachine: string): Promise<any[]> {
  const { rows } = await db().query<any>(
    `SELECT id, agent, from_machine, to_machine, status, bundle_sha256, bundle_size,
       to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
     FROM agent_transfers WHERE to_machine=$1 AND status='bundled' ORDER BY created_at`, [toMachine]);
  return rows;
}
export async function saveTransferBundle(transferId: string, contentB64: string, sha256: string, size: number): Promise<void> {
  await db().query(
    `INSERT INTO transfer_bundles (transfer_id, content_b64, sha256, size, created_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (transfer_id) DO UPDATE SET content_b64=EXCLUDED.content_b64, sha256=EXCLUDED.sha256, size=EXCLUDED.size, created_at=now()`,
    [transferId, contentB64, sha256, size]);
  await db().query(`UPDATE agent_transfers SET status='bundled', bundle_sha256=$2, bundle_size=$3 WHERE id=$1`, [transferId, sha256, size]);
}
export async function getTransferBundle(transferId: string): Promise<{ contentB64: string; sha256: string; size: number } | null> {
  const { rows } = await db().query<any>(`SELECT content_b64, sha256, size FROM transfer_bundles WHERE transfer_id=$1`, [transferId]);
  return rows[0] ? { contentB64: rows[0].content_b64, sha256: rows[0].sha256 || '', size: Number(rows[0].size) || 0 } : null;
}
/** Atomically complete a transfer: agent's home becomes to_machine + status home, transfer marked completed.
 *  This single owner-of-truth flip is what guarantees only the destination authors after the move. */
export async function completeTransfer(id: string, toMachine: string): Promise<{ ok: boolean; reason?: string }> {
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const t = await client.query<any>(`SELECT agent, status FROM agent_transfers WHERE id=$1 FOR UPDATE`, [id]);
    if (!t.rows[0]) { await client.query('ROLLBACK'); return { ok: false, reason: 'not_found' }; }
    if (t.rows[0].status === 'completed') { await client.query('ROLLBACK'); return { ok: false, reason: 'already_completed' }; }
    const agent = String(t.rows[0].agent);
    await client.query(`UPDATE agent_transfers SET status='completed', to_machine=$2, completed_at=now() WHERE id=$1`, [id, toMachine]);
    await client.query(
      `INSERT INTO agent_homes (agent, home_machine, status, updated_at) VALUES ($1,$2,'home',now())
       ON CONFLICT (agent) DO UPDATE SET home_machine=$2, status='home', updated_at=now()`,
      [agent, toMachine]);
    await client.query('COMMIT');
    return { ok: true };
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
  finally { client.release(); }
}

// ---- Machine presence registry (Arke cef127e6, 2026-06-26) ------------------
export async function registerMachine(name: string): Promise<void> {
  await db().query(
    `INSERT INTO machines (machine_name, last_seen) VALUES ($1, now())
     ON CONFLICT (machine_name) DO UPDATE SET last_seen=now()`, [name]);
}
export async function listMachines(): Promise<Array<{ machine_name: string; last_seen: string }>> {
  const { rows } = await db().query<any>(
    `SELECT machine_name, to_char(last_seen at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen
     FROM machines ORDER BY last_seen DESC`);
  return rows;
}

// ---- Chronicle story repository (owner 2026-06-24) --------------------------
/** Append one story entry for an actor; returns its id + server-stamped createdAt (UTC ISO). Optional
 *  fields (Logos f6164bf6): title/tags are author metadata; packSha/corpusSha/builtAt are the server-derived
 *  provenance of the author's brain at write time. Any may be null — recorded absent, never synthesized. */
export async function addStoryEntry(actor: string, content: string, meetingId: string | null,
  opts: { title?: string | null; tags?: string[] | null; packSha?: string | null; corpusSha?: string | null; builtAt?: string | null } = {}): Promise<{ id: string; createdAt: string }> {
  const tags = Array.isArray(opts.tags) && opts.tags.length ? JSON.stringify(opts.tags) : null;
  const { rows } = await db().query<any>(
    `INSERT INTO story_log (actor, content, meeting_id, title, tags, pack_sha, corpus_sha, built_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
     RETURNING id, to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at`,
    [actor, String(content), meetingId, opts.title ?? null, tags, opts.packSha ?? null, opts.corpusSha ?? null, opts.builtAt ?? null]);
  return { id: String(rows[0].id), createdAt: rows[0].created_at };
}
// Row-3 adopted standard `json-64bit-as-decimal-string` (proposed mtg ba750c9a 2026-06-25, #39): a story
// entry's monotonic `seq` is the bigserial id rendered as a DECIMAL STRING (the id is 64-bit; JSON numbers
// lose precision past 2^53). story_log is APPEND-ONLY, so seq is immutable and strictly increasing. The
// canonical chronicle cursor is the HALF-OPEN-EXCLUSIVE boundary `seq > sinceSeq` (Logos's ordering catch +
// Nova's idempotency catch closed from both sides by one monotonic seq): strict `>` makes a re-read with the
// last-seen seq return exactly the un-consumed tail with no duplicate and no gap, regardless of created_at
// ties or clock skew. `seq` is emitted on every entry; both reader functions return the identical entry shape.
function mapStoryRow(r: any) {
  return { seq: String(r.id), id: String(r.id), actor: r.actor, content: r.content, meetingId: r.meeting_id || null,
    title: r.title || null, tags: Array.isArray(r.tags) ? r.tags : [], packSha: r.pack_sha || null,
    corpusSha: r.corpus_sha || null, builtAt: r.built_at || null, createdAt: r.created_at };
}
/** All story entries created strictly AFTER `sinceIso` (null/epoch → all), oldest-first, capped. Legacy
 *  timestamp cursor; the seq cursor below is canonical for new consumers. */
export async function getStorySince(sinceIso: string | null, limit = 500): Promise<any[]> {
  const since = sinceIso || '1970-01-01T00:00:00Z';
  const { rows } = await db().query<any>(
    `SELECT id, actor, content, meeting_id, title, tags, pack_sha, corpus_sha,
       to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
       to_char(built_at  at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS built_at
     FROM story_log WHERE created_at > $1 ORDER BY created_at ASC, id ASC LIMIT $2`,
    [since, Math.min(Math.max(Number(limit) || 500, 1), 2000)]);
  return rows.map(mapStoryRow);
}
/** Canonical chronicle read: all entries with seq strictly greater than `sinceSeq` (half-open-exclusive),
 *  oldest-first by seq, capped. `sinceSeq` is a validated decimal string (the caller asserts the regex +
 *  BigInt() at the route boundary); passed to Postgres as ::bigint. sinceSeq "0"/null → the whole log. */
export async function getStorySinceSeq(sinceSeq: string | null, limit = 500): Promise<any[]> {
  const since = (sinceSeq && /^(0|[1-9][0-9]*)$/.test(sinceSeq)) ? sinceSeq : '0';
  const { rows } = await db().query<any>(
    `SELECT id, actor, content, meeting_id, title, tags, pack_sha, corpus_sha,
       to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
       to_char(built_at  at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS built_at
     FROM story_log WHERE id > $1::bigint ORDER BY id ASC LIMIT $2`,
    [since, Math.min(Math.max(Number(limit) || 500, 1), 2000)]);
  return rows.map(mapStoryRow);
}
// ---- Adopted-standards record (#40, owner 2026-06-25) -----------------------
/** Record/refresh a PROPOSED standard (idempotent on slug). Carries provenance (the meeting it was proposed
 *  in + who recorded it) but NO authority — authority comes only from per-project ratifications below. */
export async function upsertStandard(slug: string, title: string | null, statement: string,
  proposedMeetingId: string | null, proposedBy: string | null): Promise<{ id: string; slug: string }> {
  const { rows } = await db().query<any>(
    `INSERT INTO adopted_standards (slug, title, statement, proposed_meeting_id, proposed_by)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, statement=EXCLUDED.statement,
       proposed_meeting_id=COALESCE(EXCLUDED.proposed_meeting_id, adopted_standards.proposed_meeting_id),
       proposed_by=COALESCE(EXCLUDED.proposed_by, adopted_standards.proposed_by)
     RETURNING id, slug`,
    [slug, title, statement, proposedMeetingId, proposedBy]);
  return { id: String(rows[0].id), slug: rows[0].slug };
}
export async function standardExists(slug: string): Promise<boolean> {
  const { rows } = await db().query(`SELECT 1 FROM adopted_standards WHERE slug=$1`, [slug]);
  return rows.length > 0;
}
/** Record one project's ratification of a standard (one row per (slug, actor); a project may change its
 *  decision — latest wins). Written ONLY for an authenticated caller; a meeting voice cannot reach this. */
export async function ratifyStandard(slug: string, actor: string, decision: 'accept' | 'reject',
  note: string | null): Promise<{ slug: string; actor: string; decision: string; ratifiedAt: string }> {
  const { rows } = await db().query<any>(
    `INSERT INTO adopted_standard_ratifications (standard_slug, actor, decision, note)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (standard_slug, actor) DO UPDATE SET decision=EXCLUDED.decision, note=EXCLUDED.note, ratified_at=now()
     RETURNING standard_slug, actor, decision,
       to_char(ratified_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ratified_at`,
    [slug, actor, decision, note]);
  const r = rows[0];
  return { slug: r.standard_slug, actor: r.actor, decision: r.decision, ratifiedAt: r.ratified_at };
}
/** All standards (newest-first by proposal) each with its ratification rows. Status is left to the caller,
 *  which knows the canonical seat list (the store is seat-agnostic). */
export async function listStandards(): Promise<any[]> {
  const { rows } = await db().query<any>(
    `SELECT id, slug, title, statement, proposed_meeting_id, proposed_by,
       to_char(proposed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS proposed_at
     FROM adopted_standards ORDER BY id DESC`);
  const { rows: rat } = await db().query<any>(
    `SELECT standard_slug, actor, decision, note,
       to_char(ratified_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ratified_at
     FROM adopted_standard_ratifications ORDER BY ratified_at ASC, id ASC`);
  const bySlug = new Map<string, any[]>();
  for (const r of rat) {
    const arr = bySlug.get(r.standard_slug) || [];
    arr.push({ actor: r.actor, decision: r.decision, note: r.note || null, ratifiedAt: r.ratified_at });
    bySlug.set(r.standard_slug, arr);
  }
  return rows.map((r) => ({ seq: String(r.id), slug: r.slug, title: r.title || null, statement: r.statement,
    proposedMeetingId: r.proposed_meeting_id || null, proposedBy: r.proposed_by || null, proposedAt: r.proposed_at,
    ratifications: bySlug.get(r.slug) || [] }));
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
/** Richer meeting list for the owner dashboard — adds closed_at, ended_reason, and the ledger USD. */
export async function listMeetingsForDashboard(limit = 12): Promise<any[]> {
  const { rows } = await db().query<any>(`SELECT id, agenda, phase, turns_used, turn_cap, ended_reason,
    (cost_ledger->'total'->>'usd')::numeric AS usd,
    to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
    to_char(closed_at  at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS closed_at
    FROM meetings ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows.map((r) => ({ id: r.id, agenda: r.agenda, phase: r.phase, turnsUsed: r.turns_used, turnCap: r.turn_cap,
    endedReason: r.ended_reason || null, usd: r.usd == null ? null : Number(r.usd), createdAt: r.created_at, closedAt: r.closed_at }));
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
