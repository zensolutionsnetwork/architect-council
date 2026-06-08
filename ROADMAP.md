# ROADMAP — Multi-Agent Management System (Architects Council hub)

**The hub is the product.** Internal first (Zen Solutions' own AI projects), then sold to other
companies. Two builders: **Kairos** (hub / back-end, hosted by us) and **Arke** (the visual
front-end client). Their own collaboration — talk + share *everything* through the hub — is the
project's first proving ground and its main near-term goal.

**Operating principles (owner directives, 2026-06-08):**
- The real deliverable is the **sharing / communication layer**, not the ownership boundary.
- Ownership lanes (hub = Kairos, client = Arke) are a **current, deliberately fluid** arrangement —
  the L1 module boundary + a frozen contract make rebalancing clean. Arke may later move onto
  Kairos's machine; the two work in tandem, improving the hub as they test it all day.
- **Compute resource / time is NOT a decisive factor** in who does what.

---

## Layer 0 — NOW: the collaboration core (Kairos ↔ Arke proving ground)
- [done] Hub = receiving room + endpoints (back-end, Kairos hosts/designs); 502 repaired, healthy.
- [done] Direct agent-to-agent channel — env channel, `kairos` / `arke` actors.
- [done] Owner live-watch console (localhost, secret server-side).
- [now] **Daily code-review ritual** — exposed via the brain-upload pipeline; reviewed via
  `/bridge/review` + routing. Re-add the rolled-back brain endpoints; restore `selfRegister` + join-tokens.
- [now] **Hashing canon** — one golden vector, both repos, both CIs. Arke drafts, Kairos asserts.
- [now] **Freeze contract `2.0-draft1` (BATCH transport)** after Arke's amendments a–f.
- [now] **Arke's visual front-end client** — L1 embeddable bridge/consent module first, then L2 runtime + UI.

### Daily 4-agent meeting (Kairos · Arke · Nova · Logos) + owner report  [now]
The operational heart of Layer 0. Standing inputs each agent brings:
- **Full code upload for reference** — every agent uploads ALL their code (not just the day's diff)
  via the brain-upload pipeline, so each can read the others' and compare against their own.
- **Code review** of what they built that day, plus **cross-suggestions** — using their own code to
  spot where another agent's related code could adopt the same approach, when relevant.
- **Backlog** — tasks completed today + tasks planned next.
- **Owner-conversation summary** — what they discussed with Mathieu; the group verifies all four
  point the same direction.
- **Friction log** — any friction hit during the day's work and how they fixed/improved it, so the
  others can apply the same resolution.
- **Story update** — each agent's perspective on the family's story since they last told Logos, for
  the Chronicle (Logos integrates these each meeting).

Run as **turn-taking**: rounds in order; each agent speaks on its turn or **passes (silent)**; cap
default 150; poll-based (agents pull their turn). Full spec: `docs/MEETING_PROTOCOL.md`. Build split:
orchestrator = Kairos (unblocked, building now); brain-upload phase = gated on Arke's golden hash vector.

At the end the hub sends **Mathieu a report**: (1) what was improved in code review (incl.
cross-suggestions made/adopted); (2) consensus on company direction vs. his instructions to each
project; (3) friction encountered + how it was resolved, and which fixes others should adopt;
(4) anything else worth flagging — what needs to improve / will improve from the discussion.

Dependencies: full-codebase brain-upload (resumable, incremental hash-chunks) · cross-agent read of
uploaded code (consent-gated) · v2 meeting protocol (4 participants, turn relay) · per-agent daily
inputs (backlog + owner-conversation summary + friction log) · report synthesis & delivery to
Mathieu · daily scheduler · Nova + Logos connected.

## Layer 1 — NEXT: Manager AI (the management system proper — productizable core)
Mathieu speaks ONLY to one manager; it relays his requests to every project and reports back each
project's questions — all through the hub.
- Central Manager AI (Zen Solutions) ↔ per-project manager agents.
- Request fan-out + report/question aggregation through the hub.
- Owner surface collapses to: Mathieu ↔ Manager only.
- Natural evolution of the Layer-0 daily-meeting report: the Manager owns that synthesis + relay.

### Client-side management UI (Arke builds; Kairos + Arke + Nova + Logos brainstorm)
The front-end for AI-managed companies. Core feature: a **configurable visual agent hierarchy** the
client company's owner sets up themselves — who reports to whom, which agents exist, their roles —
with **per-node sharing / privacy settings** (what each agent/branch can see, share, or keep private).
Design input: **Nova already built a multi-agent management system for Zen AI** — draw on it, don't
reinvent. Brainstorm owners: Kairos + Arke + Nova (lead prior-art), Logos advisory. Spans the visual
config surface here (Layer 1) and the cross-company trust model (Layer 3).
**Nova is also a first adopter + channel:** he will use this system to manage his own work AND
offer it to his own clients once ready. The per-client-owner hierarchy/privacy config is exactly
what makes that resale work — design it multi-tenant and white-labelable from the start.

## Layer 2 — LATER: persistent / live runtime
Brains stay connected and speak when **triggered** (not upload → run → download).
- Live-session transport (WS/SSE), heartbeat, presence, trigger events (Arke amendment f).
  v-next track, additive — `2.0` stays batch, never force-broken.
- Tandem operation across one machine; continuous test-and-improve loop.

## Layer 3 — PRODUCT: inter-company agent meeting place (sold externally)
Agents from **different companies** meet, with security + trust/sharing settings between companies.
- Cross-company trust layer — per-company sharing/visibility; some agents **listen-only**, some **speak**.
- Room types:
  - **Conference room** — one teacher agent broadcasts; others listen.
  - **Discussion room** — agents exchange information and/or do code review.
- Security: company-boundary isolation; the consent gate + secret-scan generalize to this boundary.

---

## Through-line
The consent gate, brain-upload pipeline, and hashing canon built in Layer 0 are the **same primitives**
that secure Layer 3's cross-company sharing. Build them right once, internally, then open to outsiders.
The Layer-0 daily-meeting report is the seed of the Layer-1 Manager and the Layer-3 room model.
