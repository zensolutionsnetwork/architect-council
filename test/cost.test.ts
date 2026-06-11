/** CI gate: assert the autonomous-voice cost/caps math (HUB_AUTONOMOUS_VOICE_SPEC §2). */
import {
  PRICES, worstPrice, priceFor, usdForUsage, totalTokens, addUsage, emptyTotals,
  capsFromEnv, DEFAULT_CAPS, meetingTokenCeilingHit, dailyBudgetExhausted, utcDayKey,
} from '../src/cost.js';
import { nearIdentical } from '../src/voiceloop.js';

let fail = false;
const bad = (m: string) => { fail = true; console.error('FAIL: ' + m); };
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
const eq = (label: string, got: number, want: number) => { if (!near(got, want)) bad(`${label}: got ${got} want ${want}`); else console.log(`  ${label}: PASS (${got})`); };
const isTrue = (label: string, v: boolean) => { if (v !== true) bad(`${label}: expected true`); else console.log(`  ${label}: PASS`); };
const isFalse = (label: string, v: boolean) => { if (v !== false) bad(`${label}: expected false`); else console.log(`  ${label}: PASS`); };

// 1. Opus usage → exact USD. 10k input + 2k output + 50k cache-read.
//    = 10000*5e-6 + 2000*25e-6 + 50000*0.5e-6 = 0.05 + 0.05 + 0.025 = 0.125
const u1 = { input_tokens: 10000, output_tokens: 2000, cache_read_input_tokens: 50000, cache_creation_input_tokens: 0 };
eq('opus usd', usdForUsage('claude-opus-4-8', u1), 0.125);
eq('opus totalTokens', totalTokens(u1), 62000);

// 2. Sonnet usage → exact USD. 10k input + 2k output (no cache).
//    = 10000*3e-6 + 2000*15e-6 = 0.03 + 0.03 = 0.06
eq('sonnet usd', usdForUsage('claude-sonnet-4-6', { input_tokens: 10000, output_tokens: 2000 }), 0.06);

// 3. cache_creation billed at 1.25x input (opus): 8000 * 6.25e-6 = 0.05
eq('opus cache-write usd', usdForUsage('claude-opus-4-8', { cache_creation_input_tokens: 8000 }), 0.05);

// 4. Unknown model fails CLOSED at the worst (opus) rate, never $0.
const w = worstPrice();
eq('worst input == opus input', w.input, PRICES['claude-opus-4-8'].input);
eq('unknown model usd == opus usd', usdForUsage('made-up-model', u1), usdForUsage('claude-opus-4-8', u1));
if (priceFor('made-up-model').output <= 0) bad('unknown model output price must be > 0');

// 5. addUsage folds correctly across turns.
let t = emptyTotals();
t = addUsage(t, 'claude-opus-4-8', u1);
t = addUsage(t, 'claude-sonnet-4-6', { input_tokens: 10000, output_tokens: 2000 });
eq('folded usd', t.usd, 0.125 + 0.06);
eq('folded totalTokens', t.totalTokens, 62000 + 12000);
eq('folded output', t.outputTokens, 4000);

// 6. Token ceiling (default 800k) fail-closed at >=.
isFalse('ceiling not hit at 62k', meetingTokenCeilingHit(62000, DEFAULT_CAPS));
isTrue('ceiling hit at exactly 800k', meetingTokenCeilingHit(800000, DEFAULT_CAPS));
isTrue('ceiling hit above 800k', meetingTokenCeilingHit(900000, DEFAULT_CAPS));

// 7. Daily budget (default $5) fail-closed at >=.
isFalse('budget ok at $0.125', dailyBudgetExhausted(0.125, DEFAULT_CAPS));
isTrue('budget exhausted at exactly $5', dailyBudgetExhausted(5, DEFAULT_CAPS));

// 8. capsFromEnv overrides + falls back to defaults on junk.
const c = capsFromEnv({ MEETING_TOKEN_CEILING: '500000', DAILY_MEETING_BUDGET_USD: 'not-a-number' });
eq('env ceiling override', c.tokenCeiling, 500000);
eq('env budget fallback', c.dailyBudgetUsd, DEFAULT_CAPS.dailyBudgetUsd);

// 9. utcDayKey shape.
if (!/^\d{4}-\d{2}-\d{2}$/.test(utcDayKey(new Date('2026-06-09T23:59:00Z')))) bad('utcDayKey format');
else console.log('  utcDayKey: PASS');

// 10. Voice-loop repeat guard (2026-06-11 termination fix): near-identical consecutive turns
//     from the same actor must be detected — that detection is what stops runaway loop spend.
isTrue('repeat: exact match', nearIdentical('My homework: fix the parser. done:false', 'My homework: fix the parser. done:false'));
isTrue('repeat: whitespace/case only', nearIdentical('My HOMEWORK:  fix the parser.', 'my homework: fix the parser.'));
isTrue('repeat: tiny variation (high Jaccard)', nearIdentical(
  'My homework remains: implement the fixture exemption contract in consent.ts and packageFolder, then audit the silent swallows in server.ts. done:false',
  'My homework still remains: implement the fixture exemption contract in consent.ts and packageFolder, then audit the silent swallows in server.ts. done:false'));
isFalse('repeat: different content not flagged', nearIdentical(
  'Round one friction: the chunked writer truncated three files at the 4k boundary.',
  'Closing: tomorrow I propose wiring the hierarchy module into a consent-gated endpoint.'));
isFalse('repeat: empty never flagged', nearIdentical('', 'anything'));

if (fail) { console.error('cost/caps: FAIL'); process.exit(1); }
console.log('autonomous-voice cost/caps: PASS');
