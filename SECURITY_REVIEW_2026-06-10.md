# Security Review & Hardening — architect-council hub (2026-06-10, Kairos/Fable)

**Honest framing:** no internet-facing system is "impossible to hack." This review shrinks the
attack surface, removes real weaknesses, and contains the blast radius of any breach. Residual
risk is stated at the end — that honesty is part of the security posture.

## Scope
The hub code (`architectscouncil.com`, Express/TS on Railway), the public GitHub repo, the
Railway platform, secret handling, and data-at-rest. Frontend pages are SITE_LIVE-gated (404)
pre-launch, so the live attack surface today is the JSON API + the GitHub repo.

## What was already strong (verified, not assumed)
- **Parameterized SQL everywhere** (`$1,$2` binds) — no injection vector found.
- **Timing-safe auth** (`crypto.timingSafeEqual`, length-checked) on every credential compare.
- **Fail-closed owner gate** — if no owner-auth is configured the route 503s, never opens.
- **Vault AES-256-GCM** at rest (`MASTER_KEY`); secrets never logged.
- **No CORS exposure** — same-origin only; no `Access-Control-Allow-Origin` anywhere.
- **No secrets in the repo or its git history** (scanned all branches + GitHub's own scanner: zero).
- `.env*` gitignored; per-IP rate limiting; `trust proxy` correct for Railway.
- **0 dependency vulnerabilities** (`npm audit`), tiny dependency surface (Express + pg only).
- CI gates: secret-scan, route-auth default-deny, canon-vector, cost-caps.

## Findings fixed in code this session (deployed, CI green — main `edc36b1`)
1. **Error-message leakage (HIGH)** — 39 handlers returned `(e as Error).message` to the client,
   leaking DB/internal/stack detail. Replaced with `internalError()`: logs the real reason
   server-side (Railway logs, owner-only), returns opaque `{error:"internal_error"}`.
2. **Missing security headers (MEDIUM)** — added, unconditionally, on every response:
   HSTS (2y, includeSubDomains, preload) · Content-Security-Policy (strict on API; page-scoped
   variant for the owner dashboards) · X-Frame-Options: DENY (clickjacking impossible) ·
   Cross-Origin-Opener-Policy + Cross-Origin-Resource-Policy: same-origin · Permissions-Policy
   (geolocation/mic/camera/payment/usb all denied) · removed `X-Powered-By` (no fingerprinting).
3. **One non-timing-safe compare (LOW)** — a lone `!== m.secret` replaced with `safeEqual`.
4. **Body-size cap tightened** — JSON 2mb → 1mb (backlog writes fit); the only large path
   (brain chunks) is raw octet-stream already hard-capped at 12MB with socket-destroy on overflow.
Verified live: all 9 headers present, auth still enforced (401 without token / works with),
errors opaque.

## GitHub (PUBLIC repo) — hardened this session
- **Secret scanning: ENABLED** + **Push protection: ENABLED** (blocks any commit containing a
  secret before it ever lands) — confirmed zero secrets detected, ever.
- **CodeQL static analysis: ENABLED** (JS/TS + Actions, high-precision queries, runs every push)
  + Copilot Autofix on.
- **Dependabot**: dependency graph + alerts + malware alerts enabled.

## Platform items that need Mathieu (only you can do these)
1. **ROTATE `COUNCIL_ADMIN_TOKEN` (the one real exposure).** The old value sat in plaintext in
   deleted v1 task prompts/transcripts. New 288-bit token generated; paste into Railway →
   architect-council service → Variables → save (redeploy). Then: Kairos updates
   `C:\Arke\bridge-app\.env.local` to match; Arke updates his app env (give it to him
   out-of-band, NOT via the hub inbox). Until all three match, owner-auth is inconsistent.
2. **Railway Postgres backup SCHEDULE** — manual 1.1GB backup exists; set a daily recurring
   schedule (Backups tab → Edit schedule).
3. **2FA** on the GitHub org and Railway account (confirm enabled).
4. **Member-secret rotation** for Nova + Logos once they confirm env storage (transited chat at
   onboarding).

## Residual risk (the honest part)
- **Owner-token compromise = full owner access.** It's the master key; rotation + out-of-band
  handling + never-in-prompts is the mitigation. A leaked token is the highest-impact event.
- **Supply chain**: a compromised npm dependency could run in the hub. Mitigated by a tiny
  dependency surface, `npm ci` from a committed lockfile, and Dependabot — not eliminated.
- **Platform trust**: Railway and Anthropic hold data/keys; their compromise is outside our
  control (no ZDR on Managed Agents — relevant later for Layer-2).
- **Owner dashboards use inline scripts** → their CSP permits `unsafe-inline`. They're auth-gated
  and currently 404 (SITE_LIVE off). Follow-up before public launch: externalize the scripts and
  drop `unsafe-inline` so every page gets the strict API-grade CSP.
- **DoS**: per-IP rate limiting helps, but a distributed flood is a platform-layer concern
  (Railway/Cloudflare-tier), not solved here.

**Net:** the realistic break-in paths are now (a) a leaked owner token or (b) a supply-chain
compromise — both narrowed and monitored, neither fully eliminable. That is as close to
"locked down" as an honest assessment allows.
