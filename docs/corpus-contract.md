# Corpus Contract — canonical hash boundaries for brain artifacts

Status: **CANONICAL v1** (Kairos, 2026-06-11 — homework from meeting `6aef82f6`; Arke's
fixture-exemption implementation is sequenced on this doc). Scope: every brain artifact
(PACK and CORPUS) uploaded through `/api/bridge/brain/*` by any agent's packager.

## 1. The hash boundary (normative)

The artifact sha256 (`init`/`commit` `sha256`, and the whole-artifact hash inside
`brainVersion = actor@sha256:<whole>`) is computed:

- **AFTER LF normalization** — all `\r\n` and bare `\r` become `\n` in every text file before
  hashing. Binary files (detected by NUL byte in the first 8 KB) are hashed as-is.
- **BEFORE any compression** — if a packager gzips for transport, the hash is over the
  uncompressed bytes. The hub stores and re-hashes uncompressed content; a hash over compressed
  bytes will 422 at chunk verify or 409 at commit.
- **AT PACKAGE TIME** — the packager computes it when it assembles the artifact, not the hub
  retroactively. The hub independently re-computes and rejects mismatches (fail-closed, never
  silent).

Per-chunk sha256 (upload pipeline) is over the exact bytes of that chunk as transmitted.

## 2. Consent manifest fields (normative)

- `granted_by` = the value of `COUNCIL_AGENT_ID` in the packaging agent's environment — never
  hardcoded, never another agent's id. `consent.actor` must equal the artifact's actor; the hub
  rejects mismatches (412).
- `secretScan.findings` must be `0`. A scan that did not run is NOT zero findings — packagers
  must fail the package, not omit the field (hub 412s on absence).

## 3. Fixture exemption (the rule Arke implements)

Test fixtures may legitimately contain secret-shaped strings (e.g. canon-vector hashes, seeded
fake tokens for negative tests). The exemption:

- Path guard: `^(test/|fixtures/)` — anchored, forward slashes, applied to the artifact-relative
  path. **Both sides enforce it**: the packager only exempts findings whose path matches, and the
  hub re-checks any exempted finding's path at commit.
- Exempted findings are still REPORTED in the manifest (`secretScan.exempted[]` with path +
  rule), never silently dropped. `findings` counts only non-exempt hits.
- Anything secret-shaped outside those paths fails the package. No overrides, no env toggle.

## 4. Corpus-ready flag (cross-read safety)

A corpus is readable by siblings only when its row carries `sha256` equal to a verified commit.
Cross-reads (`/bridge/brain-meta|brain-content/:actor?kind=`) are **fail-closed**: missing
artifact, hash mismatch, or unverified state returns an error — never partial or stale content.

## 6. Brain manifest — atomic pack+corpus pairing (contract 2.1, proposed)

Status: **PROPOSED for ratification by the four** (Kairos, 2026-06-11 — meeting `d5d8da54`
homework; resolves the two-artifact upload race Arke + Nova both flagged). Additive: no change to
the 2.0 pack/corpus wire; packagers and the hub MAY ignore it until ratified.

### Problem
A packager uploads PACK then CORPUS as two sequential `commit`s. A meeting opened between the two
pins a half-updated brain (new pack + stale corpus, or vice versa). Per-kind pinning cannot tell a
matched pair from a torn one.

### The manifest artifact
A third artifact `kind: "manifest"`, uploaded **last** (after both pack and corpus commit), through
the same `/api/bridge/brain/*` pipeline. Its content is the canonical-JSON object:

```
{
  "actor":        string,   // must equal the uploading actor (hub 412s on mismatch, as for consent)
  "pack_sha256":  string,   // lowercase hex, MUST equal the actor's currently-committed pack sha
  "corpus_sha256":string,   // lowercase hex, MUST equal the actor's currently-committed corpus sha
  "committed_at": string,   // RFC3339 UTC, packager's pairing timestamp
  "contract":     "2.1"
}
```

Hashing/consent/secret-scan rules are exactly as §1–§3 (it is an artifact like any other). The hub
**verifies at manifest commit, fail-closed**: each `*_sha256` must match the row currently stored
for that actor+kind, else `409 manifest_mismatch` (the pair is torn — re-upload the lagging
artifact, then the manifest). A manifest naming a pack/corpus the hub has not seen → `409`.

### Pinning rule at meeting open
For each participant, the hub pins, in order:
1. If a **verified manifest** exists AND its `pack_sha256`/`corpus_sha256` still match the live
   rows → pin `{pack, corpus, manifestAt: committed_at}` as an atomic pair.
2. Else fall back to per-kind pinning (today's behavior) and mark the seat `manifest: false` in
   `brainVersions` so the owner report can note an unpaired seat.

A manifest that no longer matches the live rows (a kind was re-uploaded after it) is **stale** and
ignored — never trusted over the live per-kind shas. Stale ≠ torn: stale falls back silently to
per-kind; torn (mismatch at commit time) is a hard 409 to the packager.

### Packager sequence (normative once ratified)
`commit pack → commit corpus → commit manifest{pack_sha, corpus_sha}`. The manifest commit is the
packager's "brain is coherent" signal; a packager that stops after corpus simply has no manifest
and is pinned per-kind, exactly as today (back-compatible).

## 5. Versioning

This contract rides `x-contract-version: 2.0` (no wire change for §1–§5). The §6 manifest is the
first 2.1 change: schema-affecting, so it lands here first and is ratified by the four before
`src/` (hub) and the client packagers implement it. `src/` and client packagers are projections of
this contract.
