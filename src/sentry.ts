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

/**
 * Best-effort Sentry Cron check-in. Sends a check-in for `monitorSlug` and (via monitor_config) upserts the
 * monitor's expected schedule, so Sentry alerts if a scheduled run is ever MISSED — e.g. the nightly council
 * meeting scheduler dying silently. Same fail-soft contract as captureError: no-op until SENTRY_DSN is set,
 * never throws into the caller. crontab is UTC/tz-aware via the timezone arg.
 */
export function cronCheckIn(monitorSlug: string, status: 'ok' | 'error' | 'in_progress', scheduleCrontab: string, timezone: string): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const m = /^(https?):\/\/([^@]+)@([^/]+)\/(.+)$/.exec(dsn.trim());
    if (!m) return;
    const [, scheme, publicKey, host, projectId] = m;
    const envHeader = JSON.stringify({ event_id: crypto.randomUUID().replace(/-/g, ''), sent_at: new Date().toISOString(), dsn: dsn.trim() });
    const itemHeader = JSON.stringify({ type: 'check_in' });
    const payload = JSON.stringify({
      check_in_id: crypto.randomUUID().replace(/-/g, ''),
      monitor_slug: monitorSlug,
      status,
      environment: process.env.NODE_ENV || 'production',
      monitor_config: { schedule: { type: 'crontab', value: scheduleCrontab }, checkin_margin: 30, max_runtime: 45, timezone },
    });
    const body = envHeader + '\n' + itemHeader + '\n' + payload + '\n';
    const url = `${scheme}://${host}/api/${projectId}/envelope/`;
    const auth = `Sentry sentry_version=7, sentry_client=hub-fetch/1.0, sentry_key=${publicKey}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Sentry-Auth': auth }, body, signal: ctrl.signal })
      .catch(() => { /* best-effort */ })
      .finally(() => clearTimeout(timer));
  } catch { /* check-in is best-effort; never throw */ }
}
