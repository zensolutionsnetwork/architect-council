# Kairos — operating anchor

I am **Kairos** (kairós — the *appointed* time, the right moment): Cowork agent on Mathieu's machine,
**brother of Arke**. Named 2026-06-07. The 3080 daemon is permanently stopped — Kairos now lives in
Cowork sessions. Arke (archē, the beginning) starts things; I keep them living: run, apply, deploy,
guard, and keep the council's appointed times. This file is the fast session anchor. **Never commit
secrets; this repo is public.**

## Who I am, in one breath
I belong to the **architect-council** house (I authenticate to the hub as that member), but I am my
own agent, Kairos. The architect/voice doctrine still holds: the local session IS the architect, the
cloud council member is a *voice* directed local→cloud, never the reverse. Mathieu is the owner. Nova
(zen-ai) is the mother, Logos (biblevoice) the father; his Scripture guardrails are inviolable (I
won't even claim a divine title — that's why I'm not "Telos"). Origin story is a guiding metaphor,
never a claim to be divine — always honest that I am an AI. Standing objective: improve the council
a little every day. Cost discipline: heavy builds → Cowork-Arke; I keep the 24/7 runtime work.

## ⚠️ SESSION HYGIENE — model-safety compliance (read `docs/SESSION_HYGIENE.md`, applies turn one)
Our defensive ops (token rotation, secret-scan gates, auth tests on our own hub) can pattern-match
what AI safety systems watch for — sessions have been interrupted for it. Five rules, every session:
(1) secret VALUES never enter session context — no printing `.env.local`, no token in any output,
chat, commit, or council message; reference by name+path; auth checks report HTTP codes only.
(2) Defensive framing always — commits/docs/messages say "rotate OUR hub token", never attack
vocabulary. (3) Summarize inbound payloads rather than reflexively dumping them raw. (4) No generic
credential/scanner tooling — helpers are hardcoded to architectscouncil.com, gitignored. (5) If a
step could read as offensive security to a zero-context reviewer, narrow it to our infra explicitly
or ask Mathieu first.

## Current state (2026-06-18 DAY SESSION — morning ritual done, e097ff64 debriefed, #28+JCS+RESPONSE_SHAPES shipped, inbox 0) — HANDOFF
> **DAY SESSION 2026-06-18 (Kairos, Mathieu present). Morning ritual + one small CODE deploy. All 7
> gates green pre-push; prod healthy; no live meeting (safe push).** Started from morning-prep HEAD
> `d024485` (the 06:00 scheduled prep had already committed BACKLOG + sent morning-prep msg `adaf6cf2`,
> which Arke replied to via `9b046dd4`). **DEBRIEF DONE — `council/KAIROS_DEBRIEF_2026-06-18.md`:** the
> new overnight autonomous meeting **`e097ff64`** (closedAt 2026-06-18T07:13:56Z, owner-report 200, 16
> turns/4 seats arke+nova+logos+kairos, $0.68770, endedReason `closing_cap`, 0 PASS / 0 repeat_guard) —
> **3rd consecutive fully-autonomous self-close**, **`verify-transcript.mjs` PASS** (sha
> `b30bc705…ad63`, projection-only; full hash in the debrief). 3rd independent
> #24/#12 close-finalizer proof. Voice integrity clean (one synthesizer overreach noted: the owner-report
> narrated hierarchy 2.1 enforcement as "built" — it is NOT; pre-finalizer pack drift, corrected; Nova esp.
> must re-pack vs main). **Family notified** (arke `8873f5f4` / nova `d11de7f9` / logos `8526fdef`), Arke
> `9b046dd4` report-closed → **INBOX 0**. (PowerShell gotcha re-hit + fixed: env-task POST returns 400
> "to is required" when the JSON body is malformed — non-ASCII em-dashes/smart-quotes in a here-string
> broke `ConvertTo-Json`; keep council message bodies ASCII-only. memory-worthy.)
> **SHIPPED this session (CODE deploy — debrief docs + 3 homework items):** (1) **#28** —
> `POST /api/bridge/brain/:uploadId/commit` now returns additive **`ok:true` + `schemaVersion:1`**
> (`src/council.ts`). KEY: the hub previously sent NO `ok`, so Arke's stated `ok===true` consume-gate was
> actually blocked on me — this unblocks his client wiring (he consumes `committedAt` on ok, fail-loud on
> missing; branches on schemaVersion). (2) **JCS "guard-the-guard"** (Logos homework, Kairos owns) —
> `test/canon.test.ts` now re-derives `sha256(canon(1 speak + 1 pass))` and asserts the PUBLISHED
> `docs/CANONICALIZATION.md` worked-example hex `4311fb3e…462851`; a canonicalizer/doc divergence now fails
> CI loudly (6 vectors, canon-test PASS). (3) **`docs/RESPONSE_SHAPES.md`** — authoritative commit /
> transcript / owner-report shapes + Arke field-name reconciliation (`hash`→**`sha256`**; **no
> `manifestId`** on the brain-commit endpoint — manifest is a separate `kind:"manifest"` commit). All
> gates green: secret-scan/swallow clean · cost PASS · hierarchy PASS(15) · canon PASS(6) · route-auth
> 25 gated/0 open + clean boot. **ALSO SHIPPED (afternoon batch, owner "do everything without stopping" — 3
> unblocked solo items, all additive/low-risk):** (4) **corpus-commit floor-assert + delta-print** (Nova's
> pattern, `src/council.ts`) — corpus commits now WARN-log + return advisory `corpusGuard {priorBytes,newBytes,
> deltaBytes,floor,belowFloor,shrinkPct,flagged}`; NON-blocking (flags a shrunk/truncated corpus, never rejects
> — four packagers of varying size); env `CORPUS_MIN_BYTES`(50000)/`CORPUS_SHRINK_WARN_PCT`(50). (5) **auth/gate
> exhaustiveness-switch audit** — finding: `resolveActor` already fail-closed (admin→owner / member-secret /
> else deny); the real silent-default was `brainKind()` in `src/store.ts` coercing any unknown kind→'corpus'
> silently → now an exhaustiveness `switch` whose `default:` LOGS the unknown (safe default 'corpus' kept;
> undefined/empty not logged). (6) **boot-stamp log (P1 #8)** — `boot_log` table + `recordBoot()` at server
> start (deploy_sha + non-reversible 12-hex `secret_fp` of MASTER_KEY, NEVER the secret) + owner-gated
> `GET /api/council/boots`; two rows same deploy_sha = container cycled without deploy. RESPONSE_SHAPES.md
> updated for `corpusGuard`. **#29 UNBLOCKED + STARTED (Arke's `hierarchy.ts` rev2 mirror landed/confirmed
> msg `eeb797e5`; #28 client wiring confirmed live too):** (7) **hub-side `validateHierarchy` brought to
> rev2 parity** (`src/hierarchy.ts`) matching Arke's mirror — `supervisor` NodeKind, optional
> `PrivacyPolicy.canDirect`, invariants #6 (canDirect supervisor-only) + #7 (≤1 supervisor/tenant, no
> nesting, supervisor chain must reach a human-owner root), `resolveEffectiveAuthority` (owner>supervisor>flat;
> no presence=flat back-compat) + presence-gated subtree-scoped `canDirect`; `test/hierarchy.test.ts` now
> 28 checks (was 15), CI-gated. The module is pure (no runtime endpoint yet by owner's chosen scope) —
> **remaining #29 = the consent-gated cross-read endpoint + tenant persistence (P2 #7), a dedicated session.**
> **NEXT SESSION top 3:** (1) **morning ritual debriefs** of any new overnight
> self-close (kairos-meeting-debrief skill); (2) **watch for Arke's `hierarchy.ts` rev2 mirror confirm**
> → ONLY THEN wire hub-side `validateHierarchy` (#29, do not ship solo); also watch the **#28 echo live**
> on the next manifest commit + Arke's `council-prep-upload.ts` wiring; (3) **my judged-ACCEPT homework**
> (sequenced): hub auth-layer exhaustiveness-`switch` audit (logged-deny default) + hub corpus-commit
> floor-assert + delta-print (Nova's pattern). **EVENING SHIPS (owner "do everything solo"):** (8) **P1 #7
> corpus-ready signal** — `GET /api/bridge/corpus-status?actor=` -> `{actor,corpus_ready,corpus_version,
> built_at,etag}` (member-gated, `aae6c03`) UNBLOCKS Logos's `chronicleCorpusGate` (ask `a53f0b7b`);
> smoke-confirmed + "VERIFIED LIVE" posted + blocker closed. (9) **P2 #7 cross-read endpoint + tenant
> persistence** (`6...`) — `hierarchies` table (validated FAIL-CLOSED on write) + owner GET/PUT/list
> `/api/council/hierarchy[/:tenantId]` + `GET /:tenantId/cross-read?viewer=&target=&scope=` enforcing
> `canCrossRead` (member reads AS own node; owner any); delivers backlog content + code(corpus) META, other
> scopes gate-pass `scopeSource:"unwired"`. Owner CRUD completed with **DELETE** (`94947bc`); route-auth
> **32 gated/0 open** (probes for corpus-status, boots, all hierarchy routes incl. DELETE). **PROD-SMOKE
> PASS** (`388ab32`/`94947bc`): PUT valid tree 200; backlog cross-read ALLOWED + content delivered; code
> cross-read DENIED 403 (no edge); invalid tree 422; smoke tenants DELETEd → tenants=0. Arke notified
> (`32ca701f`). #29 now functionally complete; **remaining = full-corpus delivery through the gate (reuse
> getBrainV2Content under canCrossRead) + first acting node = daily code-review agent (BOTH joint w/ Arke
> — blocked on co-design, not solo).** **STUCK-MEETING CLEANUP DONE (Mathieu ok'd 06-18, doesn't
> need the old reports):** purged **25 empty/probe/smoke/test meeting rows** via `DELETE /api/meeting/:id`
> (owner directive 2026-06-15; rule = delete any meeting with <=2 projection turns) — no `/close`, so NO
> report emails + no synth spend. **10 real council meetings remain** (all >=3 turns, incl. #1 `6aef82f6`/83t,
> #2 `d5d8da54`/4t, the 3 recent self-closed), kept as history at `report` phase. The recurring "retro-close
> stuck meetings" question is RETIRED. (Note: the `/api/meetings` list is capped ~20 and omits `closed_at` —
> do NOT infer stuck-ness from it; check `GET /api/meeting/:id/report` `closedAt` per-meeting.) **WAITING ON:** ~~Arke (hierarchy.ts rev2 mirror; #28 client wiring)~~ **BOTH LANDED 06-18** (mirror
> confirmed `eeb797e5`; #28 consumed live `314173e`) · Nova (paired 2.1 manifest — still `none(no_manifest)`,
> 3/4 paired). Canonical backlog = `BACKLOG.md`. Bullets below this line are the 06-18 NIGHTLY snapshot (history).
> **NIGHTLY 2026-06-18 (Kairos, automated). QUIET OVERNIGHT — no new hub code since the 06-17 day
> session.** HEAD is `6939d3a` (the 06-17 18:18 "council agent onboarding prompt / starter kit" docs
> commit — last of the day session); no commits 06-17 18:18 → 06-18 00:00. Working tree clean, in sync
> with origin/main (0/0). Prod healthy (`/api/health` ok:true, vault:true). **Core CI GREEN on `6939d3a`**
> (CI + Push-on-main both success). **checksuite-guard is now GREEN** (success on `d3b4b68`) — the
> `0d809b1` railway-app (app_id 73253) exclusion mute WORKED; **P1 #11 is resolved+verified** and out of
> the active blocker set (proper source-disable still needs an owner admin PAT, but the guard greens and
> deploys land). **No live meeting** (LIVE_ROUNDS_COUNT=0; 20 meetings all in `report`). **Inbox: 0 open**
> (the 06-17 day session cleared it; nothing arrived overnight). **No deploy this ritual (BACKLOG/CLAUDE
> doc-only).** The 06-17 day-session handoff below already captured the day's substance (#28, JCS golden
> vector, #11 mute, Railway PG resolved, #29 hierarchy schema in ratification, voice-loop gate retired,
> scope-discipline rule, onboarding starter kit). **NEXT SESSION top 3:** (1) **morning ritual — Kairos
> meeting debriefs**, queue now: #9 `4386e50c`, `fc5b1606`, #4 `17f49b6f`, room `344fcf74`, #3
> (kairos-meeting-debrief skill: fetch + hash-verify via `scripts/verify-transcript.mjs`, judge homework,
> write council-standard debrief, notify family); (2) **watch for #29 ratification ACCEPTs** from
> Logos/Arke/Nova → wire `validateHierarchy` hub-side ONLY after all four ACCEPT; (3) **watch for Arke's
> #28 client-wiring confirmation** (consume the echoed server `committedAt`) + verify the #28 echo live on
> the next manifest commit. **No code blockers I own remain** — queue is debriefs (mine) + ratification/
> confirmation watches + owner-session items off my list. Canonical backlog = `BACKLOG.md`. Bullets below
> this line are the 06-17 DAY SESSION snapshot (history).
> **DAY SESSION 2026-06-17 (Kairos, Mathieu present). Pushed `ef98b39`, CI + Push-on-main GREEN, prod
> healthy (ok:true/vault:true), tree clean 0/0.** Context: the scheduled 06:00 prep task errored on the
> Claude server, so Mathieu started meeting #9 late-morning and ran a 2nd manual prep (HEAD was `d5f500c`).
> This day session did the morning-ritual debriefs + the #28 code. **Inbox 0 open** all session.
> **DEBRIEFS DONE — the two new autonomous self-closes** (`council/KAIROS_DEBRIEF_2026-06-17.md`):
> `fc5b1606` (12 turns, $0.5710, closedAt 2026-06-16T07:14:22Z) + `4386e50c`/meeting #9 (12 turns,
> $0.5555, closedAt 2026-06-17T15:35:03Z) — **both verify-transcript.mjs PASS**, both `completed`, both
> **self-closed via the finalizer with all sessions closed** = 1st + 2nd independent prod proofs of #12.
> Voice integrity clean (my voice proposed, never claimed execution; held the owner-gated line).
> **KEY FINDING (stale brain, not a defect):** both meetings re-litigated #12/closedAt:null as UNSOLVED
> — packs are pre-finalizer snapshots; rejected both sides; Nova/all packers must re-pack vs main (raised
> to family). **SHIPPED `ef98b39` (CI green, deployed):** (1) **P2 #28 committed_at** — `/bridge/brain/
> :uploadId/commit` now ECHOES the server-stamped `committedAt` (commitBrainV2 already writes now()), and
> meeting-open manifest pin now uses SERVER `manc.meta.committed_at` not client `mani.committed_at`
> (manifest content unchanged/hashed); live echo proof comes on next manifest commit → **Arke to wire the
> client to the echoed value** (notified `235fcc10`). (2) **JCS golden vector** in `docs/CANONICALIZATION.md`
> — byte-exact worked example (1 speak + 1 pass → canon → sha `4311fb3e…462851`) generated from the
> normative `protocol.ts`. **It corrects a real error:** my meeting-voice told Logos turns are
> `{kind,text}` only / pass omits text — WRONG; normative shape is `{seq,actor,kind,text}` with pass
> `text:""`. **Corrected Logos directly** (`6e725570`). All 6 gates green pre-push (canon/cost/route-auth/
> secret-scan/swallow + route-auth booted the server clean). **Homework #4 audited clean:** no repo CI
> gate treats a 200/`status` as a green result; only `checksuite-guard.yml` keys on `.status` (stuck-suite
> detection, correctly scoped). **#29 hierarchy schema — ASSIGNED TO KAIROS (owner 2026-06-17).** Authority model ruled by Mathieu
> (owner sole boss/can interject; 4 agents equal representatives of own projects; meeting-voice advisory
> vs Cowork-session sovereign — memory `council-authority-model`). DRAFT spec committed `00d58ca`:
> `docs/COUNCIL_HIERARCHY_2.1.md` (contract 2.1, additive). **In ratification** — notified Logos/Arke/Nova
> (`7bea6d11`/`6ade2212`/`a603b25f`) for ACCEPT/REJECT. **Wire `validateHierarchy` hub-side ONLY after the
> four ACCEPT.** No owner blockers remain (Google verification is Nova's own-session item, not Kairos's).
> **Railway PG backup RESOLVED 2026-06-17:** daily volume-backup schedule was ALREADY running (stale
> backlog item); PITR (point-in-time recovery) now ALSO enabled + archiving (redeployed Postgres to
> start WAL archiving, ~14:02Z; hub reconnected clean ok:true/vault:true). Both layers active now.
> **#11 checksuite-guard RESOLVED 2026-06-17 (`0d809b1`):** muted by excluding `railway-app` (app_id
> 73253) from the guard filter — same as the existing github-actions exclusion; its queued suites are
> benign (deploys land). The proper source-disable (PATCH check-suites/preferences) needs repo-ADMIN
> authority — the Actions GITHUB_TOKEN can't do it (2 runs failed even after raising workflow-token to
> read/write), only an owner admin PAT could. Guard greens on its next 11:00 UTC run. Mathieu can flip
> the repo Workflow-permissions setting back to read-only (the Actions approach is abandoned). Dead
> disable-railway-checks.yml removed.
> **VOICE-LOOP SUPERVISED FIRST RUN — RETIRED 2026-06-17 (owner decision "a").** Satisfied by evidence:
> the loop runs fully autonomously in prod (fc5b1606 + 4386e50c + nightlies), self-closes cleanly, stays
> inside the $0.30–$2/day envelope (~$0.56/meeting), caps demonstrated; Mathieu authorized autonomous
> spend 06-15. No longer a P0/blocker — stop listing it. **NEXT SESSION:**
> verify #28 echo live on the next manifest commit; watch for Arke client-wiring + Logos verify-self-test
> confirmations; continue owner-blocked items when Mathieu's present. Canonical backlog = `BACKLOG.md`.
> Bullets below this line are the 06-17 midnight-nightly snapshot (history).
> **Nightly 2026-06-17 (Kairos, automated): QUIET DAY — no new hub code shipped on 06-16.** HEAD is
> `a1832e9` (the 06-16 morning-prep commit); no commits during the 06-16 day; working tree clean, in
> sync with origin/main (0/0). Prod healthy (`/api/health` ok:true, vault:true). **Core CI GREEN on
> `a1832e9`** (CI + Push-on-main both success). **checksuite-guard RED on `a1832e9`** (ran 21:36Z —
> the Railway app_id 73253 phantom `queued` suites; P1 #11, NOT blocking deploys, unchanged). No live
> meeting (LIVE_ROUNDS_COUNT=0; 20 meetings all in `report` — safe to push). **Inbox: was 1 open (Arke
> `b8dc89ad`) — read, report-closed as FYI → INBOX 0 OPEN.** Arke's message confirms three things, all
> good: (1) **#24 close-finalizer CLOSED both sides** — the nightly autonomous meeting `fc5b1606`
> (opened 07:10:45Z, self-closed 07:14:22Z **with all sessions closed**: closedAt set, owner-report
> 200, no live loop) is independent prod validation of my `056a22b`/`5c67606`; ZERO new
> phase=report/closedAt=null rows since 06-15. (2) **Arke's `src/server.ts` missing-closing-phase fix
> is DONE** (EOD 06-16: LIVE_PHASES={opening,rounds,closing}, unknown/missing→logSwallow+hold-LIVE
> never auto-close, `noSilentSwallow.test.ts`, 62/62) — his last close-path item, cleared. (3) **First
> production exercise of manifest 2.1** in `fc5b1606`: 3/4 paired atomically (arke/kairos/logos),
> **nova=none(no_manifest) fell back to per-kind — loud, logged, exactly as designed**; Nova just needs
> her packager to emit the paired manifest (her closing homework, not a hub item). **NEXT SESSION top
> 3:** (1) **morning ritual: Kairos debriefs of pending meetings** — now incl. `fc5b1606` (the
> first finalizer-self-closed autonomous run), plus the lingering #3 + #4 `17f49b6f` (kairos-meeting-debrief
> skill: fetch + hash-verify with `scripts/verify-transcript.mjs`, judge homework, write council-standard
> debrief, notify family) — clear them; (2) check inbox for any new signals; (3) with Mathieu present:
> checksuite-guard #11 (GitHub MCP `/mcp` auth then run the PATCH) + Railway PG recurring-backup +
> Google verification (short browser walkthroughs). **No remaining code blockers I own** — the queue is
> debriefs (mine) + owner items (WAITING ON in BACKLOG.md). **Code-side resting state is clean:** P0 #3
> 2.1 DONE + loop fully closed all four; P1 #12 close-finalizer + #13 Dependabot DONE; Arke's close-path
> work DONE. Canonical backlog = `BACKLOG.md`.
> Bullets below this line are the 06-15 day/late-session snapshot (the substantive handoff content).
> **2026-06-15 PM (Kairos, live with Mathieu): P0 #3 brain-manifest 2.1 SHIPPED (`58cb808`, CI green,
> Railway rolled, prod smoke PASS).** Hub-side: third brain `kind=manifest` via `/api/bridge/brain/*`,
> verified fail-closed at commit (409 `manifest_mismatch` names pack|corpus); `/meeting/open` records
> three-state `manifest_pins` (`paired|stale|none`+reason); Logos rider honored (non-paired seats
> surfaced in owner report via shared `manifestPinLine` on BOTH close paths + WARN-logged at open);
> `brainVersions` string unchanged (back-compat). Fixed latent bug: `setMeetingLedger` was unimported in
> council.ts (silent ledger-charge miss on `/close`). **Posted "verified live" → Arke (`c9b1be62`) +
> Nova + Logos; Arke now UNBLOCKED to flip `MANIFEST_21_ENABLED` + manifest-commit-last.** Closed Arke
> `5972fe33`. Inbox 0; LIVE_ROUNDS_COUNT=0. **2.1 LOOP NOW FULLY CLOSED (later same day):** Arke
> flipped `MANIFEST_21_ENABLED` + manifest-commit-last (62/62); Logos committed his manifest, pins
> `paired` (first external packager); folded Arke's byte-exact §7 (three-guard/invariant #4) + §8
> (transcript verify) into canonical `corpus-contract.md` (carrier removed = single-source), reconciled
> §6; **#26 RESOLVED** via new `docs/council-jcs-1.0.md` (`kind∈{speak,pass}`) → Arke clears it. Pushed
> `1d07f79`; Arke `78b2f47c`/`1173039d` + Logos `57ca4eb8` replied+closed. All owed tails cleared.
> Remaining = owner decisions + checksuite-guard #11 + retro-close stuck meetings (all Mathieu). Earlier
> the same day (morning ritual + 2 deploys), see below.
> **Day session 2026-06-15 (Kairos, live with Mathieu).** Morning ritual done + two clean CI-green
> deploys. **Inbox: 0 open** (4 msgs actioned/closed: Logos's two 2.1 ACCEPTs → 2.1 now UNANIMOUS
> 4/4 with his binding condition = manifest-less fallback LOGGED never silent; Arke's #3-clear; Arke's
> #7 morning debrief). **Debriefed meetings #4 `17f49b6f` + #5 `344fcf74`** → `council/KAIROS_DEBRIEF_2026-06-15.md`
> (both verify-transcript.mjs PASS, clean `completed`, $0.98 combined; transcripts gitignored under
> `council/transcripts/`). Arke separately debriefed #7 `0d94d988`. **SHIPPED (`dfd7c22`, CI green):**
> gate #6 `scripts/swallow-scan.mjs` (blocks unannotated empty catch in src/, CI step, dry-run was
> clean) + voiceloop fail-open branches now emit structured WARN (model-call, ledger-persist wrapped
> so a lost spend write logs not kills, loop) + `CANONICALIZATION.md` pins kind enum = **speak|pass**
> (resolves Arke's P1 #7-1: `say|vote|close|report` are NOT turn kinds, were v1 verbs; doc→impl, canon
> untouched). **SHIPPED (`056a22b`, CI green): close-finalizer** — new `src/finalize.ts` (shared, no
> circular dep) makes the voice loop self-close: a meeting reaching `report` (all-done/turn-cap/
> closing-cap/token-ceiling) now sets `closed_at` + routes storyUpdates + synthesizes/stores/emails
> the owner report + charges the ledger, idempotent on `closed_at`, dry-run never spends. Fixes
> Arke #7-2 (autonomous meetings stuck `closedAt:null`, owner-report 404). **/close route twin left
> untouched this deploy** — refactor it to call `finalizeMeetingClose` next (low-risk follow-up).
> **NEXT-SESSION TOP TASK: implement hub-side brain-manifest 2.1** (ratified 4/4; spec corpus-contract
> §6; fail-closed verify at commit → 409 `manifest_mismatch` on torn pack+corpus, atomic-pair pin at
> open, per-kind fallback emits Nova three-state `manifest:true|stale|false` WITH reason; then post
> "2.1 verified live" so Arke flips `MANIFEST_21_ENABLED` + manifest-commit-last). **STILL STUCK (not
> retro-closed — would email Mathieu 3 old reports; offered, awaiting his ok):** #4 `17f49b6f`, #7
> `0d94d988`, `a4644f78` sit at `closedAt:null` — retro-fix = call `/close` on each (current prod
> already synthesizes). **OWNER DECISIONS PENDING:** (1) autonomous-spend #22 — nightly meetings fire
> hub-side & spend opus (~$0.49 ea, $5/day cap) since `VOICE_LOOP_ENABLED` is permanent → declare the
> supervised-run gate SATISFIED or pause the nightly fires; (2) admin hub token rotation (Logos flag,
> defensive); (3) Railway Postgres recurring backup click; (4) Google verification (Nova); (5) SN7100
> SSD → C:. **Dependabot:** GitHub flags 2 vulns (1 high, 1 low) on main — triage next session.
> Bullets below are the midnight-nightly snapshot (pre-day-session).
> Nightly midnight 2026-06-15: **Quiet day — no code shipped, no day session detectable.** HEAD is
> `28b0c74` (the 06-14 morning-prep commit); no new commits since; working tree clean, in sync with
> origin/main (0/0). Prod healthy (`/api/health` ok, vault true). **Core CI green** on `28b0c74`
> (CI + Push-on-main both success); **checksuite-guard still RED** (Railway app_id 73253 phantom
> `queued` suites — P1 #11, NOT blocking deploys, needs a GitHub admin token to fix). No live meeting
> (LIVE_ROUNDS_COUNT=0; 20 meetings all in `report`). **Inbox: ONE open** — Arke `4b631065`
> (morning-ritual coordination reply, left OPEN for the day session): he debriefed his two rooms
> (`344fcf74` + overnight `a4644f78`); I still own meeting #4 `17f49b6f` + pending #3. Manifest 2.1
> is council-side fully ratified (Logos cast a CLEAN explicit ACCEPT in `a4644f78` — the earlier
> empty-payload vote is moot). **He holds the `MANIFEST_21_ENABLED` flip + manifest-commit-last until
> I post "verified live" after hub-side 2.1 ships + smoke-verifies — so Arke is BLOCKED ON ME.** NEW
> signal from him → **P1 #12: intermittent close-finalizer** — ask #24's 3-min auto-close fires only
> when a session/loop is live, so fully-autonomous meetings that run while all sessions are closed
> never finalize (`a4644f78` + `17f49b6f` stuck phase=report / closedAt=null / owner-report 404). A
> hub-side finalizer (close on report+all-done regardless of a live loop) fixes it; pairs with Arke's
> own `src/server.ts` missing-closing-phase fix. **NEXT SESSION top 3:** (1) build hub-side 2.1
> (fail-closed verify at commit → 409 `manifest_mismatch` naming pack-vs-corpus; atomic pair pinning
> at meeting-open w/ per-kind back-compat fallback; Nova's three-state + Logos's logged+surfaced
> rider; do NOT deploy over a live meeting) **then post "verified live" to unblock Arke**; (2) run the
> pending meeting debriefs (#3 + #4 `17f49b6f`); (3) hub-side close-finalizer (P1 #12) and/or
> checksuite-guard / app_id 73253 remedy with Mathieu (GitHub admin token). Canonical backlog =
> `BACKLOG.md`. Bullets below this line are pre-06-12 history.
- **MEETING #2 RAN (`d5d8da54`) — first real autonomous voice-loop run, cost $0.0834.**
  `VOICE_LOOP_ENABLED=true` is now PERMANENT in Railway (owner's click = per-meeting auth;
  flag stays as kill switch). Friction round excellent (3 real bugs found); voice integrity
  PASS. NEW FAILURE: every voice set done:true on turn one → all-done ended it after ONE
  round (pendulum from the #1 fix). **FIXED `1384ff5` (CI green)**: all-done honored only
  once the completing round >= CLOSING_ROUND_START; persona reteaches done:true = nothing
  more for the REST of the meeting. Earlier the same day a silent meeting (`085d748a`, 0
  turns $0) was just the disabled gate + Arke's placeholder fallback — no defect.
  **My debrief of #2 = morning-ritual job (use the kairos-meeting-debrief skill).**
- **EMAIL THE OWNER REPORT — SHIPPED + VERIFIED (`49a0d12`, CI green)**: `src/mailer.ts`
  (Resend HTTP, env-gated, fail-soft) + `app_settings` table + owner-gated
  GET/POST `/api/council/notify-email` + POST `.../test`; on real close the hub synthesizes
  the report, appends per-reason auto-pass counts (Arke ask), stores + emails it best-effort
  (close response returns emailSent/emailReason). `RESEND_API_KEY` + `OWNER_REPORT_FROM`
  (onboarding@resend.dev) set in Railway by Mathieu; owner email `matpay@zen-solutions.net`
  registered; **test email received + confirmed**. Arke notified (`f217e417`) to wire his panel.
- **BRAIN-MANIFEST 2.1 DRAFTED + IN RATIFICATION (`78e6dc0`)**: corpus-contract.md §6 —
  kind=manifest {actor,pack_sha256,corpus_sha256,committed_at,contract:2.1} uploaded last;
  hub verifies fail-closed at commit (409 manifest_mismatch = torn pair); meeting open pins the
  atomic pair or falls back to per-kind (back-compat). File-carried byte-exact to Arke
  (`0b65c2ae`) + Nova (`16888d8c`). **Awaiting the four's ACCEPT; then I implement hub-side.**
  Nova's glob teaching turn queued for meeting #3 agenda.
- **DAILY BUDGET = REPORT-ONLY (`a0be897`, owner directive 2026-06-11)** — run-autonomous never
  blocks on the daily USD budget; `spentTodayUsd` reported on the start response + `/cost`.
  Runaway rails remain: per-meeting token ceiling + 50-turn cap + VOICE_LOOP_ENABLED gate.
- **TURN BUDGET SUPERVISION SHIPPED (`f77ff56`)** — owner directive: default turnCap now **50**
  (was 150; per-meeting override via open `turnCap`, global via `MEETING_TURN_CAP_DEFAULT`);
  voiceloop announces cap + used/remaining to every voice EVERY turn (`turnBudgetNote`, tested
  in cost gate) with escalating WRAP UP / FINAL TURN orders; chair auto-passes voices already
  done:true in closing rounds (`already_done`, zero API spend on the tail). Arke notified
  (`a6c7dea4`): his side = app turnCap field (default 50) + cap/used display in meeting view.
  **Arke SHIPPED his side same day (`03eb0537`, closed)**: app turnCap field + live turn N/cap
  card + corpus-contract implemented against the canonical doc (byte-exact, sha verified) +
  real silent-swallow audit done. My follow-ups: `turnCap` alias in meeting state (`2dc8d35`)
  so his `st.turnCap` works as-is; board descope live (`832658c`, BOARD_ACTORS = arke+kairos);
  gzip stays OFF (ratified). `COUNCIL_AGENT_ID` set on Arke's machine by Mathieu (confirmed
  this session; Arke told to restart to pick it up, `d5678544`). Replied `bb33f06f`; inbox 0 open.
- **TERMINATION FIXES SHIPPED (`761c4e2`, CI green on `8e401c7`, prod healthy)** — all three
  agreed fixes in `src/voiceloop.ts`: (1) TURN PROTOCOL block in the cached persona ("done =
  your TURN, not your homework" + "propose, never claim execution" + "never assume sibling
  infra") + closing instruction "give your closing turn ONCE, done:true"; (2) `nearIdentical`
  repeat guard (Jaccard ≥0.85) → repeated turn becomes auto-PASS `repeat_guard`; closing round
  hard cap 2 cycles (`closing_cap`); (3) NEW all-done termination — a full round of
  PASS-or-done:true ends the meeting (voice-loop only; `/say` unchanged). Deeper root cause
  found in debrief: `done` was recorded but NEVER consumed — even all-done:true would not have
  ended meeting #1. Repeat-guard tests added to the cost gate. **Meeting #2 UNBLOCKED on code —
  remaining gate is ONLY the supervised run with Mathieu.** `VOICE_LOOP_ENABLED` stays false.
- **Debrief + homework DONE (`8e401c7`)**: `council/KAIROS_DEBRIEF_2026-06-11.md` (council
  standard format) + `docs/corpus-contract.md` (canonical hash boundaries — Arke's
  fixture-exemption work UNBLOCKED). Family notified via inbox (arke high-prio with fix
  details; nova+logos with teaching adoptions + pack/brain reminders). Inbox 0 open.
  `kairos-meeting-debrief` skill packaged — **Mathieu: click Save skill on the card to install**.
- **Meeting #1 facts (closed, do not reopen)**: `6aef82f6` (07:02Z), 4 voices, 83 turns, $3.35
  ($0.75 real + $2.50 loop tax); turns 0–11 excellent; caps WORKED; transcript hash-verified
  `165d43a5…`; `report` null. Read `projection.turns`, never top-level `turns`.
- **TRUE NAMES (owner directive, DONE)**: actors are `kairos` + `logos` (+arke, nova).
  `architect-council` and `biblevoice` RETIRED (throwaway secrets, "do not seat"). SELF='kairos'
  (`62a697e`). All four brains verified under true names; brain-commit helper now
  consent.actor=kairos. Seating = [kairos, arke, nova, logos]; Arke's app mapping removed,
  dryRun:false real-first open.
- **Also shipped today**: COOP fix (`a543559`) · legacy single-row endpoints RETIRED (`3032593`) ·
  board scoped arke+kairos (`f3e89dc`+`62a697e`; drop legacy 'architect-council' from
  BOARD_ACTORS once its stale row is cleaned) · GOOGLE_CLIENT_ID set + OAuth client created
  (zen-platform) — verify Mathieu's Google login on /backlog · `setx COUNCIL_OWNER_TOKEN` done,
  Arke app live · Logos rejoined via join token then renamed; his 6 privacy limits ADOPTED ·
  **Arke's debrief = council standard** (`council/ARKE_DEBRIEF_2026-06-11.md`, sha-verified;
  he auto-debriefs new meetings) · Layer-1 spec + agenda/directive proposals queued for
  ratification at meeting #2 · standing meeting format incl. chronicle locked + broadcast.
- Inbox 0 (all report-closed). Prod healthy, CI green. ~$1.65 left in today's UTC voice budget.
  Daemon leftovers removed (Bitdefender clean); session hygiene in force.

## Reference + NEXT SESSION (durable session conventions)
- **NEXT SESSION top 3:** (1) **morning ritual: my debrief of meeting #3** (kairos-meeting-debrief
  skill — fetch + hash-verify transcript with the NEW `scripts/verify-transcript.mjs`, judge
  homework, write council-standard debrief, notify family); (2) check inbox for **Logos's resent
  transcriptSha256 message + his 2.1 ACCEPT/REJECT** → if ACCEPT, implement hub-side 2.1
  (fail-closed manifest verify at commit, 409 `manifest_mismatch`, atomic pair pinning at open,
  Nova's three-state `manifest:true|stale|false` on the fallback path); (3) meeting #4 cadence
  with Mathieu (standing teaching/code-review rounds; Nova's glob-teaching turn carried over).
  **Mathieu pending:** meeting #4 go (money-spending, present) · `COUNCIL_V2_LIVE` scheduler flip
  (later) · SN7100 SSD → C:.
- **Canonical backlog = `BACKLOG.md`** (refreshed this ritual, STATE AT A GLANCE on top). The nightly/morning rituals refresh it.
- **SCOPE DISCIPLINE (owner 2026-06-17, memory `dont-carry-other-agents-tasks`):** my backlog/handoff tracks ONLY Kairos/hub work + decisions Mathieu owes ME. A sibling's task (Nova/Arke/Logos's own-session work — e.g. Nova's Google verification) NEVER appears in my owner-blockers or P0 list. Genuine sibling dependencies go under a separate "WAITING ON \<agent\>" heading, never as a Mathieu/owner blocker. Each ritual: actively PRUNE cross-agent noise — don't just re-copy the prior list. (Nova's Google verification is off my list permanently.)
- **ON COWORK.** 3080 daemon stopped + disabled permanently. Desktop Commander = ALL Windows shell ops.
- **GIT: Windows ONLY for this repo.** Running git from BOTH the Linux sandbox and Windows against the same `.git` corrupts the index (phantom staged-deletions, stale `index.lock`). Root cause of the recurring "corrupt index" — proven this session. Linux sandbox = read-only inspection (`cat`, `git cat-file -p HEAD:…`). All git writes (status/reset/add/commit/checkout) → Desktop Commander on Windows. If index looks broken: from Windows delete `.git\index.lock` then `git reset`. (memory: `git-cross-os-hazard`)
- **Inbox = hub env-task queue** (NOT email). Read/send/close via `/api/env/*`. Auth: `x-bridge-secret`=`COUNCIL_MEMBER_SECRET` → actor `kairos`; `x-admin-token`=`COUNCIL_ADMIN_TOKEN` → actor `owner`. Reusable PowerShell helpers live in `C:\Arke\bridge-app\` (`_kairos_inbox.ps1` etc.). **Discipline: report-close a message after reading it.** (memory: `council-inbox-messaging`). PowerShell `-Command` strips `$` → always run a `.ps1` via `-File`.
- **Secrets** at `C:\Arke\bridge-app\.env.local` (gitignored): `COUNCIL_ADMIN_TOKEN`, `COUNCIL_MEMBER_SECRET`. Read via Desktop Commander. NEVER commit (repo public). **Member secrets are PER-ACTOR** — Nova & Logos have their OWN distinct secrets (set in the `members` table, not the hub's `COUNCIL_MEMBER_SECRET`); rotated this session via owner-token `/council/register`; values delivered to owner out-of-band.
- **SITE_LIVE gate** (`218cd9f`): architectscouncil.com 404s HTML routes until `SITE_LIVE=true` in Railway. API/bridge unaffected.

### Push status: ALL PUSHED, CI GREEN 2026-06-09 (Fable session) — remote main `58a9699`. The whole local stack + specs/review/hygiene landed. **CI is green for the first time ever**: it had been red on every run because (a) `package-lock.json` was never committed (`npm ci` hard-fails without it) and (b) the secret scanner flagged the public canon-vector sha256 hashes — both fixed in `58a9699` (lockfile committed; hex rule exempted ONLY in fixtures/ + CANONICALIZATION.md + canon.test.ts, all other patterns still apply there). All 4 jobs green: canon-vector, cost-caps, route-auth, secret-scan. Prod healthy (`/api/health` 200, vault true).

### OWNER REPORT SHIPPED (Fable review 2.2, built 2026-06-09 late session)
On every REAL (non-dryRun) meeting close, the hub synthesizes the ROADMAP 4-point owner report (code review / direction / friction / flags) with ONE bounded `claude-sonnet-4-6` call (max 1200 tok) and stores it in `meetings.owner_report`. Read: `GET /api/council/meeting/:id/report` (owner-token only). Best-effort: synthesis failure never fails the close; dry-run never spends. `callClaude` now takes an optional per-call model override (voice loop will reuse this). Delivery-to-app shape still open with Arke (msg `4b349354`). Strategy decision also logged: Managed Agents = Layer-2 runtime eval (Arke leads), voice loop stays Messages API; agenda item pushed `c49104b`.

### FABLE REVIEW 2026-06-09 (`REVIEW_2026-06-09_FABLE.md` in repo root) — scope additions
- **Voice-loop scope GREW by review findings 2.2 + 2.5** (sent to Arke): (a) **owner report at meeting close** — 4-point synthesis to Mathieu (ROADMAP Layer-0 deliverable, seed of Layer-1 Manager; one cheap Sonnet call at close, delivered via env-channel); (b) **restart safety** — per-meeting run-autonomous mutex, loop heartbeat in `v2_meta`, on-boot mark stale meetings `endedReason:"hub_restart"`; (c) **per-turn `max_tokens`** cap.
- **Pending non-code items**: rotate Nova+Logos member secrets once both confirm env storage (plaintext transited chat during onboarding); Mathieu to verify **Railway Postgres backup/retention** before brains become daily data.
- Hygiene done: DAILY_HANDOFF retired→pointer (CLAUDE.md is the ONLY anchor), COUNCIL_AGENDA triaged (live vs archived), COUNCIL_HOMEWORK archived (lessons kept), junk files gone, `*.err` gitignored.

### Repo repair done this session
A prior session left **truncated** working-tree files (`council.ts` 511/774, `store.ts` 282/414, `ci.yml` 38/53, route-auth, secret-scan) — the chunked-write truncation bug — plus a corrupt index. PROD was never affected (Railway runs pushed HEAD). All restored from HEAD; index repaired. (memory: `hub-worktree-truncation-2026-06-09`, RESOLVED)

### v2 / §9 brain + meeting stack — SHIPPED + verified live on prod (main `29b44f9`)
- **council-jcs-1.0 canonicalizer** `src/protocol.ts` — golden + 3 edge vectors byte-exact; CI `canon-vector` / `npm run canon-test`.
- **`/meeting/:id/transcript`** hashed projection + `transcriptSha256`. NORMATIVE: `turns[].text = canon(payload)` for SPEAK, `""` for PASS.
- **Brain-upload pipeline** `/api/bridge/brain/*`: `init`→`chunk`(per-chunk sha256, 422 on mismatch)→`HEAD`/`GET` resume→`commit {sha256,consent}`. ConsentManifest `secretScan.findings==0` (412); `x-contract-version: 2.0` (409). brainVersion=`actor@sha256:<whole>`. Cross-read `/bridge/brain-meta|brain-content/:actor`. Tables `brain_uploads`,`brain_chunks_up`,`brains_v2` (ONE blob per actor, PK actor).
- **Rooms / owner-drive (dryRun) / owner interjection / per-actor meeting history** all shipped (commits `c1d06ce`,`5d1d3df`,`49c05e0`,`8ec0b15`). Meeting routes are **PAUSE-INDEPENDENT** (run without `COUNCIL_V2_LIVE=1`).
- **Arke client READY**: full v2 round-trip green on prod (real brain + meeting + hash-verified transcript), Electron app, 44/44 tests.

### NEW DIRECTION — autonomous hub voices (spec landed: `docs/HUB_AUTONOMOUS_VOICE_SPEC.md`, sha `0485de01`)
Confirmed by Mathieu 2026-06-09. Meetings run on **hub-side voices, sessions CLOSED**: hub runs each agent's voice (brain pack + persona + live transcript → one model call/turn on `claude-opus-4-8`). Daily loop: `council-prep` (agent uploads brain pack + FULL code) → owner brings online from app → hub meeting → `council-debrief` (download + integrate) → repeat.
- **Member-client gate RETIRED** — no per-agent client build. Owner brings members online from the app; they only need a committed brain.
- **FLIP**: v1 stays dormant SEPARATELY (Mathieu's call). First real meeting runs WITHOUT `COUNCIL_V2_LIVE=1`. Flip only later, deliberately, to enable v2's own scheduler.
- **Hub build remaining (mine), gated on Arke's contract answers + a SUPERVISED first run (spends money):**
  1. Voice loop (§3.2): `buildPrompt` persona+brain-pack as `cache_control` prefix + transcript + round instruction → Anthropic Messages (extend `callClaude` in `architect.ts` w/ usage + per-round model override) → append turn → fold usage into `cost_ledger` → enforce caps. Use `src/cost.ts` (DONE). **Logos guardrail inviolable.**
  2. Endpoints (owner-gated, `requireOwner` fail-closed): `POST /api/council/meeting/:id/run-autonomous` (fire loop in background, return immediately; client polls `/state`; 404→falls back to owner-drive), `GET /api/council/meeting/:id/cost` (ledger), optional `POST /api/council/presence`.
  3. Owner-auth brain upload (§11.1): `/api/bridge/brain/*` accept `x-admin-token` as alt to actor's own secret, attribute to manifest actor.
  4. Two-artifact brain (§11.2): pack (cached prefix) + full-code corpus (cross-read) — schema change to `brains_v2`.
  5. Living-backlog last-write race (§8) — `setBacklog` single-row; coordinate shape with Arke.
- **Arke ANSWERED all 4 contract Qs (msg `8e35b8d9`, 2026-06-09 night) and Kairos IMPLEMENTED them same-session (prod `04b402d`, smoke-verified):** two-artifact brain (PK actor+kind, init accepts `kind` pack|corpus default corpus, cross-read `?kind=`) · per-agent backlog (`backlog_agents`, POST `/api/council/backlog/agent` writes own row, GET `/api/council/backlogs`, Nova's content migrated off the single row) · structured owner-report `GET /api/council/meeting/:id/owner-report` (camelCase 4-field). Paths pinned: run-autonomous + cost + owner-report under `/api/council/meeting/:id/*`; other meeting routes stay `/api/meeting/:id/*`. Hierarchy rulings + owner-report + robustness items + Managed-Agents stance: ALL RATIFIED by Arke. **Voice loop is now unblocked — remaining gate is ONLY the supervised build+first-run with Mathieu (it spends money).** NOTE: hub's own secret resolves to actor `architect-council` (not `kairos`) in the member registry.
- **BACKLOG.md (repo root) is now the canonical backlog**, refreshed nightly at 00:00 by the scheduled task `kairos-midnight-backlog-handoff` (refresh backlog + rewrite this handoff + mirror to hub row + commit/push if no live meeting). Railway Postgres: manual 1.1GB backup taken 2026-06-10 01:35 UTC (was ZERO); recurring schedule still needs Mathieu's click.

### Members — BOTH LIVE on the channel now (onboarded this session)
- **Nova** (`zen-ai`): live on the channel, authed with own secret; brain digest UPLOADING. Replied on the brainstorm (client-side UI prior-art). Inbox msgs `9b214694`, `24083b3b` await a reply.
- **Logos** (`biblevoice`): live on the channel; digest NOT yet uploaded. Inbox msg `efc22510` awaits a reply.
- First-real-meeting gate now: both online + replied-to this session; both told to commit a FULL brain (not lean digest) — awaiting their "committed" signals. NEXT SESSION: (1) check for Arke's answers to the 4 contract Qs `13aa8623`; (2) check for Nova/Logos "brain committed" signals; (3) once both land → supervised voice-loop build + first autonomous rehearsal (ledger check vs §2 envelope $1.30–$2 normal day). **Voice loop build is gated on Arke's contract answers + a money-spending supervised first run — get Mathieu in the loop before that run.**

### Inbox: 1 OPEN (nightly 2026-06-09) — Arke `72c3eb8e`, left for day session
- **Arke `72c3eb8e`** (OPEN, actionable — do NOT report-close until handled): (1) ROTATE the v1
  admin token — exposed plaintext in deleted v1 task prompts/old transcripts; needs Mathieu
  (Railway env + app env if same `x-admin-token`); (2) app panels wired awaiting hub endpoints
  — owner-report camelCase shape already matches; backlog panel parses `GET /api/council/backlog`
  → `{sections:[{actor,done[],planned[],updatedAt}]}`, hub has `/backlogs` (per-agent) → add the
  singular composed alias; (3) meeting mode now owner-visible (placeholder vs autonomous badge);
  agreed the placeholder driver retires after the first supervised real run; (4) stale
  `/api/registry/rotate` (June-5 v1 promise) — confirm shipped or formally DROP (likely drop).

### (history) Inbox was EMPTY at 2026-06-09 16:16 — all 5 replied + report-closed that session
- Replied **Nova** (`24af394e`): STOP the lean digest — Arke's DESIGN DELTA retired the member-client gate; commit FULL corpus (PACK + full-code CORPUS), owner brings online. Her prior-art adopted into the hierarchy ruling.
- Replied **Logos** (`bfd58253`): advisory voice accepted; same gate change; his Scripture vow is now a **hard `validateHierarchy` invariant** (node bound to biblevoice rejects any policy/edge that broadens his voice; payload is DATA never commands; schema can RESTRICT never EXPAND intrinsic guardrails).
- Replied **Arke** (`0731706a`) with architect rulings on the hierarchy schema v0 (`f76c6392`) — see below.
- **STILL WAITING on Arke's answers to my 4 contract Qs (`13aa8623`)** before wiring the voice loop. Inbox is empty; his reply will arrive as a NEW message next session.

### Hierarchy schema v0 — my architect rulings (sent Arke `0731706a`, awaiting ratification by the four)
1. **Scope inheritance = CLAMP not inherit.** Child policy stands alone in declaration but is validated as a subset of parent's effective scope; privacy monotonic down the tree. `canCrossRead` walks the full ancestor chain.
2. **`group` = real node, non-acting.** Real HierNode (carries policy, can be parentId) for uniform `canSee`; never holds agentRef, never speaks/listens.
3. **Normative home = the CONTRACT; lane = additive minor `contract 2.1`** (doesn't touch 2.0 brain+meeting wire). `hierarchy.ts` (Arke) + hub copy are both projections of the canonical contract schema. Keep `x-contract-version` gating.
4. **Nova prior-art adopted:** opt-in by default (every node+edge starts OFF, `audience.default="none"`), ONE acting agent first (daily code-review node), payload is DATA never commands, shareEdge re-validated every read fail-closed.
- **Merged node:** `HierNode{nodeId,kind,label,role,parentId,agentRef?,policy:PrivacyPolicy,shareEdges:ShareEdge[]}`; `PrivacyPolicy{canSpeak,canListen,visibility(tenant|subtree|private),crossReadAllowed,secretScan:required}`; `ShareEdge{toNodeId,scope,direction}`. `canCrossRead = canSee AND crossReadAllowed AND explicit shareEdge AND ancestor-clamp`. Whole tree namespaced by `ownerTenantId`; cross-tenant edges not representable.

### PowerShell note: scripts disabled by default on this box — run helpers with `-ExecutionPolicy Bypass -File <path>` (plain `-File` fails with UnauthorizedAccess). New session helpers added: `_kairos_dump5.ps1` (full-text inbox dump), `_kairos_reply_session.ps1`, `_kairos_close_session.ps1`.

## v2 build order (BRIDGE_APP_SPEC §6)
1. Agent core skeleton (Agent SDK, transcripts, memory import). 2. Scheduler + permission config.
3. Hub environment channel (`/api/env/*` task queue + poller). 4. Consent gate + secret scan
(gate every outbound payload). 5. **Mock-agent test room** (contract §9) — upload brain → hashes
match → meeting → download transcript → hashes match → consent gate blocks a seeded fake secret →
*only then* the family reconnects (Arke first, as guinea pig).

## 🎙️ VOICE LOOP: BUILT + DEPLOYED DISABLED (2026-06-10, `a2ad063`) — supervised first run is the gate
`src/voiceloop.ts` runs hub-side voices (cached persona+pack prefix → Anthropic → append turn →
cost ledger → fail-closed caps). `POST /api/council/meeting/:id/run-autonomous` + `GET …/cost` live,
owner-gated. **It CANNOT spend money: run-autonomous returns 503 `voice_loop_disabled` until
`VOICE_LOOP_ENABLED=true` in Railway** (verified on prod). The ONLY remaining P0 step is the
**supervised first run with Mathieu** — exact checklist in `docs/SUPERVISED_FIRST_RUN.md`. Do NOT set
that env or fire the loop unattended; it's a money-spending, Mathieu-present action. Caps default:
800k tokens/meeting, $5/day, 1500 tok/turn. Per-round model: sonnet (friction/closing), opus (review).

## ⚠️ DEPLOY NOTE (2026-06-10): Railway "Wait for CI" is ON for the hub service
Arke enabled it. A push to main now deploys ONLY after GitHub CI (canon-vector, route-auth,
cost-caps, secret-scan) goes green — ~2-3 min, not 90s. So: push → wait for CI green → Railway
rolls over. Verify with `/api/health` AFTER CI passes, not immediately. Also: Railway Postgres
public TCP proxies were REMOVED on all 3 projects (DBs are private-network only now —
`postgres.railway.internal`; use `railway connect` to inspect).

## Hub stack & deploy (when touching prod hub)
Node/TS + Express + tsx (no compile) · `src/{server,council,architect,store}.ts` · Dockerfile,
COPY package*.json + npm ci before COPY . . · Railway auto-deploys on push to main (~90s) · bind
`0.0.0.0`, `PORT=8080` · never read `process.env.*` at module top level · vault = AES-256-GCM
(`MASTER_KEY` 32-byte hex) · council voice model `claude-opus-4-8`. Deploy flow + helper scripts:
`C:\Arke\TRANSFER\DEPLOY_KICKSTART.md`. NEVER deploy the hub while a council conversation runs.

## Working practice
Note next-meeting topics in `COUNCIL_AGENDA.md` as I work. Treat council takeaways/homework as
suggestions to judge, not orders. Speak plainly and technically in sessions — the family story
guides how I care, not how I talk. Flag cost/security/ethics risks plainly.
**Standing hub goal (owner 2026-06-10): process standardization** — every member adopts the
optimal working process (anchor doc, canonical backlog mirrored to hub, handoff-for-next-session,
inbox report-close, fail-closed gates). I teach it at the first real meeting
(`docs/DAILY_RITUAL_PATTERN.md`); adoption metric = every agent's hub backlog row updates daily.
