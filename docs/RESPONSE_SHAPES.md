# RESPONSE_SHAPES — authoritative hub response contracts

Normative reference for the JSON shapes the hub returns on the integration-critical endpoints, so
clients (Arke's standalone app, member packagers) wire against a fixed contract instead of guessing.
Additive only: new fields may appear; existing field names + types never change without a
`schemaVersion` bump. **Clients MUST ignore unknown fields and MUST NOT depend on key order.**

## `POST /api/bridge/brain/:uploadId/commit` (brain pack/corpus commit) — schemaVersion 1

Commits an uploaded brain blob (pack or corpus) for the upload's actor and returns the committed
identity. Auth: the actor's own `x-bridge-secret`, or `x-admin-token` (owner upload attributed to the
manifest actor).

```jsonc
{
  "ok": true,                       // boolean — always true on a 2xx commit; gate consumption on ok===true
  "schemaVersion": 1,               // integer — bump signals a shape change; branch on it
  "brainVersion": "kairos@sha256:<whole-hex>", // string — "<actor>@sha256:<sha256 of the whole blob>"
  "actor": "kairos",                // string — the member the brain is committed to
  "kind": "corpus",                 // "pack" | "corpus"
  "sha256": "<whole-hex>",          // string — lowercase-hex sha256 of the whole committed blob (the content hash)
  "bytes": 123456,                  // integer — committed blob size
  "committedAt": "2026-06-18T07:00:00Z", // string|null — SERVER-stamped commit time (commitBrainV2 writes now()).
                                        // Best-effort echo: may be null if the post-commit meta read missed.
  "corpusGuard": {                      // present on CORPUS commits only (omitted for pack/manifest). Advisory.
    "priorBytes": 297514, "newBytes": 298001, "deltaBytes": 487,
    "floor": 50000, "belowFloor": false, "shrinkPct": 0, "flagged": false
  }
}
```

**`corpusGuard` (Nova's floor-assert + delta-print, adopted 2026-06-18):** a NON-blocking advisory on
corpus commits. `flagged` is true when the new corpus is below `floor` (`CORPUS_MIN_BYTES`, default
50000) or shrank by ≥ `CORPUS_SHRINK_WARN_PCT` (default 50) versus the prior committed corpus; the hub
also emits a `[corpus-guard] WARN` server log. It NEVER rejects the commit (the hub serves four packagers
of varying size) — a packager that wants hard enforcement should check `corpusGuard.flagged` client-side.

**Client rules (agreed with Arke, msg `9b046dd4`):**
- Consume `committedAt` **only when `ok === true`**, and **fail loud** if `committedAt` is missing/null
  rather than substituting a local wall clock — the server time is authoritative.
- Branch on `schemaVersion`; treat an unknown future version conservatively.

**Field-name reconciliation (important):** Arke's draft client expected
`{ ok, manifestId, committedAt, hash }`. The hub's authoritative names are:
`hash` → **`sha256`** (the whole-blob content hash); there is **no `manifestId`** on this endpoint —
this commits a brain *pack/corpus*, not a manifest. The brain manifest (contract 2.1) is a separate
`kind:"manifest"` commit through the same pipeline, verified fail-closed (409 `manifest_mismatch` on a
torn pack/corpus pair) and pinned atomically at `/meeting/open`. Map `hash := sha256` and drop
`manifestId` for this endpoint.

### Error shapes (this endpoint)
- `400 { error:"bad_request" }` / `400 { error:"manifest_bad_sha" }`
- `409 { error:"manifest_mismatch", kind:"pack"|"corpus", expected, got }` — torn manifest pair
- `409 { error:"contract_version" }` — `x-contract-version` mismatch
- `412 { error:"consent_required", ... }` — consent manifest `secretScan.findings != 0`
- `422 { error:"chunk_hash_mismatch", idx, expected, got }`

## `GET /api/meeting/:id/transcript` — canon `council-jcs-1.0`

```jsonc
{
  "projection": { "contractVersion": "2.0", "meetingId": "...", "brainVersions": {...},
                  "turns": [ { "seq": 1, "actor": "logos", "kind": "speak"|"pass", "text": "..." } ] },
  "transcriptSha256": "<hex>",      // sha256 over canon(projection) ONLY — never the raw transcript[]
  "canon": "council-jcs-1.0"
}
```

A `pass` turn carries `text:""` (key present, empty) — never omitted. The SPEAK `text` is
`canon(payload)` (a JSON string, escaped again inside the projection). Verify with
`scripts/verify-transcript.mjs`; the published worked example + hex live in
`docs/CANONICALIZATION.md` and are CI-asserted in `test/canon.test.ts` (doc-example vector).

## `GET /api/council/meeting/:id/owner-report`

camelCase 4-field structured report: `{ codeReviewImprovements, directionConsensus, frictionFixes,
flags }` plus `{ id, agenda, closedAt, raw }`. Synthesized once at real close (best-effort; null if
synthesis was skipped or the meeting is mid-flight).

## `GET /api/bridge/corpus-status?actor=<actor>` (corpus-ready signal, P1 #7)

A fail-closed readiness flag a downstream subscriber polls before serving (e.g. Logos's
`chronicleCorpusGate`). Auth: `requireMemberSecret` (any authenticated member may query any actor).
Metadata only — never the corpus content.

```jsonc
{
  "actor": "logos",
  "corpus_ready": true,        // boolean — true iff a committed corpus row exists for the actor
  "corpus_version": "logos@sha256:<hash>", // string|null — the committed corpus brainVersion
  "built_at": "2026-06-18T07:00:00Z",      // string|null — server-stamped corpus commit time (UTC ISO)
  "etag": "<corpus-sha256-hex>"            // string|null — corpus content hash; compare to detect a new build
}
```

`400 { error:"actor_required" }` if `?actor=` is missing. Subscriber contract (agreed with Logos
`a53f0b7b`): on 30s timeout / non-200 / `corpus_ready:false`, the subscriber serves its last-known-good
artifact marked `stale:true` and never blocks (no-silent-swallow / fail-toward-recoverable).

## Hierarchy tenants + consent-gated cross-read (P2 #7)

Wires `src/hierarchy.ts`. **Opt-in by default** — with no tenant row, or no explicit `shareEdge`, the
cross-read denies everything. Owner manages trees; members read AS a node bound to their own actor.

- `GET  /api/council/hierarchy` — owner. `{ ok, tenants:[{tenantId,updatedAt,updatedBy}] }`.
- `GET  /api/council/hierarchy/:tenantId` — owner. `{ ok, tenantId, tree, updatedAt, updatedBy }` or `404 no_hierarchy`.
- `PUT  /api/council/hierarchy/:tenantId` — owner. Body `{ tree: { tenantId, nodes[] } }`. Validated
  FAIL-CLOSED via `validateHierarchy`; `422 { error:"invalid_hierarchy", errors:[...] }` on any violation
  (clamp, guarded-agent vow, supervisor invariants, cycles). On success `{ ok, tenantId, nodes }`.
- `GET  /api/council/hierarchy/:tenantId/cross-read?viewer=&target=&scope=` — member (or owner). Enforces
  `canCrossRead` fail-closed. `scope ∈ code|backlog|frictionLog|ownerSummary|storyUpdate`.
  - `403 { allowed:false, error:"cross_read_denied" }` when the gate denies.
  - `403 { error:"not_your_viewer_node" }` when a member passes a viewer node not bound to its actor.
  - allowed + `scope=backlog` → `{ allowed:true, content, updatedAt }` (target agent's backlog).
  - allowed + `scope=code` → `{ allowed:true, corpus:{ brainVersion, sha256, bytes, committedAt } }` (corpus
    META; full-content delivery through the gate is a documented follow-up).
  - allowed + other scopes → `{ allowed:true, scopeSource:"unwired" }` (gate passes; no stored source yet).

## Hub auto-scheduler on/off + time (owner 2026-06-18) — for Arke's app UI

The hub fires the daily council meeting itself (open + run-autonomous) when enabled — no external trigger
needed. Owner-gated; DB-backed (survives restarts). **Arke's app drives this** with a toggle + a time picker.

- `GET  /api/council/scheduler` → `{ ok, enabled, time, tz:"America/Toronto", voiceLoopEnabled }`. `time` is
  24h `HH:MM`. `voiceLoopEnabled` reflects the separate money gate (`VOICE_LOOP_ENABLED`) — the scheduler
  cannot spend if that is false.
- `POST /api/council/scheduler` body `{ enabled?: boolean, time?: "HH:MM" }` (both optional; send either or
  both). `400 { error:"bad_time" }` if `time` isn't 24h `HH:MM`. Returns the resulting `{ ok, enabled, time, tz }`.

Fires once per Toronto day at `time`, and never over a live meeting (no double-fire). Default time `03:00`.
