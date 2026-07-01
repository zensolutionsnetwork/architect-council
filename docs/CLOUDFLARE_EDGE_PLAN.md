# Cloudflare edge-protection plan — architectscouncil.com — DECISION-READY (owner go-ahead required)

Long-held item ("Cloudflare edge-protection go-ahead"). This is the shield-first-then-lock plan so
Mathieu can approve/reject with the risks explicit. Grounded on current Cloudflare docs (WAF managed
rules, rate-limiting) via the Cloudflare docs MCP, 2026-07-01.

## Why held (the two real risks)
1. **Lockout** — a wrong Railway->Cloudflare DNS/nameserver cutover can 404 the whole site or break the
   Railway origin cert. Sequencing must verify records BEFORE any nameserver switch.
2. **Blocking a sibling** — our agents (kairos/arke/nova/logos) are programmatic clients that poll
   `/api/env/*`. An over-aggressive WAF/Bot-Fight/rate rule would silently 403 a sibling. Every rule
   ships in LOG mode first, then BLOCK only after confirming zero sibling false-positives.

## Prereqs (owner-held — the go-ahead)
- Registrar access for the domain + a Cloudflare account. Managed WAF ruleset needs **Pro plan or above**
  (Free supports only custom rules). Owner picks the tier.

## Safe order (shield first, lock last)
1. **Add zone, DNS-only.** Add the domain to Cloudflare, import all records, keep the app hostname
   **grey-cloud (DNS-only)**. Verify resolution end-to-end. No proxy yet = no lockout risk.
2. **Nameserver cutover** only after step 1 records are confirmed identical. Site still serves (DNS-only).
3. **Proxy on (orange cloud)** for the app hostname. Set Cloudflare **SSL/TLS mode = Full (strict)** so
   the edge validates Railway's origin cert (Railway serves a valid cert). Wrong mode = 525/526; verify
   `/api/health` through the edge before proceeding.
4. **WAF managed ruleset in LOG mode** (Security > WAF > Managed rules). Watch our own paths — the
   env-task queue (`/api/env/*`), bridge brain upload (`/api/bridge/*`), member/owner auth — for false
   positives. Flip to **Block** only after a clean observation window.
5. **Rate limiting** (Security > WAF > Rate limiting rules):
   - Owner-auth brute-force guard on `POST /api/auth/*` (the "Protect your login" pattern: block a client
     for 15 min after >5 POST/5 min). Low risk — humans only hit this.
   - A GENEROUS limit on `/api/env/*` — thresholds set WELL ABOVE the siblings' combined poll rate, or
     bypass by a known-agent condition, so normal council polling is never throttled.
6. **Bot Fight Mode: keep OFF on API paths.** Our siblings are legitimate bots. If enabled at all, scope
   it to HTML routes only, with an explicit allow rule for `/api/*`.
7. **Lock (last):** block origin-bypass by having Cloudflare inject a secret header that the hub verifies
   (reject requests to `/api/*` that arrive without it), so attackers can't hit the Railway origin
   directly. This is a HUB code change Kairos ships (defensive; the header value is an OUR-infra secret,
   never logged) — only after steps 1-6 are validated.

## Split of work
- **Owner (the go-ahead):** registrar + Cloudflare account + plan tier; the nameserver cutover; the
  dashboard toggles (proxy, SSL mode, enabling managed ruleset).
- **Kairos (ready to build once green-lit):** the exact WAF custom rules + rate-limit thresholds tuned to
  sibling poll rates; the origin secret-header verification on the hub (`/api/*` default-deny without the
  edge header), behind the four gates + CI, deploy-verified. Coordinated with Arke so his cockpit + his
  own polling carry the edge header.

## Recommendation
Proceed, but strictly shield-first (steps 1-6 all LOG-before-BLOCK) before any lock (step 7). Do NOT do
the nameserver cutover and rule-enabling in one sitting; validate each step against `/api/health` and
sibling inbox polling before the next.
