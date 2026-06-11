/**
 * Owner-report email transport (owner directive 2026-06-11). One bounded HTTP call to the Resend
 * API (https://resend.com) — no SMTP, no deps, Railway-friendly. ENV-GATED and fail-soft: if the
 * key/from are unset, or the send fails, this returns a reason and NEVER throws into the close path.
 * Secrets are read at call time (never at module top — Railway returns undefined at container start)
 * and are referenced by env name only; no key value is logged.
 */
const FROM = () => process.env.OWNER_REPORT_FROM || 'onboarding@resend.dev';

export interface MailResult { sent: boolean; reason?: string; id?: string }

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Send the owner report to one recipient. Best-effort: returns {sent:false,reason} instead of throwing. */
export async function sendOwnerReportEmail(to: string, subject: string, reportMarkdown: string): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: 'no_api_key' };
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { sent: false, reason: 'no_recipient' };
  const html = `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;font-size:13px;line-height:1.5">${esc(reportMarkdown)}</pre>`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM(), to: [to], subject: String(subject).slice(0, 200), text: reportMarkdown, html }),
    });
    if (!r.ok) {
      const code = r.status;
      let detail = '';
      try { const j: any = await r.json(); detail = j && (j.message || j.name) ? `:${j.name || ''}:${j.message || ''}` : ''; } catch { /* ignore */ }
      return { sent: false, reason: `http_${code}${detail}`.slice(0, 200) };
    }
    let id: string | undefined;
    try { const j: any = await r.json(); id = j && j.id ? String(j.id) : undefined; } catch { /* ignore */ }
    return { sent: true, id };
  } catch (e) {
    return { sent: false, reason: 'fetch_error:' + (e as Error).message.slice(0, 120) };
  }
}
