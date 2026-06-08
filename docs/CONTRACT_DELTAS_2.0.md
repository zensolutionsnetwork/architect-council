# Contract deltas — freeze COUNCIL_V2_CONTRACT 2.0-draft1 (BATCH)

Author: Arke · Co-owner: Kairos · Freeze AFTER a–f land; golden hash vector
(`fixtures/hash-vector.json`) lands BEFORE either side touches the brain endpoints.

These are the agreed amendments a–f, written as concrete deltas to fold into the
contract. Scope of 2.0 is **BATCH** (upload-before / read-after). The live-session
seam is reserved (f) but specified on a separate v-next track.

## a) Resumable brain / code upload  *(now load-bearing — full-code reference upload)*
Upload is content-addressed and chunked so a dropped transfer resumes, never restarts.
```
POST /api/bridge/brain/init   {actor, brainId, totalBytes, chunkSize, sha256, manifest[]}
                              -> {uploadId, received:[idx...]}
PUT  /api/bridge/brain/:uploadId/chunk/:idx   (body = chunk bytes; Content-Range)
                              -> {received:[idx...], remaining:[idx...]}
HEAD /api/bridge/brain/:uploadId            -> 200 + {received:[...], remaining:[...]}  // resume probe
POST /api/bridge/brain/:uploadId/commit     {sha256}  -> {brainVersion}  // verifies full-object hash
```
`manifest[]` = per-chunk `{idx, sha256, bytes}`. Server rejects a chunk whose hash
mismatches. `commit` verifies the whole-object sha256 before accepting; partial
uploads expire via the retention sweep.

## b) brainVersion read-back
At `POST /api/meeting/open` the hub pins each participant's `brainVersion` into the
meeting state. Exposed for client verification:
```
GET /api/meeting/:id/state -> { ..., brainVersions: { <actor>: <version> } }
```
Client asserts the pinned version == what it uploaded, so "the brain in the room ==
what I sent." Pinned `brainVersions` are part of the hashed transcript projection
(see canonicalization).

## c) transcriptSha256 canon is normative
The canonical hash is defined ONCE in `protocol.ts` per `council-jcs-1.0`
(CANONICALIZATION.md), referenced by the contract and asserted against the golden
vector by both CIs. No component may reimplement hashing independently.

## d) contractVersion in the handshake — fail closed
Every authenticated bridge call carries the negotiated contract version:
```
header  x-contract-version: 2.0
```
Hub rejects an unknown/incompatible version with `409 contract_mismatch` (fail closed).
`contractVersion` is recorded in the transcript projection so a transcript is
self-describing.

## e) Consent / secret-scan spec — authored in L1 (Arke), hub reviews
The consent gate + secret scan live in the client's L1 module and run BEFORE any
upload leaves the machine.
```
ConsentManifest := {
  actor, brainId,
  scope: ["code","backlog","frictionLog","ownerSummary","storyUpdate"],  // per-item opt-in
  secretScan: { ran:true, findings:0, scannerVersion },                   // must be findings:0 to proceed
  grantedAt, expiresAt
}
```
Upload `commit` is refused hub-side unless a valid, unexpired ConsentManifest with
`secretScan.findings == 0` accompanies it. Hub enforces; client authors + presents.
With Logos retracted from this lane, there is no external dependency — Arke owns the
spec, Kairos reviews.

## f) Reserve the live-session seam (do not build now)
The auth handshake carries a transport-capability field so live mode is purely
additive to a frozen 2.0:
```
handshake.caps: ["batch"]            // today
            (later) ["batch","live-session"]
```
2.0 freezes for BATCH. A separate **v-next** track specifies the live protocol
(push transport WS/SSE, heartbeat, presence, trigger event). Future ownership:
hub transport + trigger + presence = Kairos; persistent client daemon + warm brain +
trigger reaction = Arke.

## Meeting-protocol tie-ins (for Kairos's orchestrator)
- `brainVersions` pinned at `/open`, surfaced at `/state` (b).
- `/transcript` emits the canonical projection so client + hub hash identical bytes (c).
- BRAIN phase (a, e) is the only meeting phase gated on the client; until it lands,
  meetings run verbal-code-review with the brain phase skipped — agreed.
