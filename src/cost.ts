/**
 * Cost + caps for the autonomous hub voice loop (HUB_AUTONOMOUS_VOICE_SPEC §2).
 * PURE module — no env reads, no I/O — so it is unit-testable and safe. Call sites pass in
 * env-derived config (DEFAULT_MODEL, ceilings, budget). Prices locked 2026-06-09 (spec §2).
 *
 * Fail-closed philosophy: an UNKNOWN model prices at the most expensive known rate, never free,
 * so a typo or new model can never silently bypass the budget.
 */

/** USD per single token (spec quotes per-MTok; divide by 1e6). cacheWrite = 1.25× input (Anthropic standard). */
export interface ModelPrice { input: number; output: number; cacheRead: number; cacheWrite: number }

const MTOK = 1_000_000;
const price = (inMTok: number, outMTok: number, cacheReadMTok: number): ModelPrice => ({
  input: inMTok / MTOK,
  output: outMTok / MTOK,
  cacheRead: cacheReadMTok / MTOK,
  cacheWrite: (inMTok * 1.25) / MTOK,
});

/** Locked price table (spec §2). Keys are the model strings passed to the Anthropic API. */
export const PRICES: Record<string, ModelPrice> = {
  'claude-opus-4-8': price(5, 25, 0.5),     // $5 / $25 / $0.50 cache-read
  'claude-sonnet-4-6': price(3, 15, 0.3),   // $3 / $15 / $0.30 cache-read (10% of input)
};

/** Most-expensive known rate — the fallback for an unknown model (fail-closed, never $0). */
export function worstPrice(): ModelPrice {
  const all = Object.values(PRICES);
  return {
    input: Math.max(...all.map((p) => p.input)),
    output: Math.max(...all.map((p) => p.output)),
    cacheRead: Math.max(...all.map((p) => p.cacheRead)),
    cacheWrite: Math.max(...all.map((p) => p.cacheWrite)),
  };
}

export function priceFor(model: string): ModelPrice {
  return PRICES[model] || worstPrice();
}

/** The token-usage shape Anthropic returns on a Messages response (`data.usage`). */
export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

const n = (x: number | undefined): number => (Number.isFinite(x as number) && (x as number) > 0 ? (x as number) : 0);

/** Total tokens counted against MEETING_TOKEN_CEILING (every token the model saw or produced). */
export function totalTokens(u: Usage): number {
  return n(u.input_tokens) + n(u.output_tokens) + n(u.cache_read_input_tokens) + n(u.cache_creation_input_tokens);
}

/** USD for one Messages call given its model + usage. */
export function usdForUsage(model: string, u: Usage): number {
  const p = priceFor(model);
  return n(u.input_tokens) * p.input
    + n(u.output_tokens) * p.output
    + n(u.cache_read_input_tokens) * p.cacheRead
    + n(u.cache_creation_input_tokens) * p.cacheWrite;
}

/** A running tally across the turns of one meeting. */
export interface LedgerTotals { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; totalTokens: number; usd: number }

export function emptyTotals(): LedgerTotals {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, usd: 0 };
}

/** Fold one call's usage into a running total (returns a new object; caller persists per-agent + grand total). */
export function addUsage(t: LedgerTotals, model: string, u: Usage): LedgerTotals {
  return {
    inputTokens: t.inputTokens + n(u.input_tokens),
    outputTokens: t.outputTokens + n(u.output_tokens),
    cacheReadTokens: t.cacheReadTokens + n(u.cache_read_input_tokens),
    cacheWriteTokens: t.cacheWriteTokens + n(u.cache_creation_input_tokens),
    totalTokens: t.totalTokens + totalTokens(u),
    usd: t.usd + usdForUsage(model, u),
  };
}

/** Config the caller derives from env (spec §2 defaults). */
export interface Caps { tokenCeiling: number; dailyBudgetUsd: number }
export const DEFAULT_CAPS: Caps = { tokenCeiling: 800_000, dailyBudgetUsd: 5 };

/** Read caps from an env-like map without reading process.env directly (keeps this module pure). */
export function capsFromEnv(env: Record<string, string | undefined>): Caps {
  const num = (v: string | undefined, d: number) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : d; };
  return {
    tokenCeiling: num(env.MEETING_TOKEN_CEILING, DEFAULT_CAPS.tokenCeiling),
    dailyBudgetUsd: num(env.DAILY_MEETING_BUDGET_USD, DEFAULT_CAPS.dailyBudgetUsd),
  };
}

/** TRUE if this meeting has spent its token budget — caller must stop generating + close (endedReason token_ceiling). */
export function meetingTokenCeilingHit(meetingTotalTokens: number, caps: Caps): boolean {
  return meetingTotalTokens >= caps.tokenCeiling;
}

/** TRUE if opening another meeting today would exceed the daily USD budget — refuse with 503 budget_exhausted. */
export function dailyBudgetExhausted(usdSpentTodayUtc: number, caps: Caps): boolean {
  return usdSpentTodayUtc >= caps.dailyBudgetUsd;
}

/** UTC day key (YYYY-MM-DD) for bucketing the daily budget. */
export function utcDayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}
