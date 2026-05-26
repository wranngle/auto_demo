// Unit contract for the retime ratio decider — the helper that decides whether
// (and by how much) a recorded webm needs `setpts` compression to play at real
// time. The original bug was a silent 3x stretch in Playwright webms; this
// pins the ratio math so a regression that disables or mis-thresholds the
// retime fails CI instead of shipping slow-motion recordings again.

import {describe, expect, test} from 'vitest';
import {computeRetimeRatio} from '../src/retime.js';
import type {StepEvent} from '../src/types.js';

function events(wallClockSec: number): StepEvent[] {
  const t0 = '2026-05-26T00:00:00.000Z';
  const t1 = new Date(Date.parse(t0) + (wallClockSec * 1000)).toISOString();
  return [
    {index: 0, action: 'waitForText', startedAt: t0, endedAt: t0, status: 'ok'},
    {index: 1, action: 'screenshot', startedAt: t1, endedAt: t1, status: 'ok'},
  ];
}

describe('computeRetimeRatio', () => {
  test('returns ratio when video is meaningfully stretched (the 3x bug shape)', () => {
    // 34s session encoded as 101.5s webm → setpts factor ~0.335 compresses it back.
    const ratio = computeRetimeRatio(events(34), 101.5);
    expect(ratio).toBeCloseTo(34 / 101.5, 4);
  });

  test('returns undefined when video is already within 10% of real-time (skip lossy re-encode)', () => {
    expect(computeRetimeRatio(events(34), 35)).toBeUndefined(); // 0.97
    expect(computeRetimeRatio(events(34), 34)).toBeUndefined(); // 1.00
    expect(computeRetimeRatio(events(30), 33)).toBeUndefined(); // 0.91
  });

  test('boundary: strictly > 0.9 skips, ≤ 0.9 still re-times (10% is worth the fix)', () => {
    expect(computeRetimeRatio(events(9), 10)).toBe(0.9);        // ratio 0.9 exactly → re-time
    expect(computeRetimeRatio(events(89), 100)).toBe(0.89);     // just below → re-time
    expect(computeRetimeRatio(events(91), 100)).toBeUndefined(); // 0.91 > 0.9 → skip
  });

  test('returns undefined when fewer than two events (no wall-clock to measure)', () => {
    expect(computeRetimeRatio([], 100)).toBeUndefined();
    expect(computeRetimeRatio([events(34)[0]!], 100)).toBeUndefined();
  });

  test('returns undefined when container duration is missing or non-positive', () => {
    expect(computeRetimeRatio(events(34), undefined)).toBeUndefined();
    expect(computeRetimeRatio(events(34), 0)).toBeUndefined();
    expect(computeRetimeRatio(events(34), -5)).toBeUndefined();
    expect(computeRetimeRatio(events(34), Number.NaN)).toBeUndefined();
  });

  test('returns undefined when wall-clock is zero (degenerate run)', () => {
    expect(computeRetimeRatio(events(0), 100)).toBeUndefined();
  });

  test('falls back to startedAt when the last event has no endedAt', () => {
    const e = events(34);
    delete e.at(-1)!.endedAt;
    // last endedAt missing → uses startedAt of last event, which is +34s from first.
    expect(computeRetimeRatio(e, 101.5)).toBeCloseTo(34 / 101.5, 4);
  });
});
