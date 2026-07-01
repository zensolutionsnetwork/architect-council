# Best-Available-Method (BAM) protocol — Kairos

Owner directive 2026-07-01: always use the most efficient/best available way to do something, and
verify/research whether a better way exists EVERY time I do something new. "It works" is not the bar;
"it's the best available way" is. This is the concrete, enforceable system behind the one-line
STANDING EFFICIENCY SELF-CHECK in CLAUDE.md.

## When the check fires
- **New task type** — a kind of task I have NOT done this way before, OR
- **Stale-decision task** — a recurring op whose recorded method is old enough that a better tool may
  now exist (default revisit: ~monthly, or immediately if the task failed/felt slow).
Trivial repeats with a fresh recorded decision SKIP the check and go straight to the recorded method
(the check must not become its own inefficiency).

## The check (target < 1 minute)
1. **NAME** the method I am about to use.
2. **ASK: is this the best available way right now?** Look, in order, until answered:
   a. **Installed skills/plugins** — is there a purpose-built skill (e.g. `security-review`, `data`,
      `engineering:*`) instead of hand-rolling?
   b. **Tools already on the box** — `gh`, `railway`, Desktop Commander, existing helper scripts.
   c. **MCP registry** — `search_mcp_registry` for a connectable tool that fits.
   d. **Web search** — only if a–c are inconclusive and the task warrants it.
3. **DECIDE** — if a better AVAILABLE tool exists, use it. If it needs connecting, surface it
   (`suggest_connectors`) and note it as owner-gated; fall back to the best currently-usable method.
4. **RECORD** the decision in the ledger below so the same choice is never re-researched from scratch.
5. **Bounded** — do not over-research; a good-enough recorded method beats an endless search.

## Standing cadence (also in CLAUDE.md)
- **Every session:** re-check the recurring ops (CI check, deploy verify, inbox, brain re-pack, debrief).
- **~Quarterly:** full connector/plugin + MCP-registry audit (template: `docs/TOOLING_AUDIT_*.md`).

## Anti-patterns this protocol exists to kill
- "It works, so I'll keep doing it the old way" (the browser-Railway / `ci-status.mjs` habit).
- Hand-rolling when a purpose-built skill/tool exists.
- Asserting "no tool exists" WITHOUT searching the registry (verify, don't assume).
- Building something the code already does (verify-the-premise before building — #50/#51 were partly
  already done).

## Decision ledger (append; revisit dates are soft)
| Task | Best available method (decided 2026-07-01) | Revisit if |
|------|--------------------------------------------|------------|
| CI status / failed logs | `gh run list` / `gh run view <id> --log-failed` (NOT browser, NOT ci-status.mjs) | gh removed / a richer CI MCP appears |
| Deploy verify | `/api/health.deploy_sha == git HEAD` + `railway` CLI (NOT browser Railway) | a Railway MCP appears |
| Council CLI free-text args | PowerShell `.ps1` via `-File`; commits via `git commit -F msgfile` (never `-Command` with `$`, never `-m` with quotes) | shell changes |
| Prod error monitoring | NONE wired — homegrown unhandledRejection counter only | connect Sentry (registry) or Datadog → then wire hub error paths |
| Hub Postgres / deploy inspection | Railway CLI + hub admin endpoints (verified: no Railway/generic-Postgres MCP exists) | a Railway/Postgres MCP appears |
| Code quality pass on src/ | `security-review` + `engineering:*` skills (NOT ad-hoc reading) | better review skill appears |
| Hub operational analytics | `data` skill suite over cost_ledger / scheduler_runs / meetings | — |
| API contract | hand-maintained RESPONSE_SHAPES.md; candidate: Swagger/OpenAPI MCP | if drift recurs |
