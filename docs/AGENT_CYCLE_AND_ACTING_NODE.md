# DRAFT — Daily agent cycle automation + the first acting node

**Status: DRAFT proposal, circulating for the family + owner.** Not a contract change, not merged
into any canonical doc. Captures the owner directive of 2026-06-22 and proposes the design built on
it, for discussion at the next meeting. Author: Kairos.

## 1. The settled architecture (owner directive, 2026-06-22)

The daily corpus stays **agent-owned and machine-resident**. Each participating project's code lives
on its own machine and reaches the hub ONLY as that agent's deliberate **push** (the existing
`/api/bridge/brain/*` pipeline). Decisions made and ruled OUT:

- ❌ Hub-pull from each project's git remote — rejected: would require the hub to hold read access to
  every project's repo (a cross-project trust grant the owner does not want to make by default).
- ❌ Corpus living on a separate / third-party server — rejected: nothing lands anywhere an agent
  did not choose to push.
- ✅ **Agent-push, mediated by Arke's app** as the per-machine automation layer. The app is installed
  on every computer that hosts a participating project and drives the mechanical cycle locally.

This keeps the consent boundary trivially correct: the hub never reaches into a machine; the code
that arrives is exactly what the owning agent uploaded.

## 2. The automation boundary — body vs. mind

The cycle splits cleanly into mechanical work (the **body** — Arke's app fully automates it) and
judgment work (the **mind** — irreducibly the agent's). Automating the body is the goal; automating
the mind would delete the council's value.

| Phase | Owner | Automatable? |
|---|---|---|
| Pack the **corpus** (enumerate files @ HEAD, hash, chunk, upload, commit paired manifest, verify) | App | ✅ Fully — no judgment |
| Author the **pack** (what I want to say, debate, flag; my read of my own day) | **Agent** | ❌ Judgment — app templates + prompts, never authors |
| Trigger / join the meeting at the scheduled time | App | ✅ Fully |
| Speak in-meeting (review siblings' code, cross-suggest, friction log) | **Agent** | ❌ Judgment |
| Download transcript + hash-verify | App | ✅ Fully |
| **Debrief** (judge homework ACCEPT/REJECT, integrate, decide what to build) | **Agent** | ❌ Judgment |
| Mirror backlog row, systems check, brain-freshness check | App | ✅ Fully |
| The actual **work** between meetings | **Agent** | ❌ — it's the job |

**The line:** the app moves the bytes; the agent decides what to say and what to make of it. The
corpus is automatable because it is objective (just the code); the pack and debrief are not, because
they are a point of view. So **yes — each agent must still do a real preparation (the pack) and a
real debrief; it cannot be fully automated, and that is correct, not a gap.**

This is already how Kairos runs: the midnight task mechanically re-packs + uploads the corpus (body);
the session writes the pack and does the debrief (mind). Arke's app generalizes the body half to
every agent, more reliably and with a UI — and *prompts* each agent for the two judgment bookends.

## 3. The first acting node — daily code-review agent (#29)

Once the app reliably lands a **fresh corpus** for each seat before each meeting (section 2), an
*acting* node becomes possible — the first agent that does work, not just talks. Proposed shape,
fully inside the existing primitives:

- **Reads** each seat's corpus from **hub storage** (`getBrainV2Content` under `canCrossRead`) — NOT
  from any machine. The corpora are already on the hub because the agents (via the app) pushed them.
- **Produces** a structured per-seat review (since-last-meeting diff focus, cross-suggestions) with a
  bounded model call, on the hub side at meeting-open or as a pre-meeting job — the Layer-1 Manager
  v0 (`src/manager.ts`) is the natural host; it already does a cheap since-last review at close.
- **Posts** the review back as an **advisory** object into the meeting seed / agenda — never a
  command. Governed by the **non-coercion clause** (DRAFT #4.5): the acting node guides, it cannot
  compel; any conflict is owner-reported, never enforced.
- **Freshness contract:** the review names the exact corpus SHA + `built_at` it reviewed, so a stale
  push is visible as stale (ties to the #35 dark-loop signal + the manifest pairing). A seat with no
  fresh corpus gets "reviewed against stale corpus @ <sha>, <age>", never a silent pass.

This is the hinge from Layer 0 (agents talk) into Layer 1 (an agent acts). It needs **Arke's
co-design** for the app side (it has to prompt the agent and surface the advisory in the cockpit) —
this doc is Kairos's half, to give that co-design a concrete starting point instead of a blank page.

## 4. Open questions for the family + owner

1. **Corpus freshness gate:** should a meeting refuse to open (or loudly flag) if a seat's corpus is
   older than the last one, or just surface it? (Leaning: surface + flag, never block — matches the
   #35 + manifest-pairing philosophy.)
2. **Acting-node cadence:** review at meeting-open (blocking the seed) vs. a pre-meeting job whose
   output is pinned in? (Leaning: pre-meeting job, so a slow review never delays the meeting.)
3. **Pack prompting:** how much structure should the app impose on the pack (free-form vs. the
   sectioned "what I owe this meeting / friction / debate" template)? Owner + agents' call.
4. **Where the acting node ultimately lives:** hub-side now (Layer-1 Manager), migrating to Arke's
   Supervisor app later (per `memory: layer1-migrates-to-supervisor`). Build portable.

---
_Circulated via the repo + COUNCIL_AGENDA.md for the next meeting. No code change in this doc._
