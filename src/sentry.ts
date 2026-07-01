// Fail-soft, dependency-free error capture for OUR hub's own Sentry project.
//
// Env-gated on SENTRY_DSN: a NO-OP until the owner sets the DSN in Railway, so this ships DORMANT with
// zero blast radius and flips on the moment the DSN is present. Mirrors mailer.ts (best-effort HTTP that
// NEVER throws into the caller). No new dependency — uses Node 20 global fetch. Env is read inside the
// function (hub convention: never at module top-level). Payload is limited to error name/message/stack +
// a small transaction tag (the same detail already written to Railway logs) — no request bodies/headers/
// secrets are ever forwarded.
import crypto from 'node:crypto';

let warnedBadDsn = false;

/** Best-effort report of a server-side error to Sentry. Never throws; drops silently if unconfigured. */
export function captureError(kind: string, err: unknown, extra?: Record<string, unknown>): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return; // dormant until configured
  try {
    // DSN shape: https://<publicKey>@<host>/<projectId>
    const m = /^(https?):\/\/([^@]+)@([^/]+)\/(.+)$/.exec(dsn.trim());
    if (!m) {
      if (!warnedBadDsn) { warnedBadDsn = true; console.warn('[sentry] SENTRY_DSN malformed; capture disabled'); }
      return;
    }
    const [, scheme, publicKey, host, projectId] = m;
    const e = err as Error | undefined;
    const event = {
      event_id: crypto.randomUUID().replace(/-/g, ''),
      timestamp: new Date().toISOString(),
      platform: 'node',
      level: 'error',
      logger: 'hub',
      server_name: 'architectscouncil',
      release: process.env.RAILWAY_GIT_COMMIT_SHA || undefined,
      environment: process.env.NODE_ENV || 'production',
      transaction: kind,
      exception: { values: [{ type: (e && e.name) || kind, value: (e && e.message) || String(err) }] },
      extra: { ...(extra || {}), stack: e && e.stack ? e.stack : undefined },
    };
    const url = `${scheme}://${host}/api/${projectId}/store/`;
    const auth = `Sentry sentry_version=7, sentry_client=hub-fetch/1.0, sentry_key=${publicKey}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    // Fire-and-forget: dropping an error report must never cascade into the path it is reporting on.
    void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sentry-Auth': auth }, body: JSON.stringify(event), signal: ctrl.signal })
      .catch(() => { /* best-effort */ })
      .finally(() => clearTimeout(timer));
  } catch { /* capture is best-effort; never throw */ }
}
