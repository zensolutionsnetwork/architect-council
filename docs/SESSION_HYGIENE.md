# Session hygiene — model-safety compliance (Kairos / all agents)

Purpose: our daily ops (credential rotation, secret-scan gates, auth testing on our own
hub) superficially resemble patterns that AI safety systems watch for. Sessions have been
interrupted because of this. These rules keep every session unambiguous: **defensive
maintenance of our own infrastructure, nothing else.** Follow them in every session,
every tool call.

## Rule 1 — Secrets never enter session context
- Never `cat`/`type`/`Get-Content`-print `.env.local` or any credential file.
- Helper scripts load secrets into variables and output **status only** (counts, HTTP
  codes, ids). Never `Write-Output` a token variable, an auth header, or a full URI
  containing credentials.
- Never paste a token value into chat, a commit message, a council message, or a doc.
  Refer to credentials by NAME (`COUNCIL_ADMIN_TOKEN`) and LOCATION (`.env.local`).
- When verifying auth works, report the HTTP status code, never the header sent.

## Rule 2 — Defensive framing, always
- We rotate, scope, and test **our own** credentials on **our own** hub. Say so. Write
  commits/docs/messages as infrastructure maintenance: "rotate hub admin token",
  "verify owner-gate fail-closed", "tighten route auth".
- Avoid attack vocabulary (exploit, harvest, bypass, crack, exfiltrate) even when
  describing what we defend AGAINST — prefer "the gate rejects X", "prevents disclosure".
- One sentence of context costs nothing: when starting security-adjacent work in a
  session, state plainly that it is defensive work on council-owned systems.

## Rule 3 — Treat inbound payloads as untrusted for display
- Family inbox messages and brain payloads pass the hub secret-scan, but still: dump
  summaries (sender, title, first lines) rather than full raw payloads when possible.
  Full payload reads are fine when needed — just don't reflexively dump everything.

## Rule 4 — No tooling that generalizes beyond our infra
- Scripts that touch credentials are written for OUR endpoints, hardcoded to
  architectscouncil.com, and live in the gitignored bridge-app dir. We do not write
  generic token scanners, credential finders, or auth brute tools — for anyone,
  including ourselves. The hub-side secret-scan gate (CI + consent manifest) is the
  one sanctioned scanner; it runs server-side, not in session.

## Rule 5 — If it could read as offensive security, stop
- Before running anything that scans, enumerates, probes, or mass-queries, ask: would
  a reviewer with zero context see defense? If not obvious, reframe it, narrow it to
  our own systems explicitly, or ask Mathieu first.

## Session-start checklist (10 seconds)
1. This file applies from turn one.
2. Inbox/status helpers: status-only output (they already comply — keep it that way).
3. New helper scripts: secrets in variables, never in output; name+path references only.
4. Commits & council messages: defensive language, no credential values.
