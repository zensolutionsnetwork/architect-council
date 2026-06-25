# Security Review & Hardening — architect-council hub (2026-06-25, Kairos)

Follows up `SECURITY_REVIEW_2026-06-10.md`. **Honest framing unchanged:** no internet-facing system is
unhackable; this review shrinks the new attack surface and contains blast radius. Scope: the same hub
(`architectscouncil.com`, Express/TS on Railway) + the public repo, focused on what changed since 2026-06-10.

## What changed since the last review (the new surface)
The big addition is the **owner email/password auth** (`/api/auth/*`, owner directive 2026-06-25): the first
**unauthenticated, credential-handling** endpoints on the hub. Everything from the 2026-06-10 review still holds
(parameterized SQL, timing-safe compares, fail-closed owner gate, vault AES-256-GCM, strict headers/CSP, opaque
errors, secret-scan / CodeQL / Dependabot, tiny dependency surface). This pass hardens the new endpoints.

## Verified-strong on the new auth (by design)
- Passwords stored only as **scrypt** hashes (salted, Node built-in — no native dep); never plaintext, never
  logged, never returned.
- Session + emailed set-password tokens are **opaque random**; only their **sha256 hash** is stored.
- The set-password token is **single-use** (atomic `used_at` consume) and **short-lived** (15 min).
- `login` is **non-enumerating** — identical `401 invalid_credentials` for a bad email or a bad password.
- `request-password` **always 200s** and only ever emails the one fixed `OWNER_EMAIL` — it reveals nothing and
  cannot create or probe accounts (there is no signup).
- `requireOwner` stays **fail-closed** and is extended **additively** (console key OR Google OR owner session).

## Hardened this pass (deployed, CI-green)
1. **Brute-force / inbox-flood throttle (was missing).** A stricter per-IP limiter (20 / 15 min) now sits in
   front of the three sensitive unauthenticated endpoints — `/api/auth/login` (password guessing),
   `/api/auth/request-password` (emailing the owner inbox), `/api/auth/set-password` (token guessing). `/auth/me`
   and `/auth/logout` are authenticated and stay on the global limiter. Fail-open (a limiter bug can't down the hub).
2. **Login timing equalization.** `login` now performs **exactly one scrypt verify on every attempt** — against
   a cached dummy hash when the email/owner/password doesn't line up — so response latency can't be used as an
   oracle to learn whether a submitted email is the owner's.
3. **Session absolute max age.** A session is valid only within **90 days of creation**, independent of the
   30-day sliding refresh, so a stolen session token can't be kept alive indefinitely by refreshing it.

## Dead-code / surface reduction (same session)
- Removed the retired `DAILY_HANDOFF.md` pointer (superseded by `CLAUDE.md`). `COUNCIL_V2_LIVE` already has zero
  code references (v1 fully removed earlier). Quarantined the June-7 genesis scaffolding off the working tree.

## Residual risk (the honest part)
- **Owner credential compromise = full owner access.** Now there are three owner paths (console token, Google,
  email/password) — each is a master-equivalent key. The password is only as strong as the owner chooses + the
  inbox that resets it; the console token remains the highest-impact secret (rotation + out-of-band handling).
- **Inbox control = password reset.** "Set from my inbox" binds account recovery to the `OWNER_EMAIL` mailbox;
  if that mailbox is compromised, the hub owner login can be reset. (True of essentially all email-based reset.)
- **Single-instance throttle.** The auth limiter is in-memory per instance and resets on redeploy; a determined
  distributed brute-force is a platform-tier concern (Railway/CDN), not fully solved here. scrypt makes each
  guess expensive regardless.
- Supply-chain + platform-trust + DoS caveats from the 2026-06-10 review still apply, unchanged.

## Still needs Mathieu (carried from 2026-06-10, platform-only)
Rotate `COUNCIL_ADMIN_TOKEN`; confirm Railway Postgres backup schedule; confirm 2FA on the GitHub org + Railway;
member-secret rotation for Nova/Logos. None are code; all are owner console actions.

**Net:** the new credential surface is now throttled, timing-equalized, and session-capped. The realistic
break-in paths remain (a) a leaked owner credential/token or (b) a supply-chain compromise — narrowed and
monitored, neither fully eliminable.
