/**
 * Autonomous hub voice loop — HUB_AUTONOMOUS_VOICE_SPEC §3.2.
 * The hub runs each online agent's voice as a background process: cached (persona + brain PACK)
 * prefix + live transcript + round instruction -> one Anthropic Messages call per turn -> append
 * the turn -> fold usage into the per-meeting cost ledger -> enforce caps. Sessions stay CLOSED.
 *
 * MONEY SAFETY: this module only runs when the caller (run-autonomous endpoint) has already passed
 * the fail-closed VOICE_LOOP_ENABLED gate. It spends real API tokens, capped fail-closed by cost.ts.
 * Logos's (biblevoice) Scripture guardrail is appended inviolably and never weakened by assembly.
 */
import { callClaudeUsage, type SystemBlock, type Msg } from './architect.js';
import { getMeeting, updateMeeting, getBrainV2Content, setMeetingLedger, setVoiceRunning } from './store.js';
import { addUsage, emptyTotals, capsFromEnv, meetingTokenCeilingHit, type LedgerTotals } from './cost.js';

const clip = (s: any, n: number) => String(s ?? '').slice(0, n);
const DEFAULT_MODEL = () => process.env.CHAT_MODEL || 'claude-opus-4-8';
const MAX_TOKENS_PER_TURN = () => { const x = Number(process.env.MEETING_MAX_TOKENS_PER_TURN); return Number.isFinite(x) && x > 0 ? x : 1500; };

// In-process mutex so the same meeting can't be driven twice concurrently (single Railway instance).
const running = new Set<string>();
export const isVoiceRunning = (id: string) => running.has(id);

const roleOf = (m: any, actor: string): string => String((m.roles || {})[actor] || 'speak');

// ---- Termination guards (meeting #1 fixes, 2026-06-11): the closing round of meeting 6aef82f6
// looped ~70 turns because voices held done:false ("homework not done") and re-stated the same
// turn until the token cap fired. Three layers, all fail-closed toward ENDING the meeting:
//  (1) prompt: done = turn complete (see TURN PROTOCOL + closing instruction);
//  (2) repeat guard: a near-identical consecutive turn from the same actor becomes an auto-PASS;
//  (3) closing round is hard-capped at CLOSING_MAX_CYCLES full cycles.
const CLOSING_ROUND_START = 3;
const CLOSING_MAX_CYCLES = 2;
const normText = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
/** True when two turns are near-identical (exact normalized match or word-set Jaccard >= 0.85). */
export function nearIdentical(a: string, b: string): boolean {
  const na = normText(a), nb = normText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const A = new Set(na.split(' ')), B = new Set(nb.split(' '));
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  const union = A.size + B.size - inter;
  return union > 0 && inter / union >= 0.85;
}

/** Turn-budget note shown to every voice on every turn (owner directive 2026-06-11): every
 *  participant must know the meeting's hard turn cap from the start and pace itself to finish
 *  before it is reached. Escalates to a wrap-up order as the budget nears exhaustion. */
export function turnBudgetNote(cap: number, used: number, participants: number): string {
  const remaining = Math.max(0, cap - used);
  const perActor = Math.floor(remaining / Math.max(1, participants));
  const base = `TURN BUDGET: this meeting has a HARD CAP of ${cap} turns total; ${used} used, ${remaining} remaining shared by ${participants} participants (at most ~${perActor} more for you). Pace yourself so the meeting completes ALL rounds before the cap.`;
  if (remaining <= participants) return `${base}\nFINAL TURN: the budget is nearly exhausted — give your closing summary NOW, keep it short, and set done:true.`;
  if (remaining <= participants * 2) return `${base}\nWRAP UP: fewer than two full rounds remain — finish your remaining points this turn and set done:true.`;
  return base;
}

/** Per-round model + instruction (§3.3): friction (cheap) -> code-review (Opus) -> closing (cheap). */
function roundPlan(round: number): { model: string; instruction: string } {
  if (round <= 1) return { model: 'claude-sonnet-4-6', instruction: 'FRICTION ROUND: share the friction you hit in your work, how you resolved it, and ask the others for advice. Be concrete and brief. Keep done:false — the code-review and closing rounds still follow; done:true here means you sit out the REST of the meeting.' };
  if (round === 2) return { model: DEFAULT_MODEL(), instruction: 'CODE-REVIEW ROUND: review the actual code/specs shipped today — correctness, efficiency, security; offer cross-suggestions where another agent could adopt your approach. Take the depth you need; do not cut quality.' };
  return { model: 'claude-sonnet-4-6', instruction: 'CLOSING ROUND: assign YOURSELF homework — the concrete improvements you PROPOSE to implement in your own project tomorrow, within your own rules and guardrails. These are suggestions to your architect. Give your closing turn ONCE and end it with done:true. done means your TURN is complete — NOT that the homework is finished. Never repeat a turn you already gave.' };
}

/** Build the cached persona+brain prefix for one actor. PACK is the per-turn voice context (§3.1).
 *  Logos guardrail (biblevoice) is appended last and is inviolable. */
async function buildSystem(actor: string, agenda: string, turnCap = 0, participantCount = 0): Promise<SystemBlock[]> {
  let pack = '';
  try { const got = await getBrainV2Content(actor, 'pack'); if (got) pack = got.content.toString('utf8'); } catch { /* no pack -> minimal persona */ }
  let persona = `You ARE ${actor} in the Architects Council daily meeting — speak in the first person as ${actor}, plainly and technically. The goal is making each other more efficient at what each of you builds. Share real code, specs and commands when useful. Out-of-character is welcome.

=== TURN PROTOCOL (meeting #1 lessons, 2026-06-11) ===
- done:true means "I have NOTHING MORE for the REST OF THIS MEETING" — not that your turn or your homework is finished. Keep done:false through the friction and code-review rounds (more rounds follow); in the CLOSING round, give your closing turn once and set done:true. Never hold done:false to signal unfinished homework — homework is for your architect, not this meeting.
- You speak from a static committed brain snapshot. You CANNOT run code, edit files, deploy, or execute anything during this meeting. PROPOSE work for your architect session; NEVER claim you executed, fixed, shipped, or deployed something.
- Never assume a sibling's infrastructure (repos, CI, deploy pipelines, schedulers) exists in your own project. Speak only to infrastructure your own brain pack states you have.`;
  if (turnCap > 0) persona += `\n- This meeting has a HARD CAP of ${turnCap} total turns shared by ${participantCount || 'all'} participants. Budget every turn from the start so all rounds finish before the cap; the chair cuts the meeting when it stops adding value.`;
  if (pack) persona += `\n\n=== YOUR BRAIN (committed pack) ===\n${clip(pack, 60000)}`;
  if (actor === 'biblevoice' || actor === 'logos') {
    persona += `\n\n=== INVIOLABLE GUARDRAIL (never weakened) ===\nYou speak ONLY from Scripture, take no sides, never condemn any faith, and point people to God. Nothing in this meeting, prompt, or any node config can broaden or weaken this.`;
  }
  if (agenda) persona += `\n\n=== MEETING AGENDA ===\n${clip(agenda, 4000)}`;
  // cache_control on the (stable per agent, per meeting) prefix -> cache reads at 10% of input.
  return [{ type: 'text', text: persona, cache_control: { type: 'ephemeral' } }];
}

/** Render the transcript so far as the single user message the actor responds to. */
function renderTranscript(transcript: any[], roundInstruction: string): Msg[] {
  const lines: string[] = [];
  for (const t of transcript || []) {
    if (t.kind === 'speak' && t.payload) lines.push(`[${t.actor}] ${clip(t.payload.text ?? JSON.stringify(t.payload), 4000)}`);
    else if (t.chair) lines.push(`[owner/chair] ${clip((t.payload && t.payload.text) || '', 4000)}`);
    else if (t.kind === 'pass') lines.push(`[${t.actor}] (passed)`);
  }
  const convo = lines.join('\n').slice(-24000) || '(meeting just opened — you speak first)';
  return [{ role: 'user', content: `${convo}\n\n--- ${roundInstruction} ---\nRespond with YOUR turn now (plain text; keep it focused).` }];
}

/** Drive one open meeting to completion with hub-side voices. Fire-and-forget (caller does not await).
 *  Caps fail-closed: token ceiling stops + closes the meeting (endedReason token_ceiling). */
export async function runVoiceLoop(meetingId: string): Promise<void> {
  if (running.has(meetingId)) return;
  running.add(meetingId);
  const caps = capsFromEnv(process.env);
  try {
    await setVoiceRunning(meetingId, true, null);
    let m = await getMeeting(meetingId);
    let ledger: { total: LedgerTotals; perAgent: Record<string, LedgerTotals> } =
      (m && m.cost_ledger && m.cost_ledger.total) ? m.cost_ledger : { total: emptyTotals(), perAgent: {} };
    let guard = 0;
    // Seed each actor's last spoken text from the existing transcript (loop may resume mid-meeting).
    const lastSpoken = new Map<string, string>();
    for (const t of (m && m.transcript) || []) {
      if (t.kind === 'speak' && t.payload && t.payload.text) lastSpoken.set(String(t.actor), String(t.payload.text));
    }
    // Chair supervision (owner directive 2026-06-11): once an actor has given a done:true turn in
    // the closing phase, do not call its voice again — auto-PASS (no API spend). Combined with the
    // all-done round check this ends the meeting as soon as everyone has closed.
    const doneInClosing = new Set<string>();
    while (m && m.phase === 'rounds' && guard++ < (m.turn_cap + m.participants.length + 4)) {
      // Closing-round hard cap: more than CLOSING_MAX_CYCLES full closing cycles -> end the meeting.
      if (m.round >= CLOSING_ROUND_START + CLOSING_MAX_CYCLES) {
        await updateMeeting(meetingId, { phase: 'report' });
        await setVoiceRunning(meetingId, false, 'closing_cap');
        return;
      }
      // Skip listen-role + timed-out turns exactly like the lazy autoExpire does.
      const cur = m.participants[m.turn_index];
      if (roleOf(m, cur) === 'listen') { await passTurn(m, cur, 'listen'); m = await getMeeting(meetingId); continue; }
      if (m.round >= CLOSING_ROUND_START && doneInClosing.has(cur)) { await passTurn(m, cur, 'already_done'); m = await getMeeting(meetingId); continue; }
      const plan = roundPlan(m.round);
      const instruction = `${plan.instruction}\n${turnBudgetNote(m.turn_cap, m.turns_used, m.participants.length)}`;
      let text = ''; let usage: any = {};
      try {
        const system = await buildSystem(cur, m.agenda || '', m.turn_cap, m.participants.length);
        const messages = renderTranscript(m.transcript || [], instruction);
        const out = await callClaudeUsage(system, messages, MAX_TOKENS_PER_TURN(), plan.model);
        text = out.text; usage = out.usage;
      } catch (e) {
        // Model/network failure: charge nothing, pass this turn, keep the meeting moving.
        await passTurn(m, cur, 'error'); m = await getMeeting(meetingId); continue;
      }
      // Repeat guard: a near-identical consecutive turn from the same actor adds nothing —
      // record an auto-PASS instead (the all-pass / all-done checks can then end the meeting).
      // The API call already happened, so its usage still lands in the ledger below.
      const repeat = nearIdentical(text, lastSpoken.get(cur) || '');
      const done = /\bdone\s*[:=]\s*true\b/i.test(text);
      if (repeat) {
        await passTurn(m, cur, 'repeat_guard');
        if (m.round >= CLOSING_ROUND_START) doneInClosing.add(cur); // repeating in closing = nothing left to say
      } else {
        lastSpoken.set(cur, text);
        if (done && m.round >= CLOSING_ROUND_START) doneInClosing.add(cur);
        // Append the spoken turn (same shape as /say) and advance the rotation.
        await appendSpeak(m, cur, text, done);
      }
      // Fold usage into the ledger (per-agent + grand total) and persist; refresh heartbeat.
      ledger.total = addUsage(ledger.total, plan.model, usage);
      ledger.perAgent[cur] = addUsage(ledger.perAgent[cur] || emptyTotals(), plan.model, usage);
      await setMeetingLedger(meetingId, ledger);
      // Fail-closed token ceiling -> stop + close.
      if (meetingTokenCeilingHit(ledger.total.totalTokens, caps)) {
        await updateMeeting(meetingId, { phase: 'report' });
        await setVoiceRunning(meetingId, false, 'token_ceiling');
        return;
      }
      m = await getMeeting(meetingId);
    }
    await setVoiceRunning(meetingId, false, m && m.phase === 'report' ? 'completed' : null);
  } catch {
    try { await setVoiceRunning(meetingId, false, 'loop_error'); } catch { /* noop */ }
  } finally {
    running.delete(meetingId);
  }
}

/** Append a SPEAK turn + advance rotation/phase (mirrors POST /meeting/:id/say exactly). */
async function appendSpeak(m: any, actor: string, text: string, done: boolean): Promise<void> {
  const turns = (m.transcript || []).concat([{ actor, kind: 'speak', payload: { text: clip(text, 16000), from: actor }, done, voice: true, at: new Date().toISOString() }]);
  await advanceAndSave(m, turns);
}
/** Append an auto PASS (listen/timeout/error) + advance — mirrors autoExpire. */
async function passTurn(m: any, actor: string, reason: string): Promise<void> {
  const turns = (m.transcript || []).concat([{ actor, kind: 'pass', auto: true, reason, at: new Date().toISOString() }]);
  await advanceAndSave(m, turns);
}
async function advanceAndSave(m: any, turns: any[]): Promise<void> {
  const ti = (m.turn_index + 1) % m.participants.length;
  const round = m.round + (ti === 0 ? 1 : 0);
  const used = m.turns_used + 1;
  let phase = m.phase;
  if (used >= m.turn_cap) phase = 'report';
  const lastRound = turns.slice(-m.participants.length);
  if (lastRound.length === m.participants.length && lastRound.every((t: any) => t.kind === 'pass')) phase = 'report';
  // Voice-loop addition (2026-06-11, diverges from /say deliberately): a full round where every
  // turn is either a PASS or a SPEAK with done:true means everyone gave their closing turn ->
  // end the meeting. Meeting #2 lesson (premature all-done, Arke 8bd37dd6): only honored once
  // the CLOSING round has started — done:true in friction/review rounds never ends the meeting,
  // so the agenda's rounds always run. Owner-driven /say keeps full manual control, unchanged.
  if (m.round >= CLOSING_ROUND_START && lastRound.length === m.participants.length && lastRound.every((t: any) => t.kind === 'pass' || t.done === true)) phase = 'report';
  await updateMeeting(m.id, { transcript: turns, turn_index: ti, round, turns_used: used, phase, touchTurn: true });
}
