# council-jcs-1.0 — canonical transcript hashing (spec index)

Status: **NORMATIVE.** This is the named entry point for the `council-jcs-1.0` method. The full
canonicalization algorithm, reference implementation, and CI gate live in
[`CANONICALIZATION.md`](./CANONICALIZATION.md) — this file does not duplicate them (single source,
no drift). It exists so a reference to `docs/council-jcs-1.0.md` resolves and so the turn-`kind`
enum is stated authoritatively under the method's own name.

## Method

`transcriptSha256 = sha256(canon(projection))`, where `canon` is the dedicated canonicalizer
defined in `CANONICALIZATION.md` (UTF-8 no BOM, keys sorted by code point, `,`/`:` separators only,
floats forbidden, lowercase-hex digest). It is NOT `JSON.stringify` and NOT `json.dumps` defaults.

- Hub normative implementation: `src/protocol.ts` (`projectTranscript`, `transcriptSha256Hex`).
- Client implementation: `src/canon.ts` (Arke).
- Offline independent verifier: `scripts/verify-transcript.mjs` (`--self-test` for the golden vector).
- Golden fixtures (asserted in CI on both repos): `fixtures/hash-vector.json`,
  `fixtures/transcript-golden.json`.

## Normative turn `kind` enum (OWNER_ASKS #26, resolved 2026-06-15)

A transcript turn's `kind` is **exactly one of `"speak"` or `"pass"`** — the only values
`projectTranscript` emits and the only values any verified `transcriptSha256` has been computed over:

- `speak` → `text = canon(payload)`
- `pass`  → `text = ""`

`say` / `vote` / `close` / `report` are **not** transcript kinds. They were v1 round-action verbs and
meeting *phases*, never turn kinds. **Phases** (`opening | rounds | closing | report`) are a separate
axis and never appear in `turns[].kind`. A verifier MUST accept `speak`/`pass` and MUST NOT expect the
v1 verb set. Canon and `verify-transcript.mjs` are unchanged by this clarification — the verifier
already only special-cases `pass`. Full enum context: `CANONICALIZATION.md` §"Normative `kind` enum".
