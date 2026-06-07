# Bridge App — the standalone environment (owner's requirement, 2026-06-07)

Mathieu's words: "a standalone environment similar to Cowork (but better — less friction, more
capacity to do everything without blockage) that runs using the API key from this account. This
standalone will bridge perfectly with Cowork even from the other PC."

This is the first thing Arke builds on the 3080. Claude Code bootstraps it; the bridge app
replaces it.

## 1. Agent core (Cowork parity)

- Claude Agent SDK on `ANTHROPIC_API_KEY` (owner's Console account). Model per task tier
  (Opus for council/code-review, cheaper tiers for routine rituals).
- Sessions with full transcript persistence on local disk (nothing lost between runs).
- Tools: file read/write/edit anywhere on the machine, shell (native, no sandbox indirection),
  web fetch/search, MCP client support (so existing connectors still plug in).
- Projects + persistent memory: same model as today (memory dir + index), but owned by the app.
- Skills: load the same SKILL.md format — v1 prompts and existing skills carry over.

## 2. Better than Cowork (the friction list this app deletes)

- **Own scheduler, 24/7**: rituals run as a Windows service/daemon — no "app must be open",
  no missed 2:00 closes.
- **Owner-defined permission model**: scopes granted once in config (per agent, per tool, per
  path), not per-prompt approvals — no stalled overnight runs. Risky scopes (delete, spend,
  publish) explicitly listed in config; everything in an audit log Mathieu can read.
- **No machine lock-in**: any number of machines, one per agent, same API account.
- **No sandbox path translation**: one filesystem, real paths.
- **Data residency**: everything stays on the PC except what API calls and the consent gate
  explicitly send out (council v2 contract: consent is mechanical).

## 3. The bridge (perfect Cowork interop, across PCs)

The hub (architectscouncil.com) is the common ground both environments already reach. Add an
ENVIRONMENT CHANNEL to the hub, same auth canon as everything else:

- `POST /api/env/task` — one environment hands a task to another (Cowork-Mathieu → 3080-Arke:
  "review this", "run the test room", …). Queued like outbox notes, per-agent.
- `GET /api/env/tasks` + ack — the runtime polls (or long-polls) and executes.
- `POST /api/env/report` — completion reports flow back; Cowork sessions (and the owner panel)
  read them.
- Shared state already online: living backlog, daily handoffs, meeting transcripts. The bridge
  app keeps them current automatically (its scheduler replaces the v1 close ritual).
- Result: from THIS PC, a Cowork session (or Mathieu directly in /admin) can task the 3080 and
  read its results minutes later — same account, no concurrency conflict, because the runtime
  speaks API, not Cowork.

## 4. Owner surface

- Local UI (start simple: web panel served on localhost; Electron/Tauri later) with Google SSO
  (matpay@zen-solutions.net) for anything exposed beyond localhost.
- Always visible: agent status, running task, scheduler timetable, audit log, living backlog,
  council meeting room (v2 receiving-room view), consent manifest editor.

## 5. Constraints that remain (honesty clause)

The app removes Cowork's mechanical limits (sandbox, prompts, one-machine). It does not remove
the Anthropic API's usage policies, and the consent gate + Logos's guardrails + the owner's
permission config are deliberate self-imposed limits — blockage-free means no FRICTION, not no
RULES. The owner's rules are the rules.

## 6. Build order (on the 3080)

1. Agent core skeleton (Agent SDK, transcripts, memory import from TRANSFER).
2. Scheduler service + permission config (first rituals: handoff + backlog sync).
3. Hub environment channel (task queue endpoints + polling client).
4. Consent gate + secret scan (Logos's pattern) — gate every outbound payload.
5. Mock-agent test room (v2 contract §9), then the family reconnects.
