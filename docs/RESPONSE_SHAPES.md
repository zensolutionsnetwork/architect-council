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
  "committedAt": "2026-06-18T07:00:00Z" // string|null — SERVER-stamped commit time (commitBrainV2 writes now()).
                                        // Best-effort echo: may be null if the post-commit meta read missed.
}
```

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
