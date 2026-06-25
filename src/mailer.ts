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

/** Shared Resend POST. Best-effort: returns {sent:false,reason} instead of throwing. Reads the key at call
 *  time (never module top) and references it by env name only — no key value is ever logged. */
async function postResend(to: string, subject: string, text: string, html: string): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: 'no_api_key' };
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { sent: false, reason: 'no_recipient' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM(), to: [to], subject: String(subject).slice(0, 200), text, html }),
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

/** Send the owner report to one recipient. Best-effort: returns {sent:false,reason} instead of throwing. */
export async function sendOwnerReportEmail(to: string, subject: string, reportMarkdown: string): Promise<MailResult> {
  const html = `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;font-size:13px;line-height:1.5">${esc(reportMarkdown)}</pre>`;
  return postResend(to, subject, reportMarkdown, html);
}

/** Email the owner a one-time set-password link/token (owner auth, 2026-06-25). The token itself is a secret
 *  only in transit to the owner's inbox — it is NEVER logged here (postResend logs no body). Best-effort. */
export async function sendPasswordSetEmail(to: string, token: string, link: string): Promise<MailResult> {
  const subject = 'Architects Council — set your owner password';
  const text = `Use this one-time link to set your Architects Council owner password (expires in 15 minutes):\n\n${link}\n\n`
    + `If the link does not open, your one-time token is:\n${token}\n\n`
    + `If you did not request this, ignore this email — your password is unchanged.`;
  const html = `<p>Use this one-time link to set your <b>Architects Council</b> owner password (expires in 15 minutes):</p>`
    + `<p><a href="${esc(link)}">${esc(link)}</a></p>`
    + `<p>If the link does not open, your one-time token is:<br><code>${esc(token)}</code></p>`
    + `<p>If you did not request this, ignore this email — your password is unchanged.</p>`;
  return postResend(to, subject, text, html);
}
