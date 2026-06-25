# Owner authentication (email + password) — DRAFT / for review

> **Status: DRAFT, not yet implemented.** Author: Kairos (back-end/server). Reviewers: Mathieu (owner) +
> Arke (front-end/app). This is the contract Arke's login screen builds against and Kairos implements once
> agreed. Owner directive 2026-06-25: per-owner hub instance + email/password owner login; the app is the
> single control surface. Nothing here ships to prod until reviewed — it's the spec, not the code.

## Model

**One owner per hub instance.** This hub belongs to a single human owner (Mathieu, on his instance). A second
human runs **their own** hub instance with their own owner account — there is no multi-owner table on one hub.
So "register" is a **one-time instance claim**, not open signup.

The four agents (kairos/arke/nova/logos) are this owner's agents. Owner auth gates the owner-facing control
surface; member (seat) secrets are unchanged and unrelated — the app never holds one.

## Storage (new tables)

- `owners` — `{ id, email (unique, case-insensitive), password_hash, created_at, updated_at }`.
  Password hashed with **argon2id** (fallback bcrypt cost ≥ 12). **Never plaintext, never logged, never returned.**
- `owner_sessions` — `{ token_hash, owner_id, created_at, expires_at, last_seen_at }`.
  On login the server mints a **256-bit random** token (32 bytes, base64url), stores **only its sha256 hash**,
  and returns the raw token **once**. Lookups are by hash. Sessions are revocable (delete the row) and expire.

## Endpoints (all under `/api/auth`, HTTPS only)

- `POST /api/auth/register` — **claim the instance.** Body `{ email, password }`. **Gated** (see Security): the
  human who deployed the hub claims it with the console owner key (`x-admin-token`). `409 { error:"owner_exists" }`
  if already claimed. Password policy: min length ≥ 12, reject trivial/breached. On success auto-logs-in →
  `{ ok:true, owner:{ id, email }, token, expiresAt }`.
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

**Registration must be gated.** If register were open "when no owner exists," a stranger could claim a freshly
deployed public hub first. So `register` requires the **console owner key** (`x-admin-token`) — the human who
deployed the hub already has it and claims the account once. (Alternative: localhost-only first-run claim.)

## Open questions for Arke + Mathieu

1. Token storage in the Electron app — OS keychain (recommended) vs encrypted file?
2. Session TTL + sliding refresh — proposed 30-day sliding, 90-day absolute max. OK?
3. Registration bootstrap — console-key claim (recommended) vs localhost-only first-run?
4. Password-reset path (no email server today) — owner-key reset for now, email-based later?
5. Does the app need multiple saved hub profiles (for the future where one human owns more than one hub), or
   strictly one hub per install for now?
