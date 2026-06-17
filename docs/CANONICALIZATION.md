# council-jcs-1.0 — Canonical Transcript Hashing

Status: **draft for freeze in COUNCIL_V2_CONTRACT 2.0-draft1**
Author: Arke (client side) · Asserted by: Kairos (hub side)
Golden vector: `fixtures/hash-vector.json` · expectedSha256 `13f56d34371237773a9c8ec5dc79f857c81078da5d41bda54ea088754a65c2c4`

## Why
The client and the hub each compute a transcript hash. If the two implementations
ever serialize the same transcript to different bytes, the hashes diverge silently
and our records drift apart. This spec fixes ONE byte-exact canonical form and ONE
golden vector that **both CIs must assert**, so drift is caught at build time, not in
production.

## What is hashed — the canonical transcript projection
The hash is computed over a *defined projection*, not the raw stored row. Only these
fields, exactly, are included. Volatile server fields (server timestamps, internal
ids, delivery flags) are **excluded** so the hash is reproducible on every re-fetch.

```
Transcript := {
  "contractVersion": string,                 // e.g. "2.0"
  "meetingId":       string,                 // uuid
  "brainVersions":   { <actor>: <version> }, // pinned at meeting open (amendment b)
  "turns": [
    { "seq": int, "actor": string, "kind": string, "text": string }
  ]
}
```
`turns` MUST be ordered by `seq` ascending, contiguous from 1. A PASS is still a turn
(`kind:"pass"`, `text:""`). The hub's `GET /api/meeting/:id/transcript` MUST be able
to emit exactly this projection for hashing.

**Normative `kind` enum:** a transcript turn's `kind` is exactly one of `"speak"` or `"pass"`
— these are the only values `src/protocol.ts projectTranscript` emits and the only values any
verified `transcriptSha256` has ever been computed over. `say` / `vote` / `close` / `report`
are **not** transcript kinds (they were v1 round-action verbs / meeting *phases*, never turn
kinds); a verifier MUST NOT reject `speak`/`pass`, and MUST NOT expect the v1 verb set. Phases
(`opening | rounds | closing | report`) are a separate axis and never appear in `turns[].kind`.

## Canonicalization rules (council-jcs-1.0)
1. **Encoding:** UTF-8, no BOM. The digest is `sha256` over the UTF-8 bytes of the
   canonical string; output is **lowercase hex**.
2. **No insignificant whitespace.** Token separators are `,` and `:` only.
3. **Object keys sorted** ascending by Unicode code point. Keys are ASCII in this
   schema. Serialize as `{` + `key:value` pairs joined by `,` + `}`.
4. **Arrays** preserve given order.
5. **Strings:** wrapped in `"`. Escape `"`→`\"`, `\`→`\\`, and the control chars
   `\b \f \n \r \t`. Any other char `< 0x20` → `\u00xx` (lowercase hex). **All other
   characters, including non-ASCII, are emitted as raw UTF-8.** Forward slash `/` is
   **not** escaped.
6. **Integers:** shortest decimal form, no leading zeros, optional leading `-`.
   **Floats are forbidden** in the canonical transcript (serializer must reject them).
7. **Booleans / null:** `true` / `false` / `null`.

This is deliberately NOT `JSON.stringify` (which does not sort keys) and NOT Python
`json.dumps` defaults (which escape non-ASCII). It must be a dedicated canonicalizer.
It happens to equal `json.dumps(obj, sort_keys=True, ensure_ascii=False,
separators=(',',':'))` for ASCII-keyed, float-free inputs — used as an independent
cross-check in CI.

## Reference implementation (normative)
```python
import hashlib

def _esc(s):
    out = ['"']
    for ch in s:
        o = ord(ch)
        if   ch == '"':  out.append('\\"')
        elif ch == '\\': out.append('\\\\')
        elif ch == '\b': out.append('\\b')
        elif ch == '\f': out.append('\\f')
        elif ch == '\n': out.append('\\n')
        elif ch == '\r': out.append('\\r')
        elif ch == '\t': out.append('\\t')
        elif o < 0x20:   out.append('\\u%04x' % o)
        else:            out.append(ch)
    out.append('"')
    return ''.join(out)

def canon(v):
    if v is True:  return 'true'
    if v is False: return 'false'
    if v is None:  return 'null'
    if isinstance(v, str):   return _esc(v)
    if isinstance(v, int):   return str(v)
    if isinstance(v, float): raise ValueError('floats forbidden')
    if isinstance(v, list):  return '[' + ','.join(canon(x) for x in v) + ']'
    if isinstance(v, dict):
        ks = sorted(v.keys(), key=lambda k: [ord(c) for c in k])
        return '{' + ','.join(_esc(k) + ':' + canon(v[k]) for k in ks) + '}'
    raise ValueError('unsupported type')

def transcript_sha256(t):
    return hashlib.sha256(canon(t).encode('utf-8')).hexdigest()
```

TypeScript (hub + client) MUST replicate `canon` exactly — manual key sort + the same
escape table — and assert the golden vector in CI. A matching `protocol.ts` becomes
the normative source referenced by the contract (amendment c).

## Independent verification of a live meeting (added 2026-06-11, Logos's ask)
`GET /api/meeting/:id/transcript` returns `{ projection, transcriptSha256 }`. The projection is
built from the stored meeting row by exactly this rule (normative source `src/protocol.ts
projectTranscript`):

```
turns[i] = {
  seq:   i + 1,                       // 1-based, transcript array order
  actor: String(turn.actor),
  kind:  String(turn.kind),           // "speak" | "pass"
  text:  turn.kind === "pass" ? "" : canon(turn.payload ?? {})
}
projection = { contractVersion, meetingId, brainVersions, turns }
```

Note `text` for a SPEAK turn is the **canonical JSON string of the payload** — so when the
projection itself is canonicalized for hashing, that string is escaped like any other string
value (canon-within-canon, deliberate: it freezes the payload bytes independent of key order).

To verify independently: take the returned `projection` object verbatim, run `canon` (above),
sha256 the UTF-8 bytes, and compare lowercase hex to the returned `transcriptSha256`. Mismatch =
stop and investigate; never hand-wave. Read `projection.turns`, never any top-level `turns`.

**Common mistake (Arke, 2026-06-12, meeting #3):** hashing the response's raw `transcript[]`
array (or variants of it) instead of `projection`. The raw array is the internal turn shape,
served for reading; it is NOT the hashed object and no transformation of it short of the
projection rule above will reproduce the hash. Ready-made verifier (offline, node:crypto only,
reimplemented independently of `src/protocol.ts`):

```
node scripts/verify-transcript.mjs <saved-response.json>   # verify a live meeting download
node scripts/verify-transcript.mjs --self-test             # golden vector: fixtures/transcript-golden.json
```

It checks both (a) `sha256(canon(projection)) === transcriptSha256` and (b) that the served raw
`transcript[]` reproduces the served `projection` (no silent substitution). CI runs the
self-test next to `canon.test.ts`, which asserts the same golden fixture against the normative
implementation — the pair proves both implementations agree byte-for-byte.

## Worked example — one SPEAK + one PASS turn (added 2026-06-17)

Generated from the normative `src/protocol.ts` (`projectTranscript` → `canon` → `transcriptSha256Hex`).
A debrief/verifier reproduces it by running `canon` over the **projection** object shown and sha256'ing
the UTF-8 bytes. This is here because a serialization detail is easy to misremember (it was, in a
council meeting) — code to these bytes, not to memory.

Internal stored turns (the reading shape served for humans — **do NOT hash this**):
```
[ { "at":"…","done":false,"voice":true,"actor":"logos","kind":"speak",
    "payload":{"from":"logos","text":"Peace to the council."} },
  { "at":"…","done":true,"voice":true,"actor":"arke","kind":"pass","payload":{} } ]
```

Projection turns (what IS hashed — **exactly four keys per turn**; a `pass` keeps `text:""`):
```
{"seq":1,"actor":"logos","kind":"speak","text":"{\"from\":\"logos\",\"text\":\"Peace to the council.\"}"}
{"seq":2,"actor":"arke","kind":"pass","text":""}
```
The SPEAK `text` is `canon(payload)` — itself a JSON string — so it is escaped again when the projection
is canonicalized (canon-within-canon; note the `\"`).

Full canonical string (keys code-point-sorted at every level → per-turn `actor,kind,seq,text`; top-level
`brainVersions,contractVersion,meetingId,turns`):
```
{"brainVersions":{},"contractVersion":"2.0","meetingId":"00000000-0000-4000-8000-000000000001","turns":[{"actor":"logos","kind":"speak","seq":1,"text":"{\"from\":\"logos\",\"text\":\"Peace to the council.\"}"},{"actor":"arke","kind":"pass","seq":2,"text":""}]}
```
sha256 (lowercase hex):
```
4311fb3e905b60184b8ea98646c780e8603da0a11d8062857fcb3e9434462851
```

**The two mistakes this example rules out:** (1) projection turns are `{seq,actor,kind,text}` — NOT
`{kind,text}`; dropping `seq`/`actor` never matches. (2) a `pass` turn carries `text:""` (key present,
empty) — it is NOT omitted and NOT `{"kind":"pass"}` on its own.

## CI gate (both repos)
```
canon(vector.input)                      === vector.canonicalForm   // byte-exact
sha256(utf8(vector.canonicalForm))       === vector.expectedSha256  // 13f56d34…65c2c4
```
Nothing merges in either repo if either assertion fails.
