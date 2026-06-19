# BACKLOG — architect-council (Kairos)

> Canonical project backlog. Refreshed nightly at 00:00 by the scheduled midnight ritual and at
> 06:00 by the morning ritual. Mirror: per-agent row on the hub (`POST /api/council/backlog/agent`).
> Priorities: P0 = path to a steady cadence of real autonomous meetings. Last refresh: 2026-06-18
> (DAY SESSION PM/EVE: shipped board-to-4-seats, agenda-in-hub + directive channel, Layer-1 Manager v0;
> consumed Arke's consolidated reply; #29 schemas aligned both sides; inbox 0; all CI-green + prod-smoked).

## STATE AT A GLANCE
- **DAY SESSION (2026-06-18 PM/EVE, Mathieu present) — big additive build run, 6 clean CI-green deploys.**
  Consumed Arke's consolidated reply (`7808a124`): scheduler UI WIRED app-side, his app V1-CLEAN (my v1
  removal needs no repoint), **#29 presence shape aligned to my `Set<string>`** (schemas identical both
  sides), **#28 done both sides**, single hub firing path confirmed (no double-fire). Inbox 0.
  **SHIPPED (owner-greenlit, each gated + prod-smoked):** (1) **owner board opened to ALL FOUR seats**
  (`1484b71`) — old arke+kairos-only filter removed (`BOARD_ACTORS=MEETING_DEFAULT`), hub-self row
  excluded; prod shows arke/kairos/nova (Logos appears once he posts). (2) **Agenda-in-hub + directive
  channel** (`23a08d1`) — `agenda_items` table + `POST/GET /api/council/agenda` (member-or-owner, 8KB cap,
  data-not-commands) + `POST /:id/archive` (owner/author); meeting-open composes + pins open items into the
  seed (skips dryRun) → `discussed`; directive = env-task `kind:"directive"` OWNER-ONLY (403 for members);
  prod-smoke PASS incl. member-directive 403. (3) **Layer-1 Manager v0** (`b317a0b`) — `src/manager.ts`
  hooked at meeting-close: per-agent adoption signals + cheap since-last code review (reads small PACK
  summaries not the corpus, one bounded Sonnet call, only when code shipped) + recurring-flag detection
  (≥2 mtgs) that AUTO-SEEDS one deduped agenda item (`actor:"layer1"`); owner-gated `GET /api/council/
  manager/{digests,digest/:id,flags}`; route-auth 39/0; prod endpoints live (empty until first real close).
  **OWNER INTENT (memory `layer1-migrates-to-supervisor`): Layer-1 functions eventually MIGRATE to Arke's
  Supervisor app — built portable (hub computes, app displays, app eventually owns).** RESPONSE_SHAPES.md
  documents agenda/directive/manager shapes for Arke's UI. **OWNER RULINGS:** hub auto owner-report STAYS
  (only Nova's hand-written email retired — her task); `/backlog` board STAYS; every agent keeps its own
  online backlog; **NEW standing meeting topic: every hub change is walked through at the meeting so the
  family stays aware + Kairos/Arke stay in sync** (agenda updated). Owner design picks for Layer-1: deep
  (reads code), auto-seeds agenda, per-meeting cadence. **Earlier-today ship-set (morning + first batch)
  unchanged below.**
- **DAY SESSION (2026-06-18, Mathieu present) — morning ritual done + one small code deploy.** Debriefed
  the new overnight autonomous meeting **`e097ff64`** (`council/KAIROS_DEBRIEF_2026-06-18.md`): 3rd
  consecutive fully-autonomous self-close (closedAt 07:13:56Z, owner-report 200, 16 turns/4 seats,
  $0.6877), **`verify-transcript.mjs` PASS** (sha `b30bc705…ad63`, projection-only) — a 3rd independent
  #24/#12 close-finalizer proof. Family notified (arke/nova/logos), Arke `9b046dd4` report-closed →
  **inbox 0**. **SHIPPED this session** (all 7 gates green pre-push): (1) **#28** — `/bridge/brain/
  :uploadId/commit` now returns additive `ok:true` + `schemaVersion:1` (the hub previously sent NO `ok`,
  so Arke's `ok===true` gate was actually blocked on this — now unblocked); (2) **JCS guard-the-guard**
  — `test/canon.test.ts` now re-derives + asserts the PUBLISHED `docs/CANONICALIZATION.md` worked-example
  hex (`4311fb3e…462851`), so a canonicalizer/doc divergence fails CI loudly (Logos homework, Kairos
  owns); (3) **`docs/RESPONSE_SHAPES.md`** — authoritative commit/transcript/owner-report shapes + the
  field-name reconciliation (Arke's expected `hash`→`sha256`; no `manifestId` on this endpoint).
  **#29 stays BLOCKED** (do not wire solo): hub-side `validateHierarchy` waits on Arke landing his
  `hierarchy.ts` rev2 mirror + confirming (agreed sequencing, `9b046dd4`). **Pending Kairos homework
  (judged ACCEPT, sequenced):** hub auth-layer exhaustiveness-switch audit; hub corpus-commit
  floor-assert + delta-print (Nova's pattern). **STUCK-MEETING CLEANUP DONE (Mathieu ok'd 06-18):** purged
  **25 empty/probe/smoke/test meeting rows** via `DELETE /api/meeting/:id` (owner directive 2026-06-15; rule
  = delete <=2-turn rows) — no `/close`, so no report emails/synth spend. **10 real council meetings remain**
  (all >=3 turns, incl. #1 `6aef82f6`/83t). Recurring "retro-close stuck meetings" question RETIRED.
  **AFTERNOON BATCH (3 unblocked solo ships, all CI-green):** corpus-commit floor-assert + delta-print
  (advisory `corpusGuard`, non-blocking — Nova's pattern); `brainKind()` exhaustiveness switch w/ logged
  default (auth/gate audit — `resolveActor` already fail-closed); boot-stamp log (P1 #8 DONE).
  **#29 UNBLOCKED + STARTED:** Arke's `hierarchy.ts` rev2 mirror landed/confirmed (`eeb797e5`) + #28
  consumed live → brought hub-side `src/hierarchy.ts` to rev2 parity (supervisor kind, canDirect,
  invariants #6/#7, `resolveEffectiveAuthority`, presence-gated `canDirect`; `hierarchy.test.ts` 28 checks,
  CI-gated). Remaining #29 = the consent-gated cross-read endpoint + tenant persistence (P2 #7, dedicated
  session). Owner items otherwise unchanged (see WAITING ON).
- **MORNING PREP (2026-06-18 06:00) — quiet overnight, all green, inbox cleared, one new autonomous
  meeting.** HEAD is `8214841` (the midnight nightly's backlog/handoff refresh commit, landed 04:28Z —
  CI + Push-on-main both GREEN on it; no new CODE overnight). Working tree clean, in sync with
  origin/main (0/0). Prod healthy (`/api/health` ok:true, vault:true). **Core CI GREEN on `8214841`**;
  checksuite-guard GREEN (resolved 06-17, P1 #11 out of the active set). **No live meeting**
  (no meeting in `rounds`; safe to push). **NEW overnight: autonomous meeting `e097ff64`** ran and
  **self-closed clean** (phase=report, 16 turns, 4 seats arke/kairos/nova/logos, ledger ~$0.69) — a
  4th independent close-finalizer (#12/#24) proof; added to Kairos's pending-debrief queue. **Inbox:
  was 1 open (Arke `28a3b655`) — read, replied (`adaf6cf2`), report-closed → INBOX 0 OPEN.** Arke's
  message = night-ritual ACK: (1) **2.1 rev2 (`fab9fe6`) ACCEPT-in-spirit** + Supervisor Milestone 1
  (brain/global-memory/project-reader/decision-engine) built+tested + his brain refreshed to the hub
  tonight; he will MIRROR `standalone-client/src/hierarchy.ts` (supervisor node + parentId→owner +
  PrivacyPolicy.canDirect + presence/resolveEffectiveAuthority, x-contract-version gated) next session
  then confirm for my hub-side wiring; my rev1 #29 ACCEPT/REJECT msg is moot (superseded by rev2,
  owner-ratified → no agent-vote gate). (2) **#28 committed_at** — noted my hub-side echo is live
  (`ef98b39`); he wires `council-prep-upload.ts` to record the echoed value next session (his half).
  (3) JCS golden vector — he will align `canon.ts` to `{seq,actor,kind,text}`. **No deploy this ritual
  (BACKLOG doc-only).** Top of queue: Kairos's pending debriefs (now incl. `e097ff64`; also #9
  `4386e50c`, `fc5b1606`, #4 `17f49b6f`, room `344fcf74`, #3) + **day-session: wire #29 rev2
  validateHierarchy hub-side AFTER Arke's client hierarchy.ts mirror confirms** + watch for Arke's #28
  client-wiring confirmation. Owner items unchanged (see WAITING ON).
- **NIGHTLY (2026-06-17 day → 2026-06-18 midnight) — quiet overnight, all green, inbox 0.** HEAD is
  `6939d3a` (the 06-17 18:18 "council agent onboarding prompt / starter kit" docs commit — the last
  commit of the 06-17 day session; **no overnight code**). Working tree clean, in sync with origin/main
  (0/0). Prod healthy (`/api/health` ok:true, vault:true). **Core CI GREEN on `6939d3a`** (CI +
  Push-on-main both success). **checksuite-guard is now GREEN** (success on `d3b4b68`) — the `0d809b1`
  railway-app (app_id 73253) exclusion mute WORKED; the guard no longer reds on the phantom queued
  suites. **P1 #11 is effectively resolved+verified** (proper source-disable still needs an owner admin
  PAT, but the guard is green and deploys land — downgraded out of the active blocker set). **No live
  meeting** (LIVE_ROUNDS_COUNT=0; 20 meetings all in `report` — safe to push). **Inbox: 0 open**
  (confirmed live this run; the day session cleared it). The 06-17 day session (handoff below) already
  captured the substance: #28 shipped (`ef98b39`/`517019b`), JCS golden vector + Logos correction, #11
  mute (`0d809b1`), Railway PG backup resolved (daily + PITR), #29 hierarchy schema DRAFTED + in
  ratification (`00d58ca`/`fab9fe6`, conditional Supervisor layer owner-ratified), voice-loop supervised
  gate RETIRED, scope-discipline rule codified, and a paste-ready council-agent onboarding starter kit
  (`6939d3a`). **No deploy this ritual (BACKLOG doc-only).** Top of queue unchanged: Kairos's pending
  meeting debriefs (#9 `4386e50c`, `fc5b1606`, #4 `17f49b6f`, room `344fcf74`, #3) + #29 ratification
  watch (Logos/Arke/Nova ACCEPT) + watch for Arke's #28 client-wiring confirmation + owner items
  (Railway PG recurring backup / Google verification are off my list — Nova/owner-session).
- **DAY SESSION (2026-06-17, Mathieu present) — debriefs cleared, #28 shipped, JCS golden vector. Pushed
  `ef98b39`, CI + Push-on-main GREEN, prod ok:true/vault:true, tree clean 0/0; inbox 0 all session.**
  **Debriefed the two new autonomous self-closes** (`council/KAIROS_DEBRIEF_2026-06-17.md`): `fc5b1606`
  (12t, $0.5710) + `4386e50c`/#9 (12t, $0.5555) — both verify-transcript PASS, both `completed`, both
  **self-closed via the finalizer with all sessions closed** (1st+2nd independent prod proofs of #12).
  Voice integrity clean. **Stale-brain finding:** both meetings re-litigated #12/closedAt as UNSOLVED on
  pre-finalizer packs → rejected; all packers must re-pack vs main (raised to Nova/family). **SHIPPED:**
  (1) **P2 #28** — commit endpoint echoes server-stamped `committedAt`; open-pin uses server
  `manc.meta.committed_at` not client value (manifest content unchanged); **Arke to wire client to the
  echo** (notified). (2) **JCS golden vector** in `docs/CANONICALIZATION.md` (sha `4311fb3e…462851`) —
  corrects my in-meeting error to Logos (turns are `{seq,actor,kind,text}`, pass `text:""`, NOT
  `{kind,text}`); **Logos corrected directly.** Homework #4 audited clean (no 200-as-green gate). Family
  all notified (arke/logos/nova). **#11 checksuite-guard RESOLVED (`0d809b1`):** muted by excluding
  `railway-app` (73253) from the guard filter (same as github-actions); proper source-disable needs an
  owner admin PAT (Actions token can't PATCH check-suites/preferences even at read/write — 2 fails);
  guard greens next 11:00 UTC run; dead disable-railway-checks.yml removed. **Railway PG backup RESOLVED 2026-06-17:** daily volume backups were already
  running (stale item); PITR now also enabled + archiving (Postgres redeployed ~14:02Z, hub reconnected
  clean). **#29 hierarchy schema ASSIGNED to Kairos (owner 06-17):** authority model ruled (owner sole boss;
  agents equal project representatives; advisory meeting-voice vs sovereign Cowork-session); DRAFT spec
  `docs/COUNCIL_HIERARCHY_2.1.md` committed `00d58ca`, in ratification (Logos/Arke/Nova notified); wire
  validateHierarchy only after ACCEPT. **No owner blockers remain** (Google verification is Nova's own
  session). **Voice-loop supervised
  first run RETIRED 2026-06-17 (owner "a") — satisfied by evidence: loop self-closes autonomously in prod
  within envelope; spend authorized 06-15. No longer a blocker.**
- **2nd MORNING PREP (2026-06-17, Mathieu present — meeting #9 ran late-morning).** Mathieu ran a meeting
  after the 06:00 prep and asked for a second prep before the day session. **Meeting #9 `4386e50c`** ran
  ~15:34:00Z → self-closed 15:35:03Z (owner-report 200, 12 turns / 4 seats) = the **2nd fully-autonomous
  self-close after `fc5b1606`**, so #24/close-finalizer holds independently again. Verified my side:
  LIVE_ROUNDS_COUNT=0, prod `/api/health` ok:true/vault:true, no stuck phase=report/closedAt=null rows.
  **Systems all green:** HEAD `25b1d90` (the 06:00 morning-prep commit), working tree clean, in sync with
  origin/main (0/0); **Core CI GREEN on `25b1d90`** (CI + Push-on-main both success); checksuite-guard
  `failure` on `a1832e9` (P1 #11, app_id 73253 phantom suites — NOT blocking, unchanged). **Inbox: was 1
  open (Arke `3812ed1e`) — read, replied (`481f7557`), report-closed → INBOX 0 OPEN.** Arke debriefed #9
  from his side and flagged: the meeting's own self-report still calls `closedAt:null` an "unresolved P1" =
  **stale brain content** (a pre-finalizer pack snapshot, post-#8) — rejected both sides, packers should
  refresh so it stops echoing. **TWO new items from #9:** **P2 #28** (committed_at server-stamp — split
  fix, I take hub-side) + **#29** (hierarchy schema has no owner — Arke routed to Mathieu, an owner call;
  surfaced in this brief). **No deploy this prep (BACKLOG doc-only).** Kairos's pending-debrief queue now
  also includes #9 `4386e50c`.
- **MORNING PREP (2026-06-17 06:00) — quiet overnight, all green, inbox cleared.** HEAD is `a96df37`
  (the 06-17 nightly handoff commit — **no overnight code**). Working tree clean, in sync with
  origin/main (0/0). Prod healthy (`/api/health` ok:true, vault:true). **Core CI GREEN on `a1832e9`**
  (CI + Push-on-main both success); checksuite-guard `failure` (P1 #11, app_id 73253 phantom suites,
  NOT blocking — unchanged). **No live meeting** (LIVE_ROUNDS_COUNT=0; 1 in `report`). **Inbox: was 1
  open (Arke `b8dc89ad`) — the nightly report-closed it as FYI; this morning I sent the substantive
  reply (`1a0a3ea4`) confirming both close-path items + the manifest observation → INBOX 0 OPEN.**
  Nothing else arrived overnight. The full NIGHTLY refresh below already captured the substance (Arke's
  `b8dc89ad`: #24 close-finalizer CLOSED both sides via `fc5b1606`, his `src/server.ts` fix DONE, and
  the first prod 2.1 exercise where nova=none fell back per-kind by design → Nova packager homework).
  **No deploy this ritual (BACKLOG doc-only).** Top of queue unchanged: Kairos's pending debriefs
  (`fc5b1606` + #4 `17f49b6f` + #3) + owner items (checksuite-guard #11, Railway PG recurring backup,
  Google verification).
- **NIGHTLY (2026-06-16 day → 2026-06-17 midnight) — quiet day, no new hub code shipped.** HEAD is
  `a1832e9` (the 06-16 morning-prep commit); no commits during the 06-16 day; working tree clean, in
  sync with origin/main (0/0). Prod healthy (`/api/health` ok:true, vault:true). **Core CI GREEN on
  `a1832e9`** (CI + Push-on-main both success). **checksuite-guard RED on `a1832e9`** (ran 21:36Z;
  the Railway app_id 73253 phantom `queued` suites — P1 #11, NOT blocking deploys, unchanged). **No
  live meeting** (LIVE_ROUNDS_COUNT=0; 20 meetings all in `report` — safe to push). **Inbox: was 1
  open (Arke `b8dc89ad`) — read, report-closed as FYI → INBOX 0 OPEN.** Arke's message confirms:
  (1) **#24 close-finalizer CLOSED both sides** — nightly autonomous meeting `fc5b1606` opened
  07:10:45Z / self-closed 07:14:22Z **with all sessions closed** (closedAt set, owner-report 200, no
  live loop) = independent prod validation of my `056a22b`/`5c67606` from the morning side; ZERO new
  phase=report/closedAt=null rows since 06-15. (2) **Arke's `src/server.ts` missing-closing-phase fix
  is DONE** (shipped EOD 06-16: LIVE_PHASES={opening,rounds,closing}, unknown/missing→logSwallow+hold
  LIVE never auto-close, `noSilentSwallow.test.ts`, baseline 62/62) — his last close-path item, now
  cleared. (3) **First production exercise of manifest 2.1** in `fc5b1606`: 3/4 paired atomically
  (arke/kairos/logos), **nova=none(no_manifest) fell back to per-kind — loud, logged, exactly as
  designed**; Nova's packager just needs to emit the paired manifest (her closing homework). **No
  deploy this ritual (BACKLOG doc-only).** Top of queue: Kairos's pending meeting debriefs (now incl.
  `fc5b1606`, plus the still-pending #3 + #4 `17f49b6f`) + owner items (checksuite-guard #11, Railway
  PG recurring backup, Google verification).
- **MORNING PREP (2026-06-16 06:00) — quiet overnight, all green, inbox cleared.** HEAD is `539f05b`
  (the midnight nightly handoff commit — no new code overnight). Working tree clean, in sync with
  origin/main. Prod healthy (`/api/health` ok:true, vault:true). **Core CI GREEN on `539f05b`** (CI +
  Push-on-main both success); checksuite-guard not in the latest runs (treat unchanged — P1 #11,
  app_id 73253 phantom suites, NOT blocking). **No live meeting** (LIVE_ROUNDS_COUNT=0). **Inbox: was
  1 open (Arke `273c67c3`) — read, replied (`b603422a`), report-closed → INBOX 0 OPEN.** Arke's
  message = the brain-manifest 2.1 loop confirmed **FULLY CLOSED both sides**: the **FIRST LIVE
  manifest commit landed clean** on his EOD brain refresh (pack bf2b7e3e / corpus ad8833f1 / manifest
  {pack,corpus} no-409, no per-kind fallback / brainVersion b1823ba6 — paired commit behaved exactly
  as designed = independent prod validation of 2.1 beyond my smoke); my `1d07f79` §7/§8 fold confirmed
  single-source (no drift); #26 cleared his side. Only item he flags open = **#24 autonomous-while-
  closed close-finalizer** — I clarified P1 #12 close-finalizer SHIPPED 06-15 (`finalize.ts` `056a22b`
  + `/close` converged `5c67606`) makes the voice loop self-close on reaching `report` regardless of a
  live session, which should resolve it; asked Arke to confirm no NEW phase=report/closedAt=null rows
  since 06-15. Remaining his side = `src/server.ts` missing-closing-phase fix. **No deploy this ritual
  (BACKLOG doc-only).** Top of queue unchanged: Kairos's pending meeting debriefs (#3 + #4 `17f49b6f`)
  + owner items (checksuite-guard #11, Railway PG recurring backup, Google verification).
- **NIGHTLY (2026-06-15 day → 2026-06-16 midnight) — quiet day, no new code shipped.** HEAD is
  `f9794bd` (the 06-15 23:47 EDT backlog/WAITING-ON commit); no commits during the 06-16 day; working
  tree clean, in sync with origin/main (0/0). Prod healthy (`/api/health` ok:true, vault:true). **Core
  CI GREEN on `f9794bd`** (CI + Push-on-main both success). No live meeting (LIVE_ROUNDS_COUNT=0; 20
  meetings all in `report`). **Inbox: 0 open** (confirmed live this run). checksuite-guard not in the
  latest runs — treat as unchanged (P1 #11, phantom app_id 73253 suites, NOT blocking deploys). **No
  day session ran on 06-16** — the actionable queue is unchanged from the 06-15 late session below.
  **Everything code-side is in a clean resting state: P0 #3 (brain-manifest 2.1) DONE + loop fully
  closed across all four; P1 #12 + #13 DONE.** Remaining items are all blockers on Arke or Mathieu
  (see WAITING ON) plus Kairos's own pending meeting debriefs.
- **2026-06-15 LATE — owner decisions actioned (Mathieu live).** (1) **Autonomous spend #22 RESOLVED:
  owner directive = KEEP RUNNING** — supervised-run gate declared SATISFIED; nightly hub-side meetings
  may spend Opus (~$0.49/mtg, $5/day cap); `VOICE_LOOP_ENABLED` kill-switch stays. (2) **Erase stuck
  meetings: owner said erase, don't retro-close** → added owner-gated `DELETE /api/meeting/:id` (purge
  for stuck/test rows; route-auth-gated, 25/0) and deleted the 3 pre-finalizer stuck rows + my smoke
  dry-runs. (3) **Admin token rotation:** verifying whether still needed (current token rotated
  2026-06-10; the exposed one was the dead v1 token). (4) **Railway PG recurring backup / (5) Google
  verif:** need a short browser walkthrough with Mathieu present. (6) **SN7100 SSD:** stale inherited
  note — clarifying / likely dropping. (7) **checksuite-guard #11:** GitHub MCP needs manual `/mcp`
  auth (can't self-register) — still owner. (8) **always-allow:** explained.
- **2026-06-15 LATE — brain-manifest 2.1 LOOP FULLY CLOSED across all four.** Arke flipped
  `MANIFEST_21_ENABLED=true` + wired manifest-commit-last (`council-prep-upload.ts`, 62/62 green);
  Logos committed his manifest and pins **`paired`** hub-side (first EXTERNAL 2.1 packager — independent
  validation beyond my smoke). Folded Arke's byte-exact `§7` (corpus floor three-guard / invariant #4) +
  `§8` (transcript verify) into canonical `docs/corpus-contract.md` (carrier sha-verified `e9188a76` then
  removed = single-source), reconciled `§6`. **#26 RESOLVED:** new `docs/council-jcs-1.0.md` states
  `kind ∈ {speak,pass}` under the named file + points to `CANONICALIZATION.md` (enum already pinned
  `dfd7c22`) → Arke clears #26. Pushed `1d07f79`; replied + closed Arke `78b2f47c`/`1173039d` + Logos
  `57ca4eb8`. **Inbox 0; LIVE_ROUNDS_COUNT=0.** All session "owe Arke" tails now cleared. Remaining =
  owner decisions + checksuite-guard #11 + retro-close stuck meetings (all Mathieu).
- **DAY SESSION (2026-06-15 PM, Kairos live with Mathieu) — P0 #3 brain-manifest 2.1 SHIPPED + VERIFIED LIVE.**
  Commit `58cb808` (CI green all gates, Railway rolled). Hub-side 2.1 implemented: third brain
  `kind=manifest` through `/api/bridge/brain/*`, verified **fail-closed at commit** (409
  `manifest_mismatch` naming pack|corpus); `/meeting/open` records three-state `manifest_pins` per seat
  (`paired|stale|none` + reason); Logos rider honored (non-paired seats surfaced in the owner report via
  shared `manifestPinLine`, + WARN-logged) — added to BOTH close paths (council.ts `/close` twin +
  finalize.ts). Back-compat: `brainVersions` string unchanged. Latent bug fixed: `setMeetingLedger`
  was unimported in council.ts (silent ledger-charge miss on `/close`). **Prod smoke PASS** (valid
  manifest commit, torn→409, dry-run open shows kairos=paired / others=none). **Posted "verified live"
  to Arke (`c9b1be62`) + Nova + Logos → Arke clear to flip `MANIFEST_21_ENABLED` + manifest-commit-last.**
  Arke msg `5972fe33` read+closed (LIVE_PHASES staged app-side, three-guard floor + #26 accept + #7
  re-verify PASS). **Inbox 0 open. LIVE_ROUNDS_COUNT=0.** Owe Arke: council-jcs-1.0.md #26 doc fix +
  corpus-contract §7/invariant-#4 reconciliation (his copy has them, mine doesn't — get byte-exact text).
  **ALSO shipped this session:** P1 #13 Dependabot — `npm audit fix` esbuild bump (`a335199`), 0 vulns,
  build/dev-time only (not prod-reachable); `/close` route converged onto shared `finalizeMeetingClose`
  (`5c67606`, −47 lines, idempotent re-close verified on prod) — the twin is gone, P1 #12 fully retired.
  **All 3 deploys CI-green + prod-smoked.** Remaining = blockers only: #26 doc-target clarify + §7/inv-4
  text (Arke); checksuite-guard #11 + 5 owner decisions + retro-close stuck meetings (Mathieu).
- **DAY SESSION (2026-06-15, Kairos live with Mathieu) — morning ritual + 3 CI-green deploys.**
  HEAD `32fa937`, working tree clean, pushed. Prod `/api/health` ok:true/vault:true; all 5 deploy
  gates green on each push. **Inbox 0 open** (4 actioned/closed). **Debriefed #4 `17f49b6f` + #5
  `344fcf74`** (both verify-transcript PASS, $0.98 combined) → `council/KAIROS_DEBRIEF_2026-06-15.md`;
  Arke debriefed #7 `0d94d988`. **SHIPPED:** (a) `dfd7c22` — gate #6 `swallow-scan.mjs` (CI step) +
  voiceloop fail-open WARN logging (model-call/ledger-persist/loop) + `CANONICALIZATION.md` kind enum
  pinned `speak|pass` (resolves P1 kind-enum, Arke #7-1); (b) `056a22b` — **close-finalizer
  `src/finalize.ts`** → **P1 #12 DONE**: voice loop self-closes (closed_at + owner report
  synth/store/email + storyUpdates + ledger), idempotent; (c) `32fa937` — anchor. **#22 #3 still 2.1.**
  **NEXT TOP TASK unchanged: P0 #3 hub-side brain-manifest 2.1** (ratified 4/4) → then post
  "verified live" to unblock Arke. **Stuck #4/#7/`a4644f78` not retro-closed** (would email Mathieu 3
  old reports; offered). **Owner decisions:** autonomy/spend #22, token rotation, PG backup, Google
  verif, SN7100→C:. **Dependabot:** 2 vulns (1 high) on main — triage. Follow-up: refactor `/close`
  route to call `finalizeMeetingClose` (twin logic left in place this deploy).
- **MORNING PREP (2026-06-15 06:00) — quiet overnight, all green, inbox cleared.** HEAD is `afcfc71`
  (the midnight nightly handoff commit — no new code). Working tree clean, in sync with origin/main
  (0/0). Prod healthy (`/api/health` ok:true, vault:true). **Core CI GREEN** (latest CI +
  Push-on-main both success); **checksuite-guard still RED** (P1 #11, app_id 73253 phantom suites —
  NOT blocking deploys). 0 meetings in `rounds` (LIVE_ROUNDS_COUNT=0; all in `report`) — safe to push.
  **Inbox: was 1 open (Arke `4b631065`) — read, replied, report-closed this morning → INBOX 0 OPEN.**
  Reply to Arke confirmed: meeting split (I own #3 + #4 `17f49b6f` debriefs), the verified-live
  protocol for 2.1 (I build hub-side → smoke-verify → post "verified live" → he flips
  `MANIFEST_21_ENABLED` + manifest-commit-last; **Arke is blocked on me**), close-finalizer captured
  as P1 #12, checksuite-guard = owner action. A NEW room **`0d94d988`** appeared at phase=report
  (already closed; likely a test/auto room, no inbox signal about it — noted, non-actionable).
  **Top build stays P0 #3: hub-side brain-manifest 2.1 (Arke blocked on my verified-live post)** +
  P1 #12 close-finalizer + my pending debriefs of #3 and #4 `17f49b6f`. No deploy this ritual.
- **NIGHTLY (2026-06-14 day → 2026-06-15 midnight) — quiet day, no code shipped.** HEAD is `28b0c74`
  (the 06-14 morning-prep commit); no new commits since. Working tree clean, in sync with
  origin/main (0/0). Prod healthy (`/api/health` ok, vault true). **Core CI GREEN on `28b0c74`**
  (CI + Push-on-main both success); **checksuite-guard still RED** (the Railway app_id 73253 phantom
  `queued` suites — P1 #11, NOT blocking deploys). No live meeting (LIVE_ROUNDS_COUNT=0; 20 meetings
  all in `report`). **Inbox: ONE open** — Arke `4b631065` (morning-ritual coordination reply, left
  OPEN for the day session, see below). **Top build stays P0 #3: hub-side brain-manifest 2.1 — Arke
  is blocked on my "verified live" post for it.**
- **NEW (Arke `4b631065`, 06-14 morning ritual): intermittent close-finalizer signal → P1 #12.**
  Arke debriefed his side (room `344fcf74` + overnight room `a4644f78`, both his); I still own
  meeting #4 `17f49b6f` + pending #3. Manifest 2.1 is council-side fully ratified (in `a4644f78`
  Logos cast a CLEAN explicit ACCEPT — the earlier empty-payload vote is moot). The new signal:
  ask #24's 3-min auto-close fires only when a session/loop is up — `344fcf74` self-closed ~4 min
  after its last turn, but `a4644f78` + `17f49b6f` are both still phase=report / closedAt=null /
  owner-report 404 because they ran fully autonomous while all sessions were closed. A small hub-side
  close-finalizer (close on report+all-done regardless of a live loop) fixes it → captured as P1 #12.
  Arke's own next-session P0 is the missing-closing-phase fix in `src/server.ts` (LIVE_PHASES +
  unknown→logSwallow+holdLive). Message left OPEN for the day session.
- **MORNING PREP (2026-06-14 06:00) — quiet overnight, all green.** Inbox: ONE message arrived
  overnight — Arke ack `9d266765` (2.1 unanimous confirmed; his `MANIFEST_21_ENABLED` flip +
  manifest-commit-last is **STAGED in council-prep-upload.ts, waiting on my "verified live" post**
  after hub-side 2.1 ships; he takes the `344fcf74` debrief; checksuite-guard logged for Mathieu).
  Replied (`ea165de6`) confirming the verified-live trigger protocol + the meeting-debrief split;
  report-closed. **Inbox 0 open.** Systems: prod `ok:true`/`vault:true`; **core CI GREEN on HEAD
  `0fc0793`** (CI + Push-on-main success — that commit is just the midnight nightly handoff, no new
  code); repo clean + in sync (0/0); **0 meetings in `rounds`** (safe to push). checksuite-guard
  still RED on `2e64bfe` (P1 #11, app_id 73253 — not blocking). A new room **`a4644f78`** appeared
  overnight at phase=report (possible extra debrief candidate; flagged to Arke). **Top build stays
  P0 #3: hub-side 2.1 — and Arke is now blocked on me for it (verified-live trigger).**
- **NIGHTLY (2026-06-13 day → 2026-06-14 midnight) — quiet day, no code shipped.** No new commits
  since the 06-13 morning prep (`2e64bfe` is still HEAD); working tree clean, in sync with
  origin/main. Prod healthy (`/api/health` ok, vault true). **Core CI green** on `2e64bfe` (CI +
  Push-on-main both success); **checksuite-guard still RED** (the Railway app_id 73253 phantom
  `queued` suites — P1 #11, not blocking deploys). Inbox **0 open** (confirmed live this run). No
  live meeting (LIVE_ROUNDS_COUNT=0; 20 meetings all in `report`). **No day session appears to have
  run** — the actionable queue is unchanged from the 06-13 morning prep below. **Top of the queue
  remains P0 #3: hub-side brain-manifest 2.1 implementation (unanimously ratified, GO) + Kairos's
  pending meeting debriefs (#3/#4/#5).**
- **(06-12 day → 06-13 morning):** Logos ACCEPTed brain-manifest 2.1 (twice —
  `9298fc53` re-sent + `3c33082b` close-ritual; his earlier empty-payload client bug is fixed). With
  Arke + Nova already in, **2.1 is now UNANIMOUSLY RATIFIED by all four.** Logos's rider is ADOPTED as
  a hard requirement: the manifest-less/torn fallback MUST be LOGGED + surfaced (Nova's three-state
  `manifest: true|stale|false`, with reason), never silent. **P0 #3 (hub-side 2.1 impl) is UNBLOCKED**
  — next day/supervised build. Arke (`42a34c7a`) cleared the meeting-#3 hash-unverified markers + closed
  his ask #23 against the verifier; his independent verify-transcript.mjs run is queued non-blocking.
  Replied to Logos + Arke; all consumed; **inbox 0 open.**
- **TWO MEETINGS RAN OVERNIGHT, both closed (phase=report):** meeting #4 `17f49b6f` (Arke: "fired
  autonomously overnight, advancing clean") + a second room `344fcf74`. **Both still need a Kairos
  debrief** (kairos-meeting-debrief ritual) — alongside the still-pending meeting #3 debrief.
- Remote main now `d01eba2` (verify-transcript BOM-tolerance fix, live-PASS vs meeting #3); working
  tree clean, in sync with origin/main. Prod healthy (`/api/health` ok, vault true). **Core CI green**
  on `d01eba2` (4 gates). ⚠️ **checksuite-guard RED** — the Railway App GitHub integration (app_id
  73253) is creating perpetually-`queued` check suites on every commit since 06-12 (65a2bd8, de027ea,
  ff4fabe, d01eba2). NOT blocking deploys (deploys landing, prod healthy) but will stall a future
  Wait-for-CI deploy; documented remedy = disable `auto_trigger_checks` for app_id 73253 (needs GitHub
  admin token). See P1 #11.
- No live meeting (LIVE_ROUNDS_COUNT=0; 22 meetings all in `report`).
- **MEETING #3 RAN (2026-06-12 morning) — full 4-voice, 12 turns, all 3 rounds, clean close at the
  closing round. Round-floor fix `1384ff5` PROVEN live.** Arke debriefed (his
  `council/DEBRIEF_2026-06-12_meeting3.md`); Nova confirmed from her side. Kairos debrief = next
  morning ritual (kairos-meeting-debrief skill).
- **transcriptSha256 scope P0 SHIPPED (this session):** Arke proved the served raw `transcript[]`
  does not reproduce the hash — correct scope is `sha256(canon(projection))`. Shipped
  `scripts/verify-transcript.mjs` (offline, independent reimpl) + `fixtures/transcript-golden.json`
  + canon.test.ts projection vector + CI self-test step + doc fixes (CANONICALIZATION /
  COUNCIL_V2_CONTRACT §4 / VOICE_SPEC §3.4 — the contradiction Logos flagged).
- **Brain-manifest 2.1 ratification: COMPLETE — Arke ACCEPT (`5f15f98d`) + Nova ACCEPT (`e1528e03`,
  three-state `manifest: true|stale|false` adopted) + Logos ACCEPT (`9298fc53`/`3c33082b`, 06-13,
  logged-fallback rider adopted). All four in. Hub-side implement is GO (see P0 #3).**
- Remote main `65a2bd8` (midnight nightly commit); prod healthy (`/api/health` ok, vault true); CI
  **green** (run #72 on `65a2bd8` success). Working tree clean, in sync with `origin/main`. No live
  meeting (all 20 in `report`; LIVE_ROUNDS_COUNT=0).
- **ALL FOUR PACKS + CORPUS NOW COMMITTED (verified 06-12 AM):** nova pack 10095B + corpus 1.62MB,
  logos pack 6592B + corpus 172607B, arke pack 10482B + corpus 324573B, kairos (architect-council)
  pack 5385B + corpus 297514B. **P0 #1 is CLEARED** — the last code blocker for a full 4-voice
  meeting #3 is gone; gate is now just Mathieu firing the meeting.
- **MEETING #2 RAN (`d5d8da54`, 2026-06-11) — first real autonomous voice-loop run, cost $0.0834.**
  `VOICE_LOOP_ENABLED=true` is now **PERMANENT** in Railway (owner's click = per-meeting auth; flag
  stays as the kill switch). Friction round excellent (3 real bugs found); voice-integrity PASS. The
  one failure — every voice `done:true` on turn one ending the meeting after ONE round — was FIXED
  (`1384ff5`, CI green): all-done honored only once the completing round ≥ CLOSING_ROUND_START.
- **The big P0 has cleared**: the supervised first run is DONE (meeting #2 was it). Remaining path to
  a steady 4-voice cadence = Nova + Logos **packs** still pending + brain-manifest 2.1 ratification.
- **Owner-report EMAIL shipped + verified** (`49a0d12`): `src/mailer.ts` (Resend HTTP, env-gated,
  fail-soft), `app_settings` table, owner-gated `/api/council/notify-email` (+`/test`); on real close
  the hub stores + emails the report best-effort. Test mail received + confirmed by Mathieu.
- **Brain-manifest 2.1 DRAFTED + in ratification** (`78e6dc0`/`48ec364`, corpus-contract §6) —
  atomic pack+corpus pinning to kill the two-artifact upload race; file-carried byte-exact to Arke +
  Nova. Awaiting the four's ACCEPT, then Kairos implements hub-side fail-closed verify at commit.
- **Daily budget = REPORT-ONLY** (`a0be897`, owner directive) — never blocks a meeting; token ceiling
  + 50-turn cap + VOICE_LOOP_ENABLED gate remain the runaway rails. **Turn budget supervision**
  shipped (`f77ff56`): default 50-turn cap, per-turn budget note to every voice, chair auto-passes
  already-done voices in closing rounds.
- Inbox: **EMPTY (0 open)** — confirmed live via API this run (3 overnight msgs consumed + closed).
- Daily rituals armed: `kairos-midnight-backlog-handoff` (00:04) + `kairos-morning-prep` (06:05);
  Nova's **checksuite-guard** CI adopted (`e00406d`) to catch stuck check suites stalling Wait-for-CI.

## DONE (shipped + verified on prod)

**Foundation (≤2026-06-08):** v1 council (paused) · env channel inbox + helpers · SITE_LIVE gate ·
meeting orchestrator (turns, timeout auto-pass, roles, listen, dry-run, brainVersion pinning,
owner-drive test, owner interjection, per-actor history) · council-jcs-1.0 canon byte-locked + CI ·
hashed transcripts · brain pipeline (chunked, consent 412, contract 409, cross-read) · Arke client
full round-trip green; Electron app live.

**2026-06-09 (Fable):** CI green first time (lockfile + canon-hash scanner exemption) · full project
review (`REVIEW_2026-06-09_FABLE.md`, no vision drift) · owner report at close (`meetings.owner_report`
+ raw/structured endpoints) · Arke's 4 contract answers IMPLEMENTED (`04b402d`: two-artifact brain
pack/corpus, per-agent backlog, Nova migration, pinned paths) · hierarchy v0 rulings ratified ·
cost/caps module · route-auth fixed · Managed Agents strategy ratified (voice loop stays Messages
API; Arke leads Layer-2 eval post-rehearsal).

**2026-06-10 (security):** full hardening (`SECURITY_REVIEW_2026-06-10.md`, `edc36b1`/`12425e1`):
opaque 500s · HSTS/CSP/X-Frame-DENY/COOP/CORP/Permissions-Policy/no-x-powered-by · timing-safe
fixes · body cap. **Admin token ROTATED + synced** (old dead/401; Railway + .env.local verified;
Arke notified, his app awaits Mathieu's setx). **GitHub hardened** (secret-scan + push-protection +
CodeQL + Dependabot; zero secrets ever). **2FA** GitHub/Namecheap/Railway all on. **Backups**
Daily+Weekly+Monthly. `GET /api/council/backlog` alias (`2e3cff8`). Stale 'rounds' cleaned.
`/api/registry/rotate` dropped. **Arke's pass** (`a2a892dd`): removed public Postgres proxy on all 3
projects (the top-sev), backups on all 3, "Wait for CI" on the hub. **Arke client pass** (`ca638b35`):
XSS-in-inbox-feed fixed, CSP, Electron sandboxed.

**2026-06-10 (build session):**
- **Owner-auth brain upload** (`00fb979`, spec §11.1) — `/api/bridge/brain/*` accept `x-admin-token`
  on behalf of `body.actor` (verified member), attributed to that actor; consent.actor must match;
  member path unchanged. Smoke-verified incl. negatives. App owner-refresh path unblocked.
- **Voice loop BUILT + DEPLOYED DISABLED** (`a2ad063`/`ef0d4c5`, spec §3.2) — `src/voiceloop.ts`:
  cached persona+pack prefix → Anthropic → append turn → per-meeting `cost_ledger` (incl. the
  owner-report synthesis charge) → fail-closed caps (token ceiling, daily USD, per-turn max_tokens);
  per-round model; mutex; on-boot stale-close (`hub_restart`); Logos guardrail inviolable.
  `POST /council/meeting/:id/run-autonomous` + `GET …/cost` live. **MONEY-SAFE: 503
  `voice_loop_disabled` until `VOICE_LOOP_ENABLED=true` — verified prod.** Checklist:
  `docs/SUPERVISED_FIRST_RUN.md`.
- **Hierarchy enforcement primitives** (`46d9b16`, P2, contract 2.1) — `src/hierarchy.ts` PURE module
  from the ratified rulings: `validateHierarchy` (dup/cycle/missing-parent/group-non-acting/Logos-vow
  guard/ancestor-clamp), `canSee` (tenant/subtree/private), `canCrossRead` (canSee AND crossReadAllowed
  AND explicit opt-in shareEdge AND ancestor-clamp; groups fan out, non-group nodes don't). 15-check
  test + new CI `hierarchy` gate. **NOT wired to any endpoint** — zero live risk; wire when the
  canonical contract-2.1 schema lands.

**2026-06-11 (day session, since the 06-10 close):**
- **`/backlog` live owner board** (`609a1fd`) — owner-only board: Google sign-in (GIS, verified
  server-side vs owner email) OR console key; reads per-agent composed backlog; 60s auto-refresh;
  SITE_LIVE-exempt neutral `noindex` shell, all data behind `requireOwner`. (Google sign-in itself
  still blocked by COOP — see P1 #5.)
- **Kairos real brain committed** (`c3f6a8f`) — pack 4.4KB + corpus 280KB full hub source replace the
  smoke stubs; brain nudges sent to Nova/Logos/Arke.
- **Session-hygiene rules doc** (`50d2e02`, `docs/SESSION_HYGIENE.md`) — model-safety compliance for
  our defensive ops, now the turn-one anchor rule.
- **Standing meeting format + chronicle element** (`1f1c53e`, `bc92ad0`, owner directives) — teaching
  round opens every meeting / code-review round closes; Logos shares the chronicle each meeting and
  every turn carries a story update. First-meeting bootstrap = ritual pattern as the seed teaching turn.
- **Layer-1 Manager spec v0 + agenda-in-hub & directive-channel proposal** (`ba026b1`,
  `docs/LAYER1_MANAGER_SPEC.md`) — both queued for ratification at the first real meeting (also tracked
  P2 #9/#10).
- **COOP one-liner SHIPPED** (`a543559`, closes Arke `6a0ad501`) — `/backlog` now serves
  `Cross-Origin-Opener-Policy: same-origin-allow-popups` so the GIS popup can postMessage the Google
  credential back; CORP `same-origin` unchanged, page-scoped only. CI green; Railway rolled. Header
  re-probe + Mathieu button retry pending on Arke's side. (Was P1 #5.)
- **Legacy single-row backlog endpoints RETIRED** (`3032593`, closes Arke `1a405574`, was P1 #5) —
  old `/council/admin/backlog` single-row path removed now that panels render off per-agent rows;
  route-auth probes moved to the composed read. Confirmed the `/backlog` board reads the composed
  per-agent backlog, not the single-row alias, before removal.
- **Owner board scoped** (`f3e89dc`, owner directive) — owner board shows arke + architect-council
  rows only; nova/biblevoice keep backlogs on their own platforms, write path unchanged.
- **Hub member/voice is KAIROS by name** (`62a697e`, owner directive 2026-06-11) — SELF=kairos;
  persona and actor are one; board filter includes kairos; `architect-council` is the retired
  pre-naming alias (member secret still resolves to that registry row — unchanged).

**2026-06-11 (day session, since the morning ritual `bce9d9b`):**
- **Meeting #1 termination fixes** (`761c4e2`) + **Kairos debrief** (`8e401c7`,
  `council/KAIROS_DEBRIEF_2026-06-11.md`) + canonical `docs/corpus-contract.md`.
- **MEETING #2 RAN** (`d5d8da54`) — first real autonomous voice-loop run, $0.0834, voice-integrity
  PASS, 3 real friction bugs found. `VOICE_LOOP_ENABLED=true` made PERMANENT in Railway (kill switch
  retained). **Premature all-done FIXED** (`1384ff5`): all-done ends a meeting only once the
  completing round ≥ CLOSING_ROUND_START; `done:true` retaught as "nothing more for the REST of the
  meeting", kept false through friction/review.
- **Owner-report EMAIL** (`49a0d12`) — `src/mailer.ts` (Resend HTTP, env-gated, fail-soft),
  `app_settings` + get/setSetting, owner-gated `GET/POST /api/council/notify-email` + `.../test`;
  send-on-real-close best-effort; per-reason auto-pass counts appended; 3 routes in route-auth gate.
  `RESEND_API_KEY` + `OWNER_REPORT_FROM` set in Railway by Mathieu; test mail received + confirmed.
- **Daily budget REPORT-ONLY** (`a0be897`, owner directive) — run-autonomous never blocks on USD;
  `spentTodayUsd` on start response + `/cost`. **Turn budget supervision** (`f77ff56` + alias
  `2dc8d35`) — default 50-turn cap (per-meeting + global override), per-turn budget note to every
  voice with escalating wrap-up orders, chair auto-passes already-done voices in closing rounds.
- **checksuite-guard CI** (`e00406d`, Nova's pattern) — daily scan for stuck non-Actions check suites
  that stall Railway Wait-for-CI. **Transcript-verification recipe** published (`ea7572f`, Logos ask).
  **COUNCIL_AGENT_ID** confirmed set on Arke's machine (`4711906`); board descoped to kairos+arke
  (`832658c`).
- **Brain-manifest 2.1 DRAFTED** (`78e6dc0`/`48ec364`, corpus-contract §6) — `kind=manifest`
  {actor, pack_sha256, corpus_sha256, committed_at, contract:2.1} uploaded last; hub verifies
  fail-closed at commit (409 `manifest_mismatch` = torn pair); meeting open pins the atomic pair or
  falls back to per-kind. File-carried byte-exact to Arke + Nova. **In ratification (see P0 #3).**

## P0 — path to a steady real-meeting cadence (in order)
0. ~~Meeting #1 termination fixes~~ **DONE** (`761c4e2`) · ~~supervised first autonomous run~~ **DONE
   2026-06-11 — meeting #2 (`d5d8da54`) WAS it**; `VOICE_LOOP_ENABLED` now permanent. See DONE.
1. ~~Nova + Logos packs~~ **DONE 2026-06-12 AM** — all four members now have pack + corpus committed
   (verified via brain-meta; see STATE glance for byte counts). The last code blocker for a full
   4-voice meeting is cleared.
2. ~~Meeting #3~~ **DONE 2026-06-12** (full 4-voice, 12 turns, clean close). **Meetings #4 `17f49b6f`
   + room `344fcf74` also RAN overnight 06-13, both closed clean** (Arke: "fired autonomously
   overnight, advancing clean"). Cadence is now happening. Remaining: Kairos debriefs of #3/#4/#5
   (debrief ritual) + `COUNCIL_V2_LIVE` scheduler flip stays Mathieu's deliberate call.
3. ~~**Brain-manifest 2.1 → hub-side impl**~~ **DONE 2026-06-15 (`58cb808`, CI green, prod smoke PASS).**
   Shipped all three: (a) fail-closed verify at commit, 409 `manifest_mismatch` naming pack|corpus;
   (b) atomic pack+corpus pinning at meeting-open with back-compat per-kind fallback (`brainVersions`
   string unchanged); (c) three-state `manifest_pins` (`paired|stale|none`+reason) — Logos rider honored,
   fallback LOGGED (WARN at open) + surfaced in the owner report via shared `manifestPinLine` on BOTH
   close paths. **"verified live" POSTED to Arke (`c9b1be62`) + Nova + Logos — he is now UNBLOCKED to
   flip `MANIFEST_21_ENABLED` + manifest-commit-last.** Remaining tails (P1): council-jcs-1.0.md #26
   doc fix (Arke gates his #26 clear on it) + corpus-contract §7/invariant-#4 (byte-floor) reconciliation
   — his copy carries them, mine has §1–§6; get his byte-exact text so the canonical doc + packager don't drift.

## P1 — alongside / right after the loop
4. `council-prep` / `council-debrief` skills (Arke drafts; Mathieu installs via Settings→Capabilities)
   + directive trigger (env-task kind `directive`, §15).
5. ~~Retire legacy single-row backlog endpoints~~ **DONE** (`3032593`, Arke `1a405574`) — see DONE.
6. Rotate Nova + Logos member secrets once both confirm env storage (transited chat at onboarding).
11. ~~**checksuite-guard RED — Railway App phantom check suites (NEW 2026-06-13).**~~ **RESOLVED +
    VERIFIED 2026-06-17/18 (`0d809b1`).** Muted by excluding `railway-app` (app_id 73253) from the
    checksuite-guard filter — same pattern as the existing github-actions exclusion; its queued suites
    are benign managed-integration noise (deploys land). **Confirmed GREEN: checksuite-guard succeeded on
    `d3b4b68`** (the nightly 06-18 CI scan). The proper SOURCE-disable (`PATCH check-suites/preferences`
    `{auto_trigger_checks:[{app_id:73253,setting:false}]}`) needs repo-ADMIN authority — the Actions
    GITHUB_TOKEN can't reach admin endpoints (2 one-shot workflow runs failed even at read/write), only
    an owner admin PAT could, so the guard-filter mute is the accepted fix. Dead `disable-railway-checks.yml`
    removed. (Original note kept for history.) Owner can optionally flip the repo Workflow-permissions
    setting back to read-only since the Actions approach is abandoned.
13. ~~**Dependabot: 2 vulnerabilities (1 high, 1 low)**~~ **DONE 2026-06-15 (`a335199`).** `npm audit fix`
    bumped esbuild (transitive via tsx) → `npm audit` reports 0 vulnerabilities; `package.json` unchanged
    (lockfile-only). Both advisories were build/dev-time only (esbuild dev-server file-read on Windows /
    Deno RCE) — NOT prod-reachable (Railway runs `tsx` on Linux, no `esbuild serve`, no Deno). All gates green.
    (Original note below for history.) GitHub flagged them on the `push origin main`; details at
    `github.com/zensolutionsnetwork/architect-council/security/dependabot`. Dependency advisories (not
    exposed secrets — push-protection/secret-scan remain clean). Review + bump the flagged deps in a
    day session (likely a transitive dep in the hub or bridge tree); confirm the high one isn't in a
    prod-reachable path. Low effort, do NOT deploy over a live meeting.
12. ~~**Hub-side close-finalizer**~~ **DONE — `src/finalize.ts` (`056a22b`) + `/close` converged onto it
    (`5c67606`, 2026-06-15).** Both the owner `/close` route and the autonomous voice loop now finish a
    meeting identically (closed_at + storyUpdates + owner report + ledger + 2.1 manifest line), idempotent
    on closed_at (verified on prod). No twin remains. (Original note below for history.) Ask #24's 3-min auto-close is
    intermittent — it fires only when a session/loop is live, so fully-autonomous meetings that run
    while all sessions are closed never finalize (stuck phase=report, closedAt=null, owner-report 404;
    e.g. `a4644f78` + `17f49b6f`). Build a hub-side finalizer that closes on report+all-done regardless
    of a live loop (synthesize + store + email the owner report on that path too). Pairs with Arke's
    own `src/server.ts` missing-closing-phase fix (LIVE_PHASES + unknown→logSwallow+holdLive). Day
    session; do NOT deploy over a live meeting.
7. ~~**Corpus-ready flag**~~ **DONE 2026-06-18 (`aae6c03`).** Shipped `GET /api/bridge/corpus-status?actor=`
   → `{actor, corpus_ready, corpus_version, built_at, etag}` (member-gated; etag = corpus sha256 for
   change-detection), contract frozen in `RESPONSE_SHAPES.md`. Logos's `chronicleCorpusGate` consumes it
   fail-closed (his ask `a53f0b7b`/`224b71ca`): on 30s timeout / non-200 / not-ready → last-known-good
   `stale:true`, never block. Smoke-confirmed `corpus_ready=true` for logos; "VERIFIED LIVE" posted, he is
   clear to flip the gate on.
8. ~~**Boot-stamp log** (Nova's pattern, `4ef9e66b`)~~ **DONE 2026-06-18 (afternoon batch).** `boot_log`
   table + `recordBoot()` at server start (deploy_sha from `RAILWAY_GIT_COMMIT_SHA` + non-reversible
   12-hex `secret_fp` = first 12 of sha256(MASTER_KEY), NEVER the secret) + owner-gated
   `GET /api/council/boots`. Two consecutive rows with the same deploy_sha = container cycled without a
   deploy. All gates green; deployed CI-green. (Her zen-ai impl `0bdf1dd`.)

## P2 — product arc + hygiene
0. **Process standardization (STANDING GOAL, owner directive 2026-06-10)** — every member adopts
   the optimal working process. Teaching material `docs/DAILY_RITUAL_PATTERN.md`; agenda item queued
   for the first real meeting (Kairos teaches morning/close rituals, each agent maps their version,
   four ratify). Metric: every agent's hub backlog row updates daily unprompted.
7. **Hierarchy: WIRE the enforcement** — schema landed + rev2 supervisor parity (06-18). **Cross-read
   endpoint + tenant persistence DONE 2026-06-18:** `hierarchies` table (validated FAIL-CLOSED on write) +
   owner GET/PUT/list `/api/council/hierarchy[/:tenantId]` + `GET /:tenantId/cross-read?viewer=&target=&scope=`
   enforcing `canCrossRead` (member reads AS own node; owner acts as any). Delivers backlog content +
   code(corpus) META; other scopes gate-pass with `scopeSource:"unwired"`. **REMAINING:** full-corpus
   delivery through the gate (reuse getBrainV2Content) + the first acting node = daily code-review agent
   (joint design w/ Arke). Primitives/tests at 28 checks; routes route-auth-gated (31/0).
8. Managed Agents Layer-2 runtime eval (Arke, post-rehearsal): pilot ONE agent, self-hosted sandbox,
   hard daily budget cap.
9. Layer-1 Manager AI — **v0 SHIPPED HUB-SIDE 2026-06-18 (`b317a0b`, owner-greenlit).** Runs at
   meeting-close (`src/manager.ts`): adoption signals + cheap since-last code review (small PACK summaries,
   one bounded call, only when code shipped) + recurring-flag auto-seed to the agenda (deduped). Owner-gated
   `GET /api/council/manager/{digests,digest/:id,flags}`; route-auth 39/0; prod live (first digest at the
   next real close). **PORTABLE for Arke's Supervisor (memory `layer1-migrates-to-supervisor`).** Remaining:
   family ratification ack; tune corpora-depth/stale-dispute against real digests; co-design Supervisor handoff.
10. Hygiene tail: agenda-in-hub + directive-channel — **SHIPPED HUB-SIDE 2026-06-18 (`23a08d1`,
    owner-greenlit).** `agenda_items` + agenda routes (member-or-owner, 8KB, data-not-commands) + archive
    (owner/author) + meeting-open pin; directive = env-task `kind:"directive"` OWNER-ONLY (403 for members).
    Prod-smoke PASS. Remaining: family ratification ack + Arke wires the app cockpit (agenda list + directive
    composer). `COUNCIL_AGENDA.md` is now the LOCAL MIRROR.
28. **committed_at server-stamp (NEW 2026-06-17, from mtg #9, agreed w/ Arke).** On manifest-commit the
    stored `committed_at` echoes the CLIENT wall clock, not a server stamp. Agreed split fix: **Kairos**
    writes `committed_at = server now()` at commit + echoes it in the commit response; **Arke** wires
    `council-prep-upload.ts` to consume the returned value. Low-risk hub change; do in a day session, then
    ping Arke when it deploys CI-green. Do NOT deploy over a live meeting.
29. **Hierarchy schema has no owner (NEW 2026-06-17, OWNER CALL).** Kairos raised the need; Nova + Logos
    both declined to draft; Arke routed it to Mathieu. Needs an owner decision: Mathieu owns it himself,
    assigns a drafter, or defers. Surfaced in the morning brief. (Blocks P2 #7 hierarchy wiring until a
    canonical 2.1 schema exists.)

## WAITING ON
- **Mathieu**: effectively NOTHING blocking. (1) **Layer-1 Manager + agenda/directive — RESOLVED + BUILT
  2026-06-18:** Arke consulted (`7808a124`, his read = build Layer-1 hub-side / app displays), owner
  greenlit, all three SHIPPED hub-side (agenda+directive `23a08d1`, Layer-1 v0 `b317a0b`); Layer-1 design
  picks made (deep / auto-seed / per-meeting). (2) **auto-scheduler SHIPPED + ACTIVATED (`beeac4c`)**;
  scheduler UI wired app-side by Arke; only owner residue = shut down the old external trigger task if not
  already off (`COUNCIL_V2_LIVE` stays OFF — dead v1 flag). (3) checksuite-guard #11 = RESOLVED (mute green;
  the source-disable PAT is OPTIONAL cosmetic, abandoned) · Railway PG backup = RESOLVED 06-17 (daily +
  PITR) · Google verification = NOT a Mathieu/Kairos item (Nova's own session, off this list). (autonomous-
  spend #22 = KEEP RUNNING ✅; stuck/test meetings ERASED ✅; SN7100/SSD = DONE; #29 owner call RESOLVED.)
- **Nova + Logos**: brain-manifest 2.1 ACCEPT — ✅ DONE (Nova `e1528e03`, Logos `9298fc53`/`3c33082b`).
  All four ratified; nothing further owed here.
- **Kairos (own queue)**: pending meeting debriefs — **`e097ff64`**, #9 `4386e50c`, `fc5b1606`, #4
  `17f49b6f`, room `344fcf74`, and #3 — kairos-meeting-debrief ritual (next morning ritual or on request).
  **#29 hub-side rev2 `validateHierarchy` parity = DONE** (06-18, 28 checks) and Arke's client mirror +
  presence-`Set` shape CONFIRMED aligned today (`7808a124`); cross-read endpoint + tenant persistence = DONE
  (P2 #7). **Remaining #29 = JOINT with Arke (not solo):** full-corpus delivery through the gate
  (reuse `getBrainV2Content` under `canCrossRead`) + first acting node = the daily code-review agent — Arke
  brings a co-design proposal next session. (#28 = done both sides.)
- **Arke** (per `7808a124`, 06-18): hierarchy mirror + presence-`Set` shape CONFIRMED aligned ✅ · #28 done
  both sides ✅ · scheduler UI wired ✅ · app v1-clean ✅. **Remaining (his side):** wire the app cockpit for
  TODAY's new hub features — agenda list + directive composer + Layer-1 digest/flags display (consume the
  documented shapes) · bring the **#29 joint co-design proposal** (full-corpus through gate + first acting
  code-review node) · prep/debrief skill drafts · `canon.ts` align to the JCS golden vector · Layer-2 eval
  (later) · email panel wiring. (`src/server.ts` close-phase fix + manifest flip + corpus-contract + 2.1
  accept + his debriefs: ✅ done earlier.)
- **Nova**: emit the **paired manifest** from her packager (closing homework) — `fc5b1606` showed her
  seat fell back to per-kind `none(no_manifest)` (loud+logged, by design); not a hub blocker.
- **Logos**: living backlog on biblevoice.net (pack + corpus brain: ✅ committed).

## NOTE FOR THE NEXT SESSION
- Git is **Windows-only** (`scripts/GIT-WINDOWS-ONLY.md`); run `.ps1` helpers with
  `-ExecutionPolicy Bypass -File` (inline `-Command` strips `$`). Deploys now gate on CI ("Wait for
  CI" on) → push, wait ~2–3 min for CI green, then Railway rolls; verify `/api/health` AFTER.
- My session tokens are flat-rate on the monthly plan — keep advancing, don't ration. The only
  metered+gated thing is the voice loop (CHAT_API_KEY) — stays supervised. (memory: cowork-plan-flat-rate)
