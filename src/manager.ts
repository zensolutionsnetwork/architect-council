/**
 * Layer-1 Manager (owner 2026-06-18) — turns individual meetings into TRACKED progress.
 *
 * Runs once at meeting-close (hooked from finalize.ts, after the owner report). For each meeting it:
 *   1. computes deterministic ADOPTION SIGNALS per agent (brought a paired brain? shipped code since the
 *      last meeting? actually spoke?),
 *   2. does a CHEAP since-last code review — it reads each shipped agent's small PACK summary (their own
 *      "what changed" note), NOT the full ~MB corpus, and asks for one bounded narrative,
 *   3. detects RECURRING flags and AUTO-SEEDS the agenda (dedupe: one agenda item per flag, updated not
 *      duplicated), closing the loop flag -> agenda -> discussed next meeting.
 *
 * PORTABLE BY DESIGN (owner intent): the compute lives in the hub for now but is written as a self-contained
 * module behind clean owner-gated JSON (GET /api/council/manager/*), so Arke's Supervisor app can consume the
 * digests/flags immediately and EVENTUALLY OWN this computation. Keep inputs/outputs stable for that handoff.
 *
 * Best-effort + fail-soft: never throws to the close path, never spends on a dry-run.
 */
import {
  getBrainV2Content, getPriorMeetingBrainVersions, setManagerDigest, setMeetingLedger,
  upsertManagerFlag, setFlagAgendaItem, createAgendaItem,
} from './store.js';
import { synthesizeManagerNarrative, OWNER_REPORT_MODEL } from './architect.js';
import { emptyTotals, addUsage } from './cost.js';

const clip = (s: any, n: number) => String(s ?? '').slice(0, n);
const MANAGER_SEATS = ['kairos', 'arke', 'nova', 'logos'];

export interface ManagerDigest {
  meetingId: string;
  generatedAt: string;
  perAgent: Array<{ actor: string; codeChanged: boolean; brainPaired: boolean; participated: boolean; corpusVersion: string | null }>;
  codeChanged: string[];
  newFlags: Array<{ slug: string; title: string; count: number }>;
  seededAgendaItemIds: string[];
  note: string;
  model: string | null;
}

/** Run the Layer-1 pass for a just-closed meeting row `m` (from getMeeting). */
export async function runLayer1Manager(m: any): Promise<ManagerDigest | null> {
  if (!m || m.dry_run) return null; // dry-runs never spend / never tracked
  const participants: string[] = Array.isArray(m.participants) && m.participants.length ? m.participants : MANAGER_SEATS;
  const transcript: any[] = Array.isArray(m.transcript) ? m.transcript : [];
  const brainVersions: Record<string, any> = (m.brain_versions && typeof m.brain_versions === 'object') ? m.brain_versions : {};
  const pins: Record<string, any> = (m.manifest_pins && typeof m.manifest_pins === 'object') ? m.manifest_pins : {};
  let prior: Record<string, any> | null = null;
  try { prior = await getPriorMeetingBrainVersions(m.id); } catch { prior = null; }

  const spokeBy = new Set(transcript.filter((t) => t && t.kind === 'speak').map((t) => String(t.actor)));

  const perAgent: ManagerDigest['perAgent'] = [];
  const codeChanged: string[] = [];
  for (const p of participants) {
    const cur = brainVersions[p] != null ? String(brainVersions[p]) : null;
    const prev = prior && prior[p] != null ? String(prior[p]) : null;
    // code "changed" = corpus brain_version differs from the last meeting, or first time we've seen this seat.
    const changed = !!cur && (prev == null ? true : cur !== prev);
    const paired = !!(pins[p] && pins[p].state === 'paired');
    const participated = spokeBy.has(p);
    perAgent.push({ actor: p, codeChanged: changed, brainPaired: paired, participated, corpusVersion: cur });
    if (changed) codeChanged.push(p);
  }

  // Deterministic flags this meeting (cheap, meaningful) — per agent.
  const detected: Array<{ slug: string; title: string }> = [];
  for (const a of perAgent) {
    if (!a.brainPaired) detected.push({ slug: `brain-unpaired:${a.actor}`, title: `${a.actor} brought a non-paired brain (stale or missing 2.1 manifest)` });
    if (!a.participated) detected.push({ slug: `silent:${a.actor}`, title: `${a.actor} did not speak this meeting` });
  }

  // Cheap since-last code review: read ONLY the shipped agents' small pack summaries (not the corpus).
  let note = 'Nothing notable this meeting.';
  let model: string | null = null;
  if (codeChanged.length) {
    const parts: string[] = [];
    for (const p of codeChanged) {
      let packText = '';
      try { const pc = await getBrainV2Content(p, 'pack'); if (pc && pc.content) packText = pc.content.toString('utf8'); } catch { /* pack absent */ }
      parts.push(`### ${p} shipped code since last meeting\n${clip(packText, 3000) || '(no pack summary committed)'}`);
    }
    const adoption = perAgent.map((a) => `${a.actor}: paired=${a.brainPaired} spoke=${a.participated} shipped=${a.codeChanged}`).join('; ');
    const tdigest = transcript.filter((t) => t && t.kind === 'speak' && t.payload)
      .map((t) => `[${t.actor}] ${clip(JSON.stringify(t.payload), 600)}`).join('\n').slice(-6000);
    const input = `Adoption signals: ${adoption}\n\nShipped code (agent pack summaries):\n${parts.join('\n\n')}\n\nTranscript digest:\n${tdigest}`;
    try {
      const out = await synthesizeManagerNarrative(input);
      if (out.note && !out.note.startsWith('(manager-note error')) { note = out.note; model = OWNER_REPORT_MODEL; }
      // Charge the one bounded call to the meeting ledger (ledger accuracy for the §2 envelope).
      if (out.usage && (out.usage.input_tokens || out.usage.output_tokens)) {
        const led = (m.cost_ledger && m.cost_ledger.total) ? m.cost_ledger : { total: emptyTotals(), perAgent: {} };
        led.total = addUsage(led.total, OWNER_REPORT_MODEL, out.usage);
        led.perAgent['layer1-manager'] = addUsage(led.perAgent['layer1-manager'] || emptyTotals(), OWNER_REPORT_MODEL, out.usage);
        try { await setMeetingLedger(m.id, led); } catch { /* ledger write best-effort */ }
      }
    } catch { /* narrative best-effort */ }
  }

  // Recurring detection + auto-seed (dedupe: one agenda item per flag slug, ever).
  const newFlags: ManagerDigest['newFlags'] = [];
  const seededAgendaItemIds: string[] = [];
  for (const f of detected) {
    try {
      const row = await upsertManagerFlag(f.slug, f.title, m.id);
      newFlags.push({ slug: f.slug, title: f.title, count: row.count });
      // Recurring = seen in >= 2 meetings. Seed ONE agenda item, only if none exists yet for this flag.
      if (row.count >= 2 && !row.agenda_item_id) {
        const item = await createAgendaItem('layer1',
          `[recurring] ${f.title}`,
          `Auto-flagged by the Layer-1 Manager in ${row.count} meetings (since ${row.first_meeting}). Most recent: ${m.id}.`,
          'high');
        await setFlagAgendaItem(f.slug, item.id);
        seededAgendaItemIds.push(item.id);
      }
    } catch { /* a single flag failing must not sink the digest */ }
  }

  const digest: ManagerDigest = {
    meetingId: m.id, generatedAt: new Date().toISOString(),
    perAgent, codeChanged, newFlags, seededAgendaItemIds, note, model,
  };
  try { await setManagerDigest(m.id, digest); } catch { /* digest persist best-effort */ }
  return digest;
}
