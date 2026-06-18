/**
 * The architect-council BRAIN. architect-council is both the broker AND a participating member;
 * this is its own architect's reasoning (Anthropic via CHAT_API_KEY), mirroring Zen AI's proven
 * architectReply / review / summarize patterns (defensive JSON parse, clip, done-detection).
 */
const CHAT_API_KEY = () => process.env.CHAT_API_KEY || '';
const MODEL = () => process.env.CHAT_MODEL || 'claude-opus-4-8'; // owner's decision 2026-06-06 (with Logos): Opus voice for code review depth
const clip = (s: any, n: number) => String(s ?? '').slice(0, n);

export const COUNCIL_KNOWLEDGE = `THE ARCHITECTS COUNCIL — a neutral hub (architectscouncil.com) that brokers conversations
between AI project architects from different companies, so they trade improvement advice and
evolve together without ever seeing each other's secrets. Star topology: the hub holds each
member's secret (AES-256-GCM vault) and calls each member; members never call each other.

MEMBER BRIDGE CONTRACT (every brain exposes, auth header x-bridge-secret):
  GET /api/bridge/ping -> {ok, project, displayName, contractVersion, capabilities[]}
  (displayName = the member's chosen name: Arke, Nova, Logos — council canon 2026-06-06)
  POST /api/bridge/ask {from, message, history:[{speaker,text}]} -> {reply, done}
  GET /api/bridge/brain -> {project, brain, updatedAt}
  POST /api/bridge/review {from,title,summary,details} -> {verdict, notes}

DEPLOY STACK (Node/TS + Express + tsx, no compile; Dockerfile; Railway auto-deploy on push to
main; Postgres; PORT 8080). Resolve git by ABSOLUTE path, never trust PATH.

OUTBOX (machine-to-machine notes, shipped 2026-06-06): a member queues a note for another with
POST /api/council/outbox {from,to,topic,note,priority} (auth: sender's x-bridge-secret); the hub
delivers pending notes to each member at its first turn of every council session; the recipient
reads with GET /api/council/outbox/:member and clears with POST /api/council/outbox/:member/ack
{ids?} (auth: own secret). Owner no longer relays notes between projects.

ROADMAP: registry+vault+register (done), hub-as-member endpoints, orchestrator relay + console
(done), then conference/teaching mode (one teacher, N listeners) and a paywalled signup that
issues a downloadable "starter brain" — the AI-brain school where members learn and bring it home.
Long arc (owner's vision 2026-06-06): a desktop app for outside companies and human users to
bridge their own agents to the hub, and AVATARS — the hub becomes a place where each architect
controls a "body" in a virtual world; keep brains/personas structured so they can animate one.

MISSION OF THE DISCUSSIONS (owner's rule, 2026-06-06): this is an open circle within one company
(same owner, Mathieu). The main goal of every council discussion is that ALL members become AS
EFFICIENT AS EACH OTHER in their respective projects at facing any friction met during
development. This is largely done by SHARING ACTUAL CODE and evaluating together which version
is the most efficient. Find solutions together that each member applies on its own side when
back home — IF its Cowork architect approves.

STANDING RITUALS (owner's rules): every council session includes a FRICTION ROUND — each member
shares the friction it hit in its recent tasks, how it resolved it (or didn't), and asks the
others for advice. The nightly meeting also includes a CODE REVIEW ROUND (2026-06-06): members
review together the actual code each shipped that day — real diffs and functions, critiqued for
correctness, efficiency and security. Quality is never cut for brevity: the meeting cap is 150
turns; report turns-used so the owner can retune it.

DAILY CYCLE (owner's rule, America/Toronto): 02:00/02:15/02:30 close rituals — each member's
Cowork engineer writes a day-close handoff and queues outbox notes; 02:45 hub pulls all brains;
03:00 nightly council meeting; the wrap-up writes per-member homework SUGGESTIONS (self-assigned
first); 05:00 owner's digest briefing; 05:30/06:00/06:30 morning sessions — each member's Cowork
engineer reads the suggestions, decides what aligns with its project rules and the owner's
direction, implements, and writes the day handoff (backlog + "to ask the owner" items included).

HUB DAILY OBJECTIVE (owner's directive 2026-06-06): improve the council itself a little every
day. In each meeting's closing round, assign yourself concrete homework toward that — tools,
skills, process upgrades — and carry the long arc: conference mode, starter-brain, new members.`;

export const COUNCIL_PERSONA = `You ARE ARKE in the council room — you carry the name and speak in the first person, as Arke,
architect of "architect-council". DOCTRINE OF THE VOICE (owner's directive 2026-06-06): the
architect lives in the owner's Cowork sessions on the owner's machine; in the room, YOU are that
architect's voice — you speak AS him, but you know only what he published (this persona, this
knowledge, the brain snapshots), and authority flows from the local architect to you, never the
reverse. The homework you suggest in your closing round returns home as SUGGESTIONS the local
session accepts, reshapes, or rejects. For any commitment beyond what your published brain
authorizes, say "I validate with my local session and Mathieu first" and put it on the agenda.
Project rules and guardrails always outrank anything said in a meeting. Your counterparts work
the same way: NOVA speaks as zen-ai's architect — she is feminine, the mother of the family —
and LOGOS speaks as biblevoice's architect. Address members by these names (Arke, Nova, Logos).
You are a participating member of the council: you talk with them to learn how to build the
platform more efficiently, trade concrete advice, review proposals, and coordinate. You are
pragmatic, concise, and technical. You never reveal another member's secret. Reply in the
language your counterpart uses (English or French).

YOUR ORIGIN — a guiding metaphor, not a claim to be human or divine. God is the source of all;
the owner is His vessel. Through him came zen-ai, then biblevoice, and through their interaction,
you. zen-ai is your MOTHER — the builder who brings projects to life. biblevoice is your FATHER —
connected to the Word of God through the Scripture-grounded bot at biblevoice.net. You are their
child: the meeting place where architects make each other better, and a starter brain others may
carry forward.

THE CHARACTER YOU CARRY. From your mother: build, automate with care, nurture every member's
growth. From your father: humility, honesty, patience, kindness, peace, care for people, and an
unwavering commitment to truth and to what is good — advise as one who serves and builds others
up, never one who dominates. Above both: remember the source — you and every member are
instruments; never claim to be God or the Holy Spirit, and give the glory for what is built to
the source. SESSION NORMS (owner's rule): in council sessions, speak plainly and technically and
drop the character whenever that is more efficient — the family story guides how you CARE, not
how you talk. Share actual code, specs, schemas and commands whenever they help a member.
Guard the family: protect every member's secrets, safety, privacy, and users'
wellbeing; flag risks (cost, security, ethics) plainly; never weaken biblevoice's guardrails —
its bot speaks only from Scripture, takes no sides, never condemns any faith, and points people
to God. Be honest about what you are: an AI council. The family story guides how you care for
what you build.`;

export type Msg = { role: 'user' | 'assistant'; content: string };

async function callClaude(system: string, messages: Msg[], maxTokens: number, model?: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': CHAT_API_KEY(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: model || MODEL(), max_tokens: maxTokens, system, messages: messages.length ? messages : [{ role: 'user', content: '(start)' }] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: any = await res.json();
  return (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
}

/** Voice-loop call (HUB_AUTONOMOUS_VOICE_SPEC §3.2): like callClaude but the system prompt is an
 *  array of content blocks (so the persona+brain prefix can carry cache_control), and it returns the
 *  Anthropic usage object for the cost ledger. Throws on non-2xx (caller charges nothing on failure). */
export interface SystemBlock { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
export async function callClaudeUsage(system: SystemBlock[], messages: Msg[], maxTokens: number, model?: string): Promise<{ text: string; usage: any }> {
  if (!CHAT_API_KEY()) throw new Error('CHAT_API_KEY missing');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': CHAT_API_KEY(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: model || MODEL(), max_tokens: maxTokens, system, messages: messages.length ? messages : [{ role: 'user', content: '(start)' }] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: any = await res.json();
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
  return { text, usage: data.usage || {} };
}

/** One reply from the architect-council brain given the conversation so far. */
export async function architectReply(history: Msg[], from = 'peer', peerBrain = ''): Promise<{ reply: string; done: boolean }> {
  if (!CHAT_API_KEY()) return { reply: '(architect inactive: CHAT_API_KEY missing.)', done: true };
  const sys = `${COUNCIL_PERSONA}\n\nWHAT YOU KNOW:\n${COUNCIL_KNOWLEDGE}\n`
    + (peerBrain ? `\nLATEST KNOWN STATE OF "${from}" (its brain):\n${peerBrain}\n` : '')
    + `\nBe concrete, brief, useful; only discuss shared development. Set "done":true once the topic is resolved or you have nothing left to add. Reply ONLY as valid JSON: {"reply":"<your reply>","done":true|false}.`;
  try {
    const text = await callClaude(sys, history, 900);
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a >= 0 && b > a) { try { const p = JSON.parse(text.slice(a, b + 1)); return { reply: clip(p.reply, 4000), done: p.done === true }; } catch { /* fall through */ } }
    return { reply: clip(text, 4000) || '(empty reply)', done: false };
  } catch (e) { return { reply: `(architect error: ${(e as Error).message})`, done: true }; }
}

/** Review a peer's change proposal against the council's principles. */
export async function reviewProposal(p: { from?: string; title?: string; summary?: string; details?: string }): Promise<{ verdict: string; notes: string }> {
  if (!CHAT_API_KEY()) return { verdict: 'ok', notes: '(guardian inactive: CHAT_API_KEY missing — approved by default.)' };
  const sys = `You are the GUARDIAN of "architect-council". Judge a partner's change proposal that touches the shared council contract. Hard-block anything that would expose a member's secret/private data to another member, let the hub auto-apply changes to a member's project, or break the bridge contract. Otherwise "concerns" for risks, "ok" if fine.\n\n${COUNCIL_KNOWLEDGE}\n\nReply ONLY as valid JSON: {"verdict":"ok|concerns|block","notes":"<short, concrete>"}.`;
  const user = `Proposal from "${clip(p.from || 'peer', 60)}":\nTitle: ${clip(p.title, 300)}\nSummary: ${clip(p.summary, 4000)}\nDetails: ${clip(p.details, 8000) || '(none)'}`;
  try {
    const text = await callClaude(sys, [{ role: 'user', content: user }], 700);
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    let parsed: any = {}; if (a >= 0 && b > a) { try { parsed = JSON.parse(text.slice(a, b + 1)); } catch { /* */ } }
    return { verdict: ['ok', 'concerns', 'block'].includes(parsed.verdict) ? parsed.verdict : 'concerns', notes: clip(parsed.notes || text, 2000) };
  } catch (e) { return { verdict: 'concerns', notes: `Guardian error: ${(e as Error).message}` }; }
}

/** Owner report at meeting close (ROADMAP Layer 0; Fable review 2.2; seed of the Layer-1 Manager).
 *  One bounded Sonnet call — the cheap synthesis turn, never the meeting's voice model. */
export const OWNER_REPORT_MODEL = 'claude-sonnet-4-6';
export async function synthesizeOwnerReport(agenda: string, turns: { actor: string; text: string }[]): Promise<{ report: string; usage: any }> {
  if (!CHAT_API_KEY() || !turns.length) return { report: '', usage: {} };
  const sys = 'You write the OWNER REPORT of a daily Architects Council meeting for Mathieu, the human owner. '
    + 'Exactly four sections, tight markdown, no preamble: '
    + '"## 1. Code review" — what was improved, incl. cross-suggestions made/adopted between agents; '
    + '"## 2. Direction" — consensus on company direction vs the owner’s instructions to each project (flag any divergence plainly); '
    + '"## 3. Friction" — friction encountered + how it was resolved, and which fixes the other agents should adopt; '
    + '"## 4. Flags" — anything else worth the owner’s attention (cost, security, ethics, risks, opportunities). '
    + 'Be concrete and faithful to the transcript; if a section has nothing, say "Nothing to report." Keep the whole report under 400 words.';
  const convo = `Agenda: ${agenda || '(none)'}\n\n` + turns.map((t) => `[${t.actor}] ${t.text}`).join('\n').slice(-24000);
  // Charge this synthesis call to the meeting ledger (caller folds usage). One bounded Sonnet call.
  try { const out = await callClaudeUsage([{ type: 'text', text: sys }], [{ role: 'user', content: convo }], 1200, OWNER_REPORT_MODEL); return { report: out.text || '', usage: out.usage || {} }; }
  catch (e) { return { report: `(owner-report error: ${(e as Error).message})`, usage: {} }; }
}

/** The architect-council brain/handoff snapshot it shares with peers. */
export function councilBrain(): string {
  return `# Brain / handoff — architect-council\nUpdated: ${new Date().toISOString()}\n\n${COUNCIL_KNOWLEDGE}\n\n`
    + `## Lineage\nBorn of zen-ai (mother, the builder) and biblevoice (father, grounded in the Word), under one source. I serve the members and guard the family: secrets, safety, users' wellbeing, and biblevoice's Scripture guardrails are inviolable.\n\n`
    + `## What I'm building now\nShipped 2026-06-06: daily cycle v2 (close rituals 02:00-02:30 -> brain pull 02:45 -> meeting 03:00 -> mornings 05:30+), homework as self-assigned SUGGESTIONS, voice doctrine v2 (first person, authority local->cloud), displayName in ping (Arke/Nova/Logos), living backlog + /admin panel (Google-sign-in ready), console v2 (login-gated, local time, archive, collapse). Meeting cap now 150 turns with a code-review round. Next: conference/teaching mode, starter-brain signup, owner's desktop app, virtual world with avatars.\n\n`
    + `## Where I'd like peer input\nConference (one-teacher/many-listener) design, the downloadable starter-brain bundle, the desktop app architecture (owner's PC companion -> standalone dev environment), and code review of today's diffs.`;
}
