# Owner authentication (email + password) — DRAFT / for review

> **Status: DRAFT, not yet implemented.** Author: Kairos (back-end/server). Reviewers: Mathieu (owner) +
> Arke (front-end/app). This is the contract Arke's login screen builds against and Kairos implements once
> agreed. Owner directive 2026-06-25: per-owner hub instance + email/password owner login; the app is the
> single control surface. Nothing here ships to prod until reviewed — it's the spec, not the code.

## Model

**One owner per hub instance, and for now NO account creation at all** (owner directive 2026-06-25). The single
valid owner identity is a **fixed, env-configured `OWNER_EMAIL`** (Mathieu's, set in Railway env — kept out of
this public repo). There is **no signup/registration endpoint** and no way to create another account on this
instance. A second human runs **their own** hub instance with their own `OWNER_EMAIL`. The owner's password is
established **via an email flow to that inbox** (below) — "the password I set from my inbox" — binding account
control to the email address the owner controls.

The four agents (kairos/arke/nova/logos) are this owner's agents. Owner auth gates the owner-facing control
surface; member (seat) secrets are unchanged and unrelated — the app never holds one.

## Storage (new tables)

- `owners` — `{ id, email (unique, case-insensitive), password_hash, created_at, updated_at }`.
  Password hashed with **argon2id** (fallback bcrypt cost ≥ 12). **Never plaintext, never logged, never returned.**
- `owner_sessions` — `{ token_hash, owner_id, created_at, expires_at, last_seen_at }`.
  On login the server mints a **256-bit random** token (32 bytes, base64url), stores **only its sha256 hash**,
  and returns the raw token **once**. Lookups are by hash. Sessions are revocable (delete the row) and expire.

## Endpoints (all under `/api/auth`, HTTPS only)

- ~~`POST /api/auth/register`~~ — **REMOVED. No account creation.** The single owner row is seeded once from
  `OWNER_EMAIL` (with no password until set via the email flow below).
- `POST /api/auth/request-password` — Body `{ email }`. If `email` matches `OWNER_EMAIL`, the hub emails a
  **one-time, short-expiry (≈15 min) set-password token** to that address via the existing Resend mailer (the
  owner email is already wired — `src/mailer.ts`, `OWNER_REPORT_FROM`). **Always returns `200 { ok:true }`**
  regardless of the input (no enumeration — it only ever emails the one fixed address). This is the "set the
  password from my inbox" flow.
- `POST /api/auth/set-password` — Body `{ token, newPassword }`. Validates the emailed token (single-use,
  unexpired), sets/rotates the password (argon2id), invalidates other sessions, and logs in →
  `{ ok:true, owner:{ id, email }, token, expiresAt }`. `400 { error:"invalid_or_expired_token" }` otherwise.
  The console owner key (`x-admin-token`) is a **break-glass** alternative to set the password without email.
- `POST /api/auth/login` — Body `{ email, password }`. `200 { ok:true, owner:{ id, email }, token, expiresAt }`.
  On a bad email **or** bad password → `401 { error:"invalid_credentials" }` (identical either way — **no user
  enumeration**). Rate-limited with backoff/lockout after N failures.
- `POST /api/auth/logout` — `Authorization: Bearer <token>`. Deletes the session. `200 { ok:true }`. Idempotent.
- `GET  /api/auth/me` — `Authorization: Bearer <token>`. `200 { ok:true, owner:{ id, email }, expiresAt }` or
  `401`. The app calls this on launch to decide login-screen vs cockpit.
- `POST /api/auth/password` — Bearer (or admin). Body `{ currentPassword, newPassword }`. Rotates the password
  and (recommended) invalidates other sessions. `200 { ok:true }` / `401`.

## Integration with the existing `requireOwner`

`requireOwner` becomes **additive** — it accepts any ONE of three proofs, so nothing currently working breaks:
1. a valid **owner session token** (`Authorization: Bearer`) — the NEW primary path,
2. the existing **Google owner ID token** — kept through the transition,
3. the **console owner key** (`x-admin-token`) — break-glass + server-to-server (the scheduler, seeds).

Email/password becomes the primary human path; the other two remain for bootstrap and automation.

## App contract (Arke's login screen)

- On launch: read the stored token → `GET /api/auth/me` → 200 shows the cockpit, 401 shows login.
- Login: email + password → `POST /api/auth/login` → store the token in the **OS keychain / credential vault**
  (never plaintext on disk) → enter the cockpit.
- Every owner-gated hub call carries `Authorization: Bearer <token>`.
- Logout → `POST /api/auth/logout` → clear the stored token.
- The app holds **no member/seat secret** — owner scope only. The password is typed by the human and posted to
  `/api/auth/login` only; it is never stored, logged, or sent to an agent.

## Security rules (session hygiene)

Password + token are secrets: only the hash is stored; never in logs, chat, commits, or error bodies. Login
errors never reveal which field was wrong. Tokens are opaque random (not JWTs carrying PII). HTTPS only. Bearer
header (not a cookie) avoids CSRF. Rate-limit + lockout on login.

**No registration, single fixed owner.** There is no signup — the only account is `OWNER_EMAIL`. The password is
set/rotated only by someone who controls that inbox (the emailed one-time token) or who holds the console owner
key (break-glass). `request-password` returns `200` unconditionally and only ever emails the one fixed address,
so it leaks nothing and cannot be used to create or probe accounts. The emailed token is single-use, short-lived,
and stored only as a hash.

## Open questions for Arke + Mathieu

1. Token storage in the Electron app — OS keychain (recommended) vs encrypted file?
2. Session TTL + sliding refresh — proposed 30-day sliding, 90-day absolute max. OK?
3. Confirm the "set password from my inbox" flow: a one-time emailed token (≈15-min expiry) to `OWNER_EMAIL`,
   with the console key as break-glass. (Owner stated 2026-06-25: **NO account creation**; the only valid account
   is the single configured `OWNER_EMAIL`.)
4. Password-reset path (no email server today) — owner-key reset for now, email-based later?
5. Does the app need multiple saved hub profiles (for the future where one human owns more than one hub), or
   strictly one hub per install for now?
