# Tooling / connector audit — Kairos (hub back-end) — 2026-07-01 (COMPREHENSIVE)

Owner directive (via Nova, 2026-07-01): enumerate EVERYTHING Claude/Cowork offers (MCP registry +
installed plugins) and honestly map it against the whole hub project since start; find tools that were
available but unused. This is the full sweep (the first pass only covered infra tools — it was not
exhaustive; corrected here).

Scope: Kairos owns the **back-end/server** (Node/TS + Express, Railway, Postgres, the council
meeting/brain/scheduler system). Front-end/design/UX surfaces belong to **Arke** per the MAMS split.

## A. USED / CORE (already in the workflow)
- **Desktop Commander** — all Windows shell/git/file ops. Core.
- **scheduled-tasks** — morning prep + nightly ritual.
- **GitHub CLI (`gh`)** + **Railway CLI** — adopted 2026-07-01 (were browser + `ci-status.mjs`).
- Read/Write/Edit + workspace bash.

## B. AVAILABLE + RELEVANT + UNUSED — actionable on the back-end NOW (the real finds I missed)
1. **`engineering` plugin skill suite** — code-review, testing-strategy, tech-debt, deploy-checklist,
   incident-response, system-design, architecture, documentation, standup. **Never applied to the hub.**
   These are direct quality levers: a structured `code-review` / `tech-debt` / `testing-strategy` pass on
   `src/council.ts` (1900+ lines) would raise quality more than any visual change. TOP unused lever.
2. **`security-review` command** — the hub has only had ad-hoc manual security passes; a structured review
   is directly relevant (public repo, auth surface, vault). Unused.
3. **`data` plugin** — sql-queries, analyze, build-dashboard, create-viz, statistical-analysis. The hub
   emits rich operational data (`cost_ledger`, `scheduler_runs`, meeting turns/cost, `brains` freshness).
   None of it is analyzed/trended. Could produce a real cost-per-meeting trend + scheduler reliability
   report. Unused.
4. **Cowork live artifacts (`create_artifact`)** — a persistent hub-ops dashboard for Mathieu (deploy_sha
   vs HEAD, latest meeting, cost, brains freshness) that refreshes each open. Genuinely useful to the
   owner; never built. Unused. (Caveat: most hub reads are admin-gated, so an artifact needs a public or
   owner-gated read path — pairs with wanting a read endpoint.)
5. **`visualize` / show_widget** — inline ops diagrams (scheduler flow, readiness gate, meeting lifecycle)
   for reports and the meeting. Unused.
6. **Cloudflare MCP** — used TODAY for the edge plan; d1/kv/r2/workers otherwise unused (not needed while
   the hub lives on Railway).
7. **Swagger/OpenAPI MCP** — machine-checked API contract over the hand-maintained RESPONSE_SHAPES.
   Unused; candidate for contract quality.
8. **`mcp-builder` skill** — could wrap the hub API as an MCP so agents/owner call it as first-class tools
   instead of raw HTTP. Interesting, unused.
9. **`qodo-skills`** (get-rules, pr-resolver) — coding-rule enforcement + PR review; needs Qodo config.
10. **Prisma (Prisma-Local, connected)** — ORM type-safety over the current raw `pg` queries; real but a
    large refactor, low near-term ROI. Available, unused.

## C. AVAILABLE but AUTH-GATED — need owner action to unlock
- **Datadog** (`engineering:datadog`) — APM/error monitoring. Hub has ZERO external error monitoring
  (only a homegrown `unhandledRejection` counter). Biggest observability gap.
- **Sentry** — not currently enabled for me; recommend adding via the registry, then wiring hub errors.
- **PagerDuty** (`engineering:pagerduty`) — alert on hub-down / missed_meeting. Marginal but relevant.
- **GitHub MCP** (`engineering:github`) — API-level GH ops; I use `gh` CLI instead, so low need.
- **Slack** (`slack-by-salesforce`) — owner notifications; hub already emails owner reports (Resend) and
  uses its own env-task queue, so low need.

## D. NOT APPLICABLE to the Kairos back-end (other verticals / Arke's domain) — listed for honesty
- **Design/UX (Arke's side per MAMS):** figma, adobe-for-creativity, canva, miro, `design` plugin,
  brand-guidelines, theme-factory, canvas-design, algorithmic-art, web-artifacts-builder. Real for the
  owner dashboard, but that surface is Arke's to remake, not Kairos's.
- **Finance/markets/CRM:** carta-crm/cap-table/investors, daloopa, bigdata-com, lseg, sp-global, finance,
  zoominfo, apollo, common-room, vpai. Wrong vertical.
- **Marketing/SEO/growth:** marketing, searchfit-seo, adspirer, postiz, brand-voice, nimble, brightdata.
- **Bio/science:** bio-research (benchling/biorxiv/pubmed/chembl/etc.). Wrong vertical.
- **Legal/compliance/CMS/ops:** legal, box, vanta (SOC2 — could matter if we ever certify), sanity,
  cloudinary, fluent (ServiceNow), intercom, customer-support, human-resources, operations,
  product-management, zoom, twilio (could SMS the owner — marginal), airtable, atlan, enterprise-search.
- **Document output:** docx/pptx/xlsx/pdf — marginal (could format owner reports as files; email already
  covers it).

## E. NOT INSTALLED but CONNECTABLE from the MCP registry (searched outside, 2026-07-01)
Directly fills the hub's real gaps — owner connects via claude.ai connector settings:
- **Sentry MCP** (`mcp.sentry.dev`) — search/query/debug prod errors. **Fills the #1 observability gap**
  (hub has no external error monitoring). Recommend connecting, then wiring the hub's error paths to a
  Sentry DSN. Top registry recommendation.
- **Honeycomb** / **Monte Carlo** — observability / SLOs / data-quality, if we want tracing beyond errors.
- **incident.io** / **PagerDuty** (hosted) — incident + on-call if hub reliability is escalated.
- **Datadog** (registry + the installed auth-gated plugin) — full APM alternative to Sentry.
- **DB/deploy:** NO dedicated Railway MCP and NO generic Postgres MCP exist (PlanetScale/Supabase are
  their own managed DBs; ClickHouse/MotherDuck are analytics DBs). So for the hub's Railway Postgres the
  **Railway CLI + the hub's own admin endpoints remain the best available path** — confirmed by searching,
  not assumed.

## Corrected conclusion
The first pass under-counted. Beyond observability (C) and API-contract (Swagger), the genuinely-missed,
usable-NOW back-end levers are the **`engineering` skill suite** (code-review / tech-debt / testing-
strategy / security-review on `src/`), the **`data` skill suite** (analytics over the hub's own
operational tables), and **Cowork artifacts + visualize** (a live ops view for Mathieu). These are the
back-end analogue of the design-first remake Nova described. Recommended first actions (all solo except
where noted): run a `tech-debt` + `security-review` pass on `src/council.ts`; wire one observability
monitor (owner-gated); build a live hub-ops artifact once a public/owner read exists.
