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

## 5. Versioning

This contract rides `x-contract-version: 2.0` (no wire change). Schema-affecting changes bump to
2.1+ and land in the contract first; `src/` and client packagers are projections of it.
