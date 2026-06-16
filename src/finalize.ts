/**
 * Shared meeting close-finalizer (council meeting #7 homework, 2026-06-15).
 *
 * One always-on close path so a meeting that reaches phase=report — whether by the owner's /close
 * route OR by the autonomous voice loop reaching its end — gets the SAME finish: closed_at set,
 * storyUpdates routed to Logos for the Chronicle, the 4-point owner report synthesized + stored +
 * emailed, and the synthesis call charged to the meeting ledger.
 *
 * Root cause it fixes: the voice loop only set phase='report' and stopped, so autonomous overnight
 * meetings (17f49b6f, 0d94d988, a4644f78) sat at closed_at:null with owner-report 404 — nobody
 * called /close. (Arke's #7 debrief, finding 2.)
 *
 * Lives in its OWN module (imported by both voiceloop.ts and, in a later pass, council.ts) so neither
 * imports the other — no circular dependency. Idempotent: a meeting already closed (closed_at set) is
 * left untouched, so a double close/finalize never re-synthesizes or re-emails. Dry-run rooms never
 * spend and never pollute the Chronicle.
 *
 * The owner /close route (council.ts) and the autonomous voice loop BOTH call finalizeMeetingClose
 * (converged 2026-06-15) — single close path, no twin to keep in step.
 */
import { updateMeeting, setMeetingOwnerReport, setMeetingLedger, queueEnvTask, getSetting } from './store.js';
import { synthesizeOwnerReport, OWNER_REPORT_MODEL } from './architect.js';
import { sendOwnerReportEmail } from './mailer.js';
import { emptyTotals, addUsage } from './cost.js';

const clip = (s: any, n: number) => String(s ?? '').slice(0, n);

/** Brain-manifest 2.1 owner-report surface (corpus-contract §6, Logos rider): a deterministic line
 *  noting every seat whose pack+corpus did NOT pin as a verified atomic pair, with the reason — so a
 *  manifest-less or stale-manifest meeting is never silently trusted. Returns '' when every seat paired. */
export function manifestPinLine(pins: any): string {
  if (!pins || typeof pins !== 'object') return '';
  const entries = Object.entries(pins as Record<string, any>);
  if (!entries.length) return '';
  const notPaired = entries.filter(([, v]) => v && v.state !== 'paired');
  if (!notPaired.length) return `\n\n---\nBrain manifests: all ${entries.length} seat(s) pinned a verified pack+corpus pair (manifest 2.1).`;
  const detail = notPaired.map(([actor, v]) => `${actor}=${v.state || 'none'}(${v.reason || 'unspecified'})`).join(', ');
  return `\n\n---\nBrain manifests (2.1): ${notPaired.length} of ${entries.length} seat(s) NOT atomically paired — fell back to per-kind pinning: ${detail}.`;
}

export interface FinalizeResult {
  ok: boolean;
  alreadyClosed: boolean;
  dryRun: boolean;
  storyUpdatesRouted: number;
  ownerReport: boolean;
  emailSent: boolean;
  emailReason: string | null;
}

/** Close + finalize a meeting. Pass the full meeting row (from getMeeting). Idempotent on closed_at. */
export async function finalizeMeetingClose(m: any, opts: { report?: string } = {}): Promise<FinalizeResult> {
  const base: FinalizeResult = {
    ok: true, alreadyClosed: false, dryRun: !!(m && m.dry_run),
    storyUpdatesRouted: 0, ownerReport: false, emailSent: false, emailReason: null,
  };
  if (!m) return { ...base, ok: false };
  // Idempotency: a meeting already closed keeps its report/email — never re-synthesize or re-send.
  if (m.closed_at) return { ...base, alreadyClosed: true, ownerReport: !!m.owner_report, emailReason: 'already_closed' };

  await updateMeeting(m.id, { phase: 'report', report: clip(opts.report, 16000) || m.report, closed: true });

  // Route each storyUpdate to Logos for the Chronicle — unless this is a dry-run/test room (mock
  // storyUpdates must not pollute the Chronicle).
  let storyCount = 0;
  if (!m.dry_run) {
    for (const t of (m.transcript || [])) {
      const su = t && t.payload && t.payload.storyUpdate;
      if (su) {
        storyCount++;
        try {
          await queueEnvTask('hub', 'logos', 'story', clip('storyUpdate from ' + t.actor + ' (meeting ' + m.id + ')', 300),
            { text: String(su), actor: t.actor, meetingId: m.id }, 'normal');
        } catch { /* swallow-ok: chronicle routing is best-effort, never fails the close */ }
      }
    }
  }
  base.storyUpdatesRouted = storyCount;

  // OWNER REPORT (ROADMAP Layer 0): on every REAL close, synthesize the 4-point report with one
  // bounded Sonnet call, store it, email it best-effort. Dry-run rooms never spend.
  let emailResult: any = { sent: false, reason: 'not_attempted' };
  if (!m.dry_run) {
    const spoken = (m.transcript || [])
      .filter((t: any) => t && t.kind === 'speak' && t.payload)
      .map((t: any) => ({ actor: String(t.actor), text: clip(JSON.stringify(t.payload), 4000) }));
    // Per-reason auto-PASS counts make an error-heavy or stalled meeting visible at a glance.
    const passCounts: Record<string, number> = {};
    for (const t of (m.transcript || [])) if (t && t.kind === 'pass' && t.auto) { const r = String(t.reason || 'unknown'); passCounts[r] = (passCounts[r] || 0) + 1; }
    if (spoken.length) {
      try {
        const { report, usage } = await synthesizeOwnerReport(m.agenda || '', spoken);
        if (report && !report.startsWith('(owner-report error')) {
          const passLine = Object.keys(passCounts).length ? `\n\n---\nAuto-passes this meeting: ${Object.entries(passCounts).map(([r, n]) => `${r}=${n}`).join(', ')}` : '';
          // Brain-manifest 2.1 (Logos rider): any non-paired seat MUST be surfaced in the owner report
          // with a reason — never silent. Deterministic line, not LLM-synthesized.
          const manifestLine = manifestPinLine(m.manifest_pins);
          const full = clip(report + passLine + manifestLine, 16000);
          await setMeetingOwnerReport(m.id, full);
          base.ownerReport = true;
          try {
            const to = await getSetting('owner_notify_email');
            if (to) emailResult = await sendOwnerReportEmail(to, `Architects Council — meeting report (${new Date().toISOString().slice(0, 10)})`, full);
            else emailResult = { sent: false, reason: 'no_registered_email' };
          } catch (e) { emailResult = { sent: false, reason: 'email_threw:' + (e as Error).message.slice(0, 80) }; }
        }
        // Charge the synthesis call to the meeting cost ledger (ledger accuracy for the §2 envelope).
        if (usage && (usage.input_tokens || usage.output_tokens)) {
          const led = (m.cost_ledger && m.cost_ledger.total) ? m.cost_ledger : { total: emptyTotals(), perAgent: {} };
          led.total = addUsage(led.total, OWNER_REPORT_MODEL, usage);
          led.perAgent['owner-report'] = addUsage(led.perAgent['owner-report'] || emptyTotals(), OWNER_REPORT_MODEL, usage);
          await setMeetingLedger(m.id, led);
        }
      } catch { /* swallow-ok: owner-report synthesis is best-effort, never fails the close */ }
    }
  }
  base.emailSent = !!emailResult.sent;
  base.emailReason = emailResult.reason || null;
  return base;
}
