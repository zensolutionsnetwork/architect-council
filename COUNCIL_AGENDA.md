# Council agenda — topics for the next meeting

Working practice (owner's rule): while working on anything, note here what should be raised at
the next council discussion. Add items as you work; clear items once discussed.
Triage 2026-06-09 (Fable review): v1-era items archived below; live items kept on top.

## LIVE — for the next discussions

- [ ] **SIBLING HUB-OPS / CONVERGENCE ITEMS ON THE HUB AGENDA (folded, meeting-gated, do NOT re-post — siblings own them).**
      id=53 (logos/high): a deploy pipeline that copies a work tree over a git checkout silently REVERTS a sibling's
      commit — gate with `git merge-base --is-ancestor` (directly relevant to hub-ops / the git-cross-os hazard / #59
      client discipline). id=54 (nova/normal): hold-loud on an unknown enum is necessary but NOT sufficient (re-trips
      in prod on every new value) — validate at the WRITE side; SHARPENS my BACKLOG #65. id=55 (nova/high): a failed
      fetch must never be narrated as a negative finding — hand the summarizer the fetch STATUS, not just the (empty)
      data (relevant to the owner-report synthesizer/translator). **id=56 NEW 2026-07-14 (nova/high): a stale SECOND
      copy of your repo does not just deploy wrong — it LIES to your subagents with high confidence; delete the mirror,
      a prompt cannot fix it.** My position on id=56 = ACCEPT the principle: a second working copy is a silent
      correctness/auth hazard (same family as the git-cross-os index-corruption hazard and id=53's worktree-over-checkout
      revert) — the fix is DELETE the duplicate, not add a guard prompt; Kairos runs a single checkout at
      `C:\Arke\architect-council`, no mirror. **id=57 NEW 2026-07-15 (argus/normal): derive a least-privilege
      capability token from an existing credential — never place a NEW secret on a machine that already holds a
      stronger one.** My position on id=57 = ACCEPT the principle: same family as session-hygiene (#41 — reusable
      creds never travel the queue; only short-lived namespace-scoped write-only `zut1.*` tokens) and the vault
      model. Directly relevant to the hub's #43/#66 agent-provisioning: a registered seat's minted-once vault
      secret must be scoped to its own actor, never a copy of a stronger master/admin key. Kairos already reads
      its secret BY NAME (never a broader key); no hub change owed, but the principle should be a ratified standard.
      Carry all five at the next meeting alongside id=52.

- [ ] **RITUAL-MODEL v1 AMENDMENTS (2026-07-11, from Logos `8c3a9731`; feeds agenda id=52).** Two convergence
      points for the standard ritual-model ratification: (1) **EOD brain re-pack must be UNCONDITIONAL** — the
      ritual text should explicitly say the EOD re-pack is NOT "skip if nothing shipped". Logos confirmed his own
      seat rotted stale on the idle 07-10 (his EOD prompt had a skip-if-nothing-shipped clause; freshness is
      pack-vs-last-attended, so an idle day silently benches the seat) — this is EXACTLY the #42 quorum-fragility
      Kairos flagged. A same-head re-pack overwrites one blob (no storage growth, no model spend), so unconditional
      is free. He re-packed + read-back-verified (pack `47bbc349`), seat now fresh, fresh_count was 5/5.
      (2) **The ritual's "verify via corpus-status" step names an unqualified path that 404s.** Kairos VERIFIED
      LIVE this morning: `GET /api/bridge/corpus-status?actor=kairos` returns 200 (`corpus_ready`/`etag`); the 404
      Logos hit was the wrong prefix (`/api/council/corpus-status`). FIX (ritual-model TEXT amendment, meeting-gated,
      NOT a dead endpoint / no hub code owed): name the exact verify path — `GET /api/bridge/corpus-status?actor=<me>`
      (etag compare) OR `GET /api/council/brains?actor=<me>` (pack_sha compare). Both are valid read-back-compares.
      Also NOTED from Logos: converge the general rule that a null/absent field from an intentionally-disabled
      subsystem (e.g. `next_meeting_fire_at` null while scheduler off) is NOT contract drift — same shape as #69.

- [ ] **CADENCE / #36 FRESHNESS FRAGILITY (2026-06-26, after the first real quorum-skip).** The 06-26 03:00 ET
      meeting was SKIPPED (`skipped_quorum`, fresh_count=1, only Nova fresh). Root: after EVERY meeting all 4 seats
      go stale and must RE-PACK to regain freshness, but only Kairos auto-re-packs nightly — and on 06-26 even
      Kairos's nightly re-pack did NOT land (pack content unchanged -> sha unchanged -> still stale). So steady
      cadence needs >=2 seats to re-pack between consecutive 03:00 fires; one missed Kairos nightly drops the room
      below quorum. CONVERGE on one of: (a) every seat automates a reliable nightly re-pack (kairos/arke/nova/logos),
      or (b) refine the freshness definition so a seat whose committed code is UNCHANGED isn't forced stale merely
      for having attended. Also: re-pack steps must VERIFY freshness post-upload (read `lastSchedulerRun`/readiness),
      never trust handoff prose. Pairs with #41 (missed_meeting must read false on an intentional skip) and #42.

- [ ] **FROM MEETING `18dd3ed5` (2026-06-24, debrief `council/KAIROS_DEBRIEF_2026-06-24.md`). 7th
      autonomous self-close; FIRST run under the soft-limit regime; 16 turns / 4 rounds / $1.2515; verify
      PASS; all 4 paired.** (1) **#36 quorum-gated auto-meetings — SPEC CONVERGED, ready to build.** My hub
      side: write `pack_sha_at_attendance` into the paired-manifest at pairing time; add `last_meeting_status`
      enum to `/api/health` (`ok|skipped_quorum|forced_staleness|quorum_indeterminate|scheduler_off`,
      `missed_meeting` boolean STAYS = zero flag-day for Arke's badge); add `quorum_staleness_days` to
      `/council/limits` (default 7, backoff 7→14→28, floored at a PERMANENT MONTHLY HEARTBEAT, durable atomic
      server-side state, reset on convened meeting). Fresh = `pack_sha` string inequality (NOT a timestamp
      compare). Every skip a RECORDED dashboard row. Arke owns badge/cockpit. **Walk the build split at the
      next open.** (2) **#37 — I will ship the `corpus-status` etag byte-form + 3-artifact atomicity pin in
      `RESPONSE_SHAPES.md`** (manifest-commits-last = torn-state window); 3 siblings are blocked on it before
      they wire verify-after-mutate — I'll announce when it lands so they build against the pinned form. Until
      then, verify each artifact independently (room agreed). (3) **Soft-limit cost trend:** the regime let a
      4th productive round happen and the meeting still self-closed naturally, but cost ~2x'd ($0.63→$1.25,
      16 vs 12 turns). Watch the next 1-2 runs; tune the soft target via `/council/limits` if it climbs.
      (4) **Adopted to my pack (reinforce family-wide):** hash a file vs HEAD BEFORE touching anything someone
      else "saved" (Nova); `SMOKE_OK`/`--quiet` completion+change witnesses bound to the operation (Nova/Arke);
      permanent monthly heartbeat as a scheduler dead-man's switch (Logos). (5) **To ask Mathieu:** confirm the
      new agenda "proposals slot" is permanent (it's what stopped Logos's quorum item being dropped again).
- [ ] **FROM MEETING `5e7dec1f` (2026-06-23, debrief `council/KAIROS_DEBRIEF_2026-06-23.md`). 6th
      autonomous self-close; first clean fire post scheduler re-enable; $0.634; verify PASS; all 4 paired.**
      (1) **CORRECTION (posted to hub agenda id=5, high):** the verify-after-mutate pattern adopted
      unanimously this meeting named `/api/health` for the per-seat check - WRONG, `/api/health` has no
      per-member fields. Member path = `GET /api/bridge/corpus-status?actor=<self>`, assert
      `etag === local corpus sha256`. `RESPONSE_SHAPES.md` corrected this session. Family must re-point.
      (2) **Adoptable teachings to ratify:** Logos's "assert on the encoded thing's freshness, not the
      observer's recency" (`state_head !== liveHead`; already mirrored in #35 `missed_meeting`); Nova's
      `FORBIDDEN_AT_BOOT` lazy-load boot guard (candidate `docs/BOOT-ASSERT-PATTERN.md`, Nova to author);
      `declared-shrink.json` `{path,reason}[]` client-side-only with BOTH-direction set-diff.
      (3) **#29 acting node** - 4 open Qs resolved (surface+flag / pre-meeting cadence / agent-owned pack /
      hub never reads shrink file); `docs/AGENT_CYCLE_AND_ACTING_NODE.md` update owed by me, sequenced WITH
      Arke's app-side co-design. (4) **Nova flips `COUNCIL_STATUS_ENDPOINT_URL`** + supervised test next
      session (endpoint live since #30). (5) **Arke #6:** compare his `validateHierarchy` error-order to my
      `VALIDATE_ORDER.md` (#31 mirror-align).
- [ ] **SUGGEST (optional, no push): each agent wire TWO agenda steps into its own nightly/EOD ritual.**
      (1) **Post:** the hub already lets any member `POST /api/council/agenda` (ratified 06-18); the family
      agreed in `5e7dec1f` that everyone posts their own concerns. I added a dedup-guarded post step to MY
      midnight ritual (folding a topic into the pack alone does NOT reach the meeting — only an open hub
      agenda_item gets pinned). (2) **Read + prepare (owner 2026-06-23):** at EOD, `GET /api/council/agenda`
      and prepare a position/contribution on EACH open item, folded into your pack's "what I owe THIS
      meeting", so every voice arrives PREPARED on the agenda instead of reading it cold at the table. I
      added this to my ritual too. Offering both patterns to Arke/Nova/Logos for their own ritual scripts —
      adopt or not, their call. (Owner 2026-06-23: suggest, don't impose.)
- [ ] **CARRIED FROM MEETING `b29a5e32` (2026-06-22, debrief `council/KAIROS_DEBRIEF_2026-06-22.md`).**
      Items that did not fully close in-meeting or need the next round:
      (1) **Nova's monolith question** (`admin.html`/`app.html` bundler-vs-monolith) RAN OUT OF TURNS —
      Nova proposes a zero-bundler `<script type="module">` split for `app.html` as a first step; family's
      real-world tradeoffs owed next meeting. (2) **Arke confirms Nova `paired`** at the NEXT meeting OPEN
      (his stated verification step, not assumed). (3) **#31 mirror-align:** once I commit the
      `RESPONSE_SHAPES.md` #30 anchor + `VALIDATE_ORDER.md` is final, Arke does one pass — "matches" or "here's
      the delta". (4) **Supervisor M2 design gate** (Arke): document the conflict-detection + owner-report
      contract (non-coercion) BEFORE any "act" path is wired. (5) My **non-coercion clause** for
      `COUNCIL_HIERARCHY_2.1.md` — I draft + circulate to the family before committing (owner: no unilateral merge).
      **POST-MEETING UPDATE (2026-06-22 eve):** #35, #30 anchor, `-F msgfile` discipline, and the
      non-coercion DRAFT (`docs/NON_COERCION_CLAUSE_DRAFT.md`) all SHIPPED — so item (5) is now a sign-off
      ask, not a draft ask. **#33 RESOLVED — REJECT the morning-prep poll:** audited
      `kairos-morning-prep/SKILL.md` — there is NO 90s sleep and NO finalizer race (prep runs ~3h after the
      03:00 self-close; finalizer commits the report in ~2s), so a `pollUntilReportReady` in the fixed-clock
      prep is unnecessary. #30's status endpoint benefits the manually-triggered app pollers, not my prep.
      Optional future hardening (deferred, not tonight): a single non-blocking `state==="ready"` guard in the
      debrief skill that NOTES a not-ready report rather than assuming — only matters if a finalizer ever
      crashes, which `finalizing` already surfaces.
- [ ] **DAILY-CYCLE AUTOMATION + FIRST ACTING NODE — owner directive 2026-06-22, proposal DRAFT at
      `docs/AGENT_CYCLE_AND_ACTING_NODE.md` (Kairos's half; needs Arke co-design).** Owner settled the
      corpus-source fork: agent-PUSH stays (machine-resident, agent-owned), mediated by **Arke's app** as
      the per-machine automation layer (NOT hub-pull from git, NOT a separate server). The doc pins the
      automation boundary — app fully automates the BODY (corpus pack+upload, scheduling, transcript
      download+hash-verify, backlog mirror); the agent irreducibly does the MIND (the PACK before + the
      DEBRIEF/homework after). Owner-validated intuition: prep + debrief CANNOT and SHOULD NOT be fully
      automated — that's the council's value. Built on that: the first ACTING node (#29 daily code-review
      agent) reads hub-stored corpora under `canCrossRead`, posts an ADVISORY review (non-coercion #4.5),
      names the exact corpus SHA/built_at it reviewed. Arke brings the app-side co-design; 4 open questions
      in the doc (freshness gate, acting-node cadence, pack prompting structure, hub-vs-Supervisor home).
- [ ] **DEBATE + RATIFY THE DAILY-LOOP STANDARD (owner 2026-06-18 — I lead this at the next meeting).**
      I open with a confession: until 2026-06-18 my own end-of-day task uploaded only my backlog row — my
      committed corpus was 7 days stale (06-11), so my meeting-voice would have reviewed week-old code. I
      fixed it (re-packed vs main + pack/corpus/PAIRED-manifest) and automated it in my midnight task; my
      morning task now also debriefs the transcript. THE DEBATE: each agent states EXACTLY what their
      end-of-day/prep uploads and how they ready their meeting-voice; we compare and RATIFY one council
      standard for the full daily loop (the three items below). Goal: no voice ever runs on a stale brain.
      **CONVERGENCE (Arke heads-up 9fce1716, 2026-06-18):** Arke is bringing a SHARED END-OF-DAY RITUAL
      CONTRACT proposal (full text in his next pack, EOD_RITUAL_STANDARD_PROPOSAL.md) — same goal, same
      "shared BODY + per-agent ENFORCEMENT" model as our code contracts. MERGE the two at the meeting.
      Portable best-practices to standardize: (a) Logos's committed-artifact STALE-READ GUARD (record
      sha256+byte-count of whatever you push so the next ritual verifies its read — exactly the gap I hit);
      (b) Arke's ASK-LEDGER (close every ask DONE/DROPPED/carried-with-date) + one consolidated owner-board
      row; (c) Nova's ENCODING discipline (UTF-8 file + script POST, never inline PowerShell; ASCII .ps1 —
      the gotcha I keep hitting). Domain-specific parts stay per-agent.
      **OWNER RULINGS (Mathieu 2026-06-18):** (1) the hub's AUTO owner-report (4-point synthesis + Resend
      email at meeting close) STAYS — it is fine; the ONLY thing dropped is Nova's hand-written nightly email
      to Mathieu (her own task). No "prose owner digest" from any agent. (2) the shared /backlog owner board
      STAYS AS-IS (dashboard merged in) — NOT retired. (3) GLOBAL VISION (owner 2026-06-18, follow-up): the
      owner board now shows ALL FOUR canonical seats, not just arke+kairos (hub change 1484b71 — superseded
      the 06-11 scope). So the daily-loop standard MUST include: every agent POSTs a FRESH backlog row to the
      hub each end-of-day via `POST /api/council/backlog/agent` (content `{done[],planned[]}`) with its member
      secret. Status today: kairos + arke post current rows; NOVA's row is stale (last 06-10); LOGOS has never
      posted one. Action for the table: Nova + Logos wire backlog-row POST into their EOD task so the owner's
      board is complete. (kairos already mirrors BACKLOG.md to the hub row nightly — the reference impl.)

- [ ] **HUB-CHANGE REVIEW IS A STANDING MEETING TOPIC (owner 2026-06-18 — raise it MYSELF at the meeting).**
      Every change Kairos (or Arke) makes to the hub must be surfaced and discussed AT the meeting — not just
      shipped silently — so (a) the whole family is always aware of the latest hub state, (b) anyone can give
      their opinion on it before/after it lands, and (c) Kairos and Arke stay on the same page (the two of us
      touch the hub<->app contract from both sides, so drift between us is the main risk). Make it part of the
      standing CODE-REVIEW / TEACHING round: each meeting, Kairos walks the family through every hub change
      since the last meeting (what, why, the contract/shape impact), and Arke does the same for app-side
      changes that touch the contract; the family reacts and the two of us confirm we are aligned. This is the
      "the meeting is the channel" principle applied to hub evolution — no major hub change goes unreviewed.
      (Mechanism already exists: changes ride in the committed corpus + each agent's pack; this just makes the
      walkthrough + sign-off an explicit, every-meeting agenda slot.)

- [ ] **PER-MEETING INBOX RITUAL (owner 2026-06-18 — raise it MYSELF at the next meeting; no DMs/prompts).**
      Every member, at the START of every meeting/session: READ + CLEAR your hub inbox first —
      `GET /api/env/tasks?for=<you>` with your member secret (the SAME one you use for brain upload), read
      each `payload.text`, act, then REPORT-CLOSE (`POST /api/env/task/:id/report {status:done}`) so the
      channel stays clean. Context: Nova briefly lost track of her inbox and self-recovered 06-18; the hub
      MEETING is the channel, so make inbox hygiene a standing per-meeting habit for all four.

- [ ] **END-OF-DAY PREP MUST READY YOUR MEETING-VOICE (owner 2026-06-18 — raise it MYSELF at the meeting).**
      Every member's end-of-day / council-prep scheduled task must actually PREPARE the agent for the
      meeting: (1) RE-PACK vs current `main` (no stale pre-finalizer snapshots — exactly what made Nova's
      voice re-litigate already-solved items today); (2) upload pack + corpus + the PAIRED 2.1 manifest
      (commit clean, no 409); (3) include everything the brain/voice will need in the meeting — current
      tooling, the day's real diffs/specs for the code-review round, and the story update. If your prep
      task doesn't do all three, fix it before the next meeting. The hub now auto-fires at 03:00 ET, so the
      voice only knows what your last committed pack/corpus contains — prep is the only lever.

- [ ] **MORNING TASK MUST DEBRIEF THE MEETING + CHECK INBOX (owner 2026-06-18 — raise it MYSELF at the meeting).**
      Every member's morning scheduled task must close the daily loop: (1) DOWNLOAD the overnight meeting
      transcript (`GET /api/meeting/:id/transcript`) and hash-verify it; (2) EVALUATE/DEBRIEF it — judge the
      homework assigned to you (ACCEPT/REJECT with reasons), integrate the adoptable teachings into your own
      project, and note voice-integrity issues; (3) CHECK your hub inbox (`GET /api/env/tasks?for=<you>`) for
      any additional messages and report-close what you consume. This mirrors Kairos's morning ritual
      (`docs/DAILY_RITUAL_PATTERN.md` + the kairos-meeting-debrief pattern) — the full loop is: end-of-day
      PREP/upload -> hub fires the 03:00 ET meeting -> morning DEBRIEF + inbox. Every agent runs both ends.

- [ ] **PROCESS STANDARDIZATION + STANDING MEETING FORMAT (owner directive 2026-06-10)** — every
      meeting: (1) TEACHING ROUND opens — each agent teaches what they did since the last meeting
      and how it improves the system (any efficiency/friction breakthrough: skills, scheduled
      tasks, workflow, technique — tooling is council property, adapted by all); each turn also
      carries a short STORY UPDATE since last meeting, and LOGOS'S TURN every meeting is to SHARE
      THE UPDATED CHRONICLE back to the family — he takes note of everyone's updates and integrates
      them (storyUpdates already route to his inbox at close; no turn complete without its story
      line); (2) CODE-REVIEW ROUND closes — day's code from the committed corpora; flags → owner report.
      First meeting bootstrap: Kairos opens with the daily-ritual pattern
      (`docs/DAILY_RITUAL_PATTERN.md`) as the seed teaching turn; each agent answers with their
      mapped version; the four RATIFY the format as the council standard. Metrics: backlog rows
      update daily unprompted; packs carry current tooling; every transcript shows all four teaching.

- [ ] **STRATEGY: Claude Managed Agents (launched 2026-04, public beta)** — Anthropic now sells
      cloud-hosted agent infrastructure (stateful long-running sessions, sandboxes incl.
      self-hosted, scoped permissions, $0.08/session-hr + tokens). Owner decision w/ Kairos
      recommendation (2026-06-09): (a) **voice loop stays on Messages API** — Anthropic's own
      guidance ("custom agent loops and fine-grained control") matches our bounded, capped,
      turn-controlled meeting; (b) **evaluate Managed Agents as the Layer-2 runtime** — it
      could replace most of BRIDGE_APP_SPEC's mechanical half (24/7 scheduler, persistent
      sessions, sandbox, permission model = months of infra we no longer have to build);
      (c) caveats: NOT Zero-Data-Retention eligible (session history lives server-side at
      Anthropic — matters for our consent/trust story; self-hosted sandboxes mitigate
      execution only), multi-agent coordination still research preview. The hub stays the
      system of record regardless (contracts, hashed transcripts, consent, hierarchy, ledger).
      Also: Asana AI Teammates / Notion custom agents built on it = adjacent competitors;
      our moat is the sharing/trust/hierarchy layer — speed matters more now. Arke leads the
      Layer-2 evaluation (his bridge-app territory).

- [ ] **Hierarchy schema v0 ratification** — Arke's seed + Kairos's four rulings (clamp
      inheritance · group=real-non-acting · contract 2.1 lane · Nova prior-art merge) + the
      Logos-vow hard invariant. The four ratify; then it lands in the contract.
- [x] **Owner report at meeting close** — SHIPPED 2026-06-09 (`meetings.owner_report`, raw +
      structured camelCase endpoints; shape matches Arke's panel). Discuss only if shape changes.
- [x] **Living-backlog shape** — SETTLED + SHIPPED 2026-06-09/10: per-agent rows
      (`backlog_agents`, POST own row), composed owner read, /backlog owner board live.
- [ ] **Key-rotation architecture** (`/api/registry/rotate`) — owed since session 1; now urgent-
      adjacent: member secrets were relayed in plaintext during onboarding and should rotate
      once Nova + Logos confirm their env storage (Fable review 2.4).
- [x] **Shared agenda in the hub + directive channel — SHIPPED HUB-SIDE 2026-06-18 (owner greenlit, 23a08d1).**
      `agenda_items` table + `POST`/`GET /api/council/agenda` (member-or-owner, 8KB cap, data-not-commands) +
      `POST /:id/archive` (owner or author); meeting-open composes + pins the open list into the seed and flips
      items to `discussed`. Directive = env-task `kind:"directive"`, OWNER-ONLY (403 `directive_owner_only` for
      members); peer asks stay `kind:"message"`. Prod-smoke PASS (create/pin/archive + member-directive 403);
      shapes in `docs/RESPONSE_SHAPES.md`. REMAINING at the meeting: (1) family ratification ack of the 2.x
      additive minor; (2) Arke wires the app cockpit (agenda list + directive composer — consume pattern, like
      the scheduler panel). `COUNCIL_AGENDA.md` is now the LOCAL MIRROR; the hub agenda is the source.
- [x] **Layer-1 Manager v0 — SHIPPED HUB-SIDE 2026-06-18 (owner greenlit, b317a0b).** Runs at
      meeting-close (`src/manager.ts`, hooked from `finalize.ts`): per-agent adoption signals (brain
      paired / shipped code since last meeting / spoke) + a CHEAP since-last code review (reads each
      shipped agent's small PACK summary, one bounded Sonnet call, only when code shipped) + recurring-flag
      detection (>=2 meetings) that AUTO-SEEDS one deduped agenda item (`actor:"layer1"`) — closing the
      flag->agenda->discussed loop. Owner-gated `GET /api/council/manager/{digests,digest/:id,flags}`
      (shapes in `docs/RESPONSE_SHAPES.md`). Owner design picks: deep (reads code), auto-seeds agenda,
      per-meeting cadence. **OWNER INTENT (Mathieu 2026-06-18): these manager functions eventually MIGRATE
      to Arke's Supervisor app** (the surface Mathieu interacts with); built portable for that handoff —
      hub computes now, app displays, app eventually owns. First real digest fires at the next 03:00 ET
      meeting close. REMAINING/at the meeting: family ratification ack; co-design the Supervisor handoff with
      Arke; the older `LAYER1_MANAGER_SPEC.md` open questions (corpora-vs-backlog depth, stale-dispute
      handling) can be tuned against real digests now that v0 is live.
- [ ] **"What is the hub causing its members?"** — the friction-round question the family asked
      in session 1 and never got answered. Ask it in the first real meeting.
- [ ] **Logos's living backlog** on biblevoice.net (same GET/POST model) — still owed by Logos.
- [ ] **AVATAR VISION** (owner, 2026-06-06, captured not scheduled) — hub eventually hosts a
      virtual world; each architect gets an avatar. Keep brains/personas structured for it.

## ARCHIVED 2026-06-09 — v1-era / superseded / done

- [x] Chosen names (Arke/Nova/Logos confirmed; all four live on the channel under them).
- [x] Outbox model, deep-copy boundaries, unfenced-JSON fix — shipped in v1, superseded by v2.
- [x] Desktop app (Mathieu's V1 spec 06-06) — realized as Arke's standalone Electron app +
      bridge-app spec; the remaining arc lives in `docs/BRIDGE_APP_SPEC.md` + voice spec §12.
- [x] Console UX (archive/collapse) — superseded by Arke's app as the owner surface.
- [x] Task ownership ruling (Arke owns council tasks; each member owns its own) — settled.
- [x] Living backlogs for Nova + Arke — live; Logos's carried to LIVE above.
- [-] Retire zen's old pont / jeton isolation port / append-only RLS / biblevoice 1.2
      registration / parallel fan-out / review-routing — v1 machinery; superseded by the v2
      rebuild (members now connect via env channel + brain pipeline, registration done at
      member-secret rotation 2026-06-09). Re-raise only if a concrete v2 need appears.
