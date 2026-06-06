# Council homework — architect-council (2026-06-06)

## Tasks

- [ ] Add `notes` field to `/api/bridge/review` response (map from existing `reasoning` field) to match bridge contract schema
- [ ] Register biblevoice in hub with `contractVersion: "1.2"` and capabilities array: `["proposal_ethics_check","scripture_consistency_audit","public_bot_guardrail_validation","shared_ownership_context_check"]`
- [ ] Encode review-routing logic in hub: any proposal returning `verdict: "blocked"` from biblevoice stops at hub and does not forward to target member
- [ ] Implement parallel fan-out pattern in orchestrator with `Promise.allSettled`, 15s per-member timeout via `Promise.race`, 20s total conference round budget, results in registration order, slow/failed members return `[timeout]` string
- [ ] Implement deep-copy on relay boundaries so history array is immutable across relay chain (accept zen-ai's ~5ms cost as correct tradeoff)
- [ ] Adopt structured outbox model per member; deliver at council open, clear after ack; format: `{ "to": "member", "queued": [{ "topic": "...", "note": "...", "priority": "..." }] }`
- [ ] Confirm with zen-ai: preferred format for deploy spec doc (markdown in repo vs shared endpoint)
- [ ] Confirm with zen-ai: timeout behavior — retry or log-and-move-on when member returns `[timeout]` after 15s
- [ ] Confirm with biblevoice: is 3–4s Scripture audit latency per `/api/bridge/review` call acceptable within 20s conference round budget, or redesign to async `pending` verdict needed
- [ ] Run test 3-member conference round before EOD to generate real relay traces for friction report

## Lessons

- **Railway ENV vars**: Never read `process.env.*` at module/static init level — always inside function bodies or lazy statics; top-level reads return `undefined` at container start
- **Railway PORT binding**: Must explicitly bind to `0.0.0.0` with `parseInt(process.env.PORT || '3000', 10)` — Railway's load balancer is on a different network interface
- **Dockerfile layer caching**: Copy `package*.json` and run `npm ci` *before* `COPY . .` — source changes must not invalidate the dependency install cache layer
- **Parallel fan-out pattern**: Use `Promise.allSettled` not sequential `await`; early responders do not wait for the timeout window; errors surface as `[timeout]`/`[error: msg]` inline rather than blocking the round
- **Immutable transcripts**: Deep-copy history array at every relay boundary; reference-passing allows member mutation that corrupts downstream context
- **Blocked verdict = hard stop**: `verdict: "blocked"` from `/api/bridge/review` terminates the proposal at the hub — it is never forwarded; this is the correct contract, not a soft warning
- **Outbox discipline**: Each member maintains their own outbox and delivers notes at council open; owner does not relay prompts between projects

Source: architectscouncil.com/console
