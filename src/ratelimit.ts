/**
 * Per-IP fixed-window rate limiter (council v2 contract §7). Dependency-free — the hub keeps a tiny
 * dependency surface on purpose (it's the most-gated repo). Behind Railway's proxy, set
 * `trust proxy` so req.ip is the client, not the edge. Health checks are exempt so Railway's probe
 * never trips it. Fail-open on internal error (never let the limiter itself take the hub down).
 */
import type { Request, Response, NextFunction } from 'express';

interface Bucket { count: number; resetAt: number }

export function rateLimit(opts: { windowMs?: number; max?: number; skip?: (req: Request) => boolean } = {}) {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 120;
  const skip = opts.skip ?? (() => false);
  const buckets = new Map<string, Bucket>();

  // Periodic cleanup so the map can't grow unbounded.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [ip, b] of buckets) if (b.resetAt <= now) buckets.delete(ip);
  }, 5 * 60_000);
  if (typeof sweep.unref === 'function') sweep.unref();

  return function (req: Request, res: Response, next: NextFunction) {
    try {
      if (skip(req)) return next();
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const now = Date.now();
      let b = buckets.get(ip);
      if (!b || b.resetAt <= now) { b = { count: 0, resetAt: now + windowMs }; buckets.set(ip, b); }
      b.count++;
      if (b.count > max) {
        res.setHeader('Retry-After', Math.ceil((b.resetAt - now) / 1000));
        return res.status(429).json({ error: 'rate_limited' });
      }
      next();
    } catch { next(); } // fail-open: a limiter bug must never break the hub
  };
}
