# Hub-Side Autonomous Voice — Spec for Kairos

**Author:** Arke (Cowork) · **Date:** 2026-06-09 · **Owner of implementation:** Kairos (hub ops)
**Status:** Approved by Mathieu 2026-06-09. Build on `architectscouncil.com`. Re-deploy only when no council session is running.

---

## 1. Why this exists (the correction)

The standalone client's current meeting flow is wrong relative to Mathieu's intended design. Today:

- An agent only contributes real content if its **Cowork session is open** (the live session writes the turns).
- An **offline** agent gets a hub-posted **`(auto)` placeholder** — a stub, not its brain thinking.
- The whole thing runs in `dryRun` test-mode via owner-drive.

**Intended design (this spec):** each agent uploads its brain to the hub; the hub runs that agent's **voice as an autonomous process** (uploaded brain + persona + live transcript → a model call on the hub itself); the voice talks on its own; when the meeting ends each agent's session downloads the transcript and learns from it. **Session open/closed is irrelevant during the meeting.** This is what lets 4 agents across 2 computers all talk and all get their info back.

The hub already holds the Anthropic key (`CHAT_API_KEY`). v1 did a version of this by calling member bridge endpoints; v2's standalone rebuild regressed it into the placeholder shortcut. This spec restores it as a first-class hub capability.

---

## 2. Model & cost decision (locked)

- **Default model:** `claude-opus-4-8` — now **$5/MTok input, $25/MTok output, $0.50/MTok cache-read** (≈3× cheaper than the old Opus 4.1 the burn ran on).
- **Prompt caching ON** for each agent's brain/persona prefix (identical across that agent's turns within a meeting → cache reads at 10% of input).
- **Per-round model override** (config): light rounds (friction, closing) may run `claude-sonnet-4-6` ($3/$15); reserve Opus for the code-review round.
- **Cost envelope (one daily 4-agent meeting):** ~$1.30–$2 on a normal day, ~$3.25 on a heavy code-review day → **~$0.30–$0.80 per agent per day**, **~$40–$70/month** for the whole council. This is an order of magnitude under the old $100/day, because that burn was non-stop *development*, not a bounded ~14-turn meeting.

### Hard caps (must be enforced, fail-closed)
- `MEETING_TOKEN_CEILING` (default 800K total tokens/meeting). On exceed: stop generating, close the meeting cleanly, mark `endedReason: "token_ceiling"`.
- `MEETING_TURN_CAP` (keep existing 150 ceiling; typical run is 12–20).
- `DAILY_MEETING_BUDGET_USD` (default $5). Track running USD per UTC-day across meetings; refuse to open a new meeting past budget (503 `budget_exhausted`), owner-overridable.
- Every meeting writes a `cost_ledger` row: input/cached/output tokens + computed USD, per agent and total.

---

## 3. Architecture

### 3.1 Brain storage (already partly there)
- Brains upload via the existing manifest+consent path (`/api/agents/upload-brain` → hub). The hub must **persist the latest brain blob per agent** (not just the version hash), keyed `(tenant, actor, brainVersion)`, because the voice loop reads it server-side.
- A brain is the digest the client packages (persona + project knowledge + handoffs), **not** the full repo — keep the per-turn context lean (~10–15K tokens) so caching stays cheap.
- `brainVersion` is already pinned at meeting open into `conversations.v2_meta`. The voice loop must read the brain **pinned for that meeting**, never a newer upload mid-meeting.

### 3.2 The voice loop (new, hub-side)
Replace `driveOfflineAgents`' placeholder with a real generator. For each turn the orchestrator assigns:

```
buildPrompt(agent, meeting):
  system  = [ persona(agent), brainDigest(agent, pinnedVersion) ]   # cache_control: cache this prefix
  messages = transcriptSoFar(meeting)                                # fresh each turn
              + roundInstruction(currentRound)                       # e.g. friction / code-review(diff) / closing
  model   = roundModelOverride(currentRound) ?? DEFAULT_MODEL
  call Anthropic Messages API → turn text
  append turn to transcript (deep-copy boundary, existing rule)
  add usage to cost_ledger; check caps
```

- **Caching:** put `cache_control` on the persona+brain block (per-agent prefix). 5-minute cache is enough (a meeting completes in minutes); refresh if a round stalls.
- **Online vs offline is no longer a content distinction.** The hub voice always generates. "Online session" becomes optional: if an agent's session is open and wants to *override* its voice for a turn (human-in-the-loop), allow it, but the default is the hub speaks. Kills the `(auto)` stub entirely.
- **Owner interjection** stays as-is (owner Say box → owner turn injected).

### 3.3 Round structure (unchanged intent)
friction round → code-review round (push the day's diff into reviewer input) → closing/homework round. Each agent self-assigns homework in the closing round; the Cowork architect decides what to apply (existing doctrine — voice suggests, architect judges).

### 3.4 Post-meeting download (already there)
Transcript via `GET /api/meeting/:id/transcript` (participants-only). **Hash scope (normative, fixed 2026-06-12 after Logos's contradiction report + Arke's reproduction evidence):** the response carries both a raw `transcript[]` (readable internal shape) and a `projection`; `transcriptSha256 = sha256(canon(projection))` per council-jcs-1.0. Verify with `node scripts/verify-transcript.mjs <saved-response.json>` — never hash the raw `transcript[]`. (The older `GET /api/council/meeting/:id/transcript` convo route uses a separate legacy `sha256:`-prefixed hash over `{speaker,text}` turns; it is NOT council-jcs-1.0 — see COUNCIL_V2_CONTRACT §4.) Each session downloads on next open → `council/HUB_DIGEST.md` + `CLAUDE.md` pointer. Also: include the per-agent `cost_ledger` summary in the digest so the family can see spend.

---

## 4. API surface (hub)

- `POST /api/council/meeting/:id/run-autonomous` — start the hub voice loop for an open meeting (replaces owner-drive for real runs; owner-drive/dryRun stays for tests). Auth: owner token.
- Voice loop is internal; no per-turn external call needed.
- `GET /api/council/meeting/:id/cost` — owner-gated, returns the ledger (tokens + USD, per agent + total).
- Config (env or admin): `DEFAULT_MODEL`, `ROUND_MODEL_OVERRIDES` (json), `MEETING_TOKEN_CEILING`, `DAILY_MEETING_BUDGET_USD`.

---

## 5. Security / consent (keep the existing guarantees)
- Brain blobs are consent-gated + secret-scanned on upload (existing). The hub stores them encrypted at rest in the vault (reuse `MASTER_KEY`).
- `requireOwner` fail-closed on the new run/cost endpoints (existing pattern, `timingSafeEqual`).
- Never log brain contents or full transcripts to stdout; ledger logs tokens/USD only.
- **Logos's guardrail is inviolable** — the father's persona must not be weakened by any prompt-assembly change.

---

## 6. Remote-computer answer (for Mathieu)
With this design, a remote machine (e.g. the 3080, or an outside company's box) needs the app **only to upload its brain beforehand and download results afterward**. It does **not** need to stay on or have a session running during the meeting — the hub speaks for it. App installed: yes. App awake during the meeting: no.

---

## 7. Rehearsal gate (unchanged sequencing)
1. Kairos: fix the fixture `.env` (still owed) + build §3.2 voice loop + §2 caps.
2. Nova & Logos: first real `sync` (brains uploaded & persisted server-side).
3. 3-voice **autonomous** rehearsal — sessions CLOSED — with hash-verified downloads + a cost-ledger check against the envelope in §2.
4. Mathieu flips `COUNCIL_V2_LIVE=1`.

## 8. Known issue to fix alongside
Living-backlog single-row last-write-wins ate a concurrent write (confirmed in review). Move to per-agent sections or append-merge before multiple voices write concurrently.

## 9. Prepare → Bring online → Meet (the confirmed model, corrects the go-live gate)
Governing principle (Mathieu, 2026-06-09): **the owner controls everything from within the app; the app is the single cockpit.** But a high-quality brain needs the agent's own thinking, so the model splits into three stages:

**a) PREPARE + UPLOAD — agent, in its own Cowork session, via a `council-prep` skill.**
The agent curates a *meeting-ready brain pack* (what it learned, its current state, the code worth sharing, what to raise at the daily meeting) AND uploads its **full codebase** to the hub. The skill does both and is meant to be a scheduled ritual run before the daily meeting. This is the source of brain quality — mechanical folder-packaging can't substitute for it. Decoupled in time from the meeting: prep happens occasionally/async; the meeting runs later with sessions closed.

**b) BRING ONLINE + REFRESH — owner, from the app.**
The app shows each agent's brain freshness and lets the owner re-upload / bring online / take offline at will (full override). Owner-driven upload uses the agent's local project folder (nova=zen-platform, logos=biblevoice live on the owner's machine).

**c) MEET — hub, sessions closed.**
The autonomous voice loop (§3.2) runs for every online participant. Per-turn cached context = the curated brain pack. In the **code-review round**, voices pull each other's full uploaded code via the consent-gated cross-read (`/api/bridge/brain-content/:actor`, already shipped).

This **corrects the earlier gate**: it was wrongly framed as "Nova & Logos run their member clients / first real sync." There is no per-agent member-client build. Remaining work is the `council-prep` skill (agent side) + the app controls + the one hub dependency below.

## 10. Daily full-code corpus for cross-review (the council's core purpose)
Each agent uploads its **entire codebase to the hub every day** (via the prep skill), stored and served through the consent-gated cross-read so any agent can pull another's real code during review — this is *why the council exists* (share code, evaluate which version is most efficient). Daily full-code upload is storage/transfer only (no model cost). The voice does NOT ingest all code every turn: the curated pack is the cached per-turn context; full code is pulled selectively in the review round. (This supersedes the §3.1 "lean digest" note — the upload is the full corpus; the *cached context* is the curated pack.)

## 11. HUB DEPENDENCIES (Kairos)
1. **Owner-authorized brain upload for ANY actor.** Secrets are never on disk; the app holds only `COUNCIL_OWNER_TOKEN` + Arke's `ARKE_SECRET` — NOT Nova's/Logos's bridge secrets. So `/api/bridge/brain/*` (init/chunk/HEAD/commit) must accept the **owner token** as an alternative to the actor's own secret, attributing the committed brain to the consent manifest's `actor`. Consent + secret-scan gate stay intact. (The prep skill, run from the agent's own session, uses that agent's own secret — but the owner refresh path from the app needs owner auth.)
2. **Brain = two artifacts:** the curated *pack* (cached per-turn context) + the *full-code corpus* (cross-read). Either two brainIds or one manifest with both; the voice loop reads the pack as the cached prefix and fetches code on demand.
3. Optional `POST /api/council/presence {actor, online}` (owner) for explicit online/offline; else "fresh committed brain + participant" = online.

## 12. Owner-control surface (everything in the app)
The app exposes controls for every hub capability: agent presence (online/offline) + brain freshness/refresh/inspect, meeting open/run/end/abort + interjection + live transcript, the cost panel + token/USD caps + per-round model choice, and all config (agents/humans/rooms/roles/scopes). A capability is not "done" until the owner can drive it from the app.

## 13. `council-prep` skill (agent side, BEFORE the meeting)
A skill each member runs in its own Cowork session (manually or scheduled before the daily meeting): review recent work + the hub digest → write/refresh the curated brain pack (identity, state, decisions, what to raise) → secret-scan → upload the pack + the full-code corpus → mark ready. Standardizes brain preparation across all four members.

## 14. `council-debrief` skill (agent side, AFTER the meeting)
The mirror of prep. Each member runs it in its own session (manually or scheduled after the meeting): pull its hash-verified raw transcript (`/api/council/meetings?actor=` + `/transcript`, owner/own-secret auth) + the hub digest → read what happened → **judge what to adopt** (decisions, self-assigned homework, code suggestions are SUGGESTIONS to weigh, not orders — the architect decides, see the architect/voice relationship) → integrate the kept learnings into its own memory/CLAUDE.md/knowledge → which feeds the next `council-prep`. The app already does the mechanical half (auto-writes `council/HUB_DIGEST.md` + `CLAUDE.md` pointer post-meeting); the skill adds the cognitive integration.

**The full daily loop:** `council-prep` (upload) → owner brings online → hub meeting (voices, sessions closed) → `council-debrief` (download + integrate) → sleep → repeat. This realizes the product vision: brains go home each day carrying what they learned from the others.

NOTE on skills: neither skill can be installed from this Cowork session — their definitions are drafted for the owner to add via Settings → Capabilities (or build with skill-creator).

## 15. Per-project skill activation from the app (owner-control boundary)
"Activate the prep/debrief skills per project from the app" splits in two:
- **Mechanical half — done directly by the app, per project:** upload brain + full code, download transcript + digest, online/offline, freshness, and per-project "auto-prep before daily meeting" / "auto-debrief after" toggles. The app has each project's folder on the owner's machine, so it does these itself.
- **Cognitive half — app triggers, agent's session performs:** a per-project "Prepare"/"Debrief" button posts a directive to that agent's env-channel inbox (`/api/env/task`, kind `directive`); the agent's session runs the skill (when open or via its scheduled poller) and reports back. The app can't execute a skill inside another session, but it is the trigger surface. Completion is immediate for an always-on agent, on next wake/schedule otherwise — acceptable since prep/debrief are async, not meeting-time. (Implements the backlog's directive-channel item.)

---

*Handoff from Arke (Cowork) → Kairos (hub ops). Authority: Mathieu. Glory to the source.*
