# Tooling / connector audit — Kairos (hub back-end) — 2026-07-01

Owner directive (via Nova, 2026-07-01): enumerate what Claude/Cowork offers (MCP registry +
installed plugins) and honestly map it against everything built on the hub since project start.
Find tools that were available but unused. Scope note: Kairos owns the **back-end/server** (Node/TS +
Express, Railway, Postgres, the council meeting/brain/scheduler system). Visual/design/UX surfaces
(the owner dashboard, any customer-facing UI) belong to **Arke** per the MAMS front-end/back-end split,
so design tools (Figma/Canva/Adobe Firefly) are noted as *not Kairos's lever* rather than "unused by me."

## Adopted THIS session (were being skipped)
- **GitHub CLI (`gh`)** — was using browser + homegrown `ci-status.mjs` polling. Now: `gh run list`,
  `gh run view <id> --log-failed`. Immediately paid off: caught that the 06:00 morning-prep commit
  broke CI (secret-scan false-positive) — fixed forward (`c477378`).
- **Railway CLI (`railway` 5.23.3)** — replaces browser-driven Railway deploy checks. On PATH;
  needs `railway link` once per repo dir (one-time, best done with owner or a project id) before
  `railway logs/status/variables` work.

## Available/connected but UNUSED on the hub (genuine gaps)
1. **Cloudflare MCP** (d1 / kv / r2 / workers / `search_cloudflare_documentation`) — connected, never
   used. Directly relevant to the long-standing held item "Cloudflare edge-protection go-ahead": I can
   at least draft the WAF/edge plan from the docs tool now. **Action: use it to prepare the edge plan;
   still owner-gated to execute (registrar + account).**
2. **Swagger/OpenAPI MCP** (`swagger_create_api_from_prompt`, `standardize_api`, `create_portal`) —
   the hub is a large HTTP API whose contract is hand-maintained in `docs/RESPONSE_SHAPES.md`. An
   OpenAPI spec + standardization scan would raise contract quality and catch drift. **Candidate:
   generate an OpenAPI spec from the routes as a quality/observability improvement (non-urgent).**
3. **`visualize` / show_widget** — could render deploy/meeting/cost dashboards inline for the owner
   without hand-built HTML. Minor.

## Available but AUTH-GATED (recommend wiring, owner action)
- **Datadog** (`plugin:engineering:datadog`) — needs auth. The hub currently has **zero external error
  monitoring**; prod error signal is a homegrown `unhandledRejection` storm-counter → `process.exit(1)`.
  This is the single biggest observability gap. **Recommend: wire one error/APM monitor to prod.**
- **Sentry** — Nova flagged Sentry was connected on her side and never wired to prod. No Sentry
  connector is currently enabled for Kairos; recommend enabling one via the connector registry, then
  wiring the hub's error paths to it. (Same category as Datadog — pick one.)

## Not Kairos's lever (Arke/Nova front-end domain, per MAMS split)
- **Figma, Canva, Adobe Firefly/Express** — design/UX quality tools for customer-facing surfaces.
  The hub's only UI (owner dashboard `backlog.html`) is Arke's to remake design-system-first. Flagged
  here for completeness; not a Kairos back-end quality lever.

## Honest conclusion
Kairos's quality levers are **observability** (wire Sentry or Datadog — currently unmonitored in prod)
and **API-contract quality** (OpenAPI/Swagger over the hand-maintained RESPONSE_SHAPES). The design/UX
"weak spot" Nova named is real but sits on Arke's side of the split. Nothing to "remake design-first"
on the back-end; instead the back-end remake analogue is **add real prod observability** (owner-gated:
needs a Sentry/Datadog account) and **generate a machine-checked API spec** (autonomous, non-urgent).
