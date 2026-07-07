// Unit contract for the retime ratio decider — the helper that decides whether
// (and by how much) a recorded webm needs `setpts` compression to play at real
// time. The original bug was a silent 3x stretch in Playwright webms; this
// pins the ratio math so a regression that disables or mis-thresholds the
// retime fails CI instead of shipping slow-motion recordings again.

import {describe, expect, test, vi} from 'vitest';
import {buildRetimeArgs, computeRetimeRatio, retimeRecordingToRealTime} from '../src/retime.js';
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

// Pure arg assembly for the post-process encode: setpts only when stretched,
// bitrate flags only when --quality asked for them. Locks that --quality's
// videoBitrateKbps actually reaches the encoder — the original gap was a
// preset that promised "viewport + bitrate" but only ever set the viewport.
describe('buildRetimeArgs', () => {
  test('stretched recording without quality: setpts only', () => {
    expect(buildRetimeArgs(0.335, undefined)).toStrictEqual([
      '-filter:v', 'setpts=0.335000*PTS',
      '-an',
    ]);
  });

  test('quality preset without stretch: bitrate target only', () => {
    expect(buildRetimeArgs(undefined, 8000)).toStrictEqual([
      '-b:v', '8000k',
      '-maxrate', '8000k',
      '-bufsize', '16000k',
      '-an',
    ]);
  });

  test('stretched + quality: setpts and bitrate together', () => {
    expect(buildRetimeArgs(0.5, 4000)).toStrictEqual([
      '-filter:v', 'setpts=0.500000*PTS',
      '-b:v', '4000k',
      '-maxrate', '4000k',
      '-bufsize', '8000k',
      '-an',
    ]);
  });
});

// IO wrapper outcome contract — exercised only on paths that need no working
// ffmpeg (CI's vitest job has none): a run with nothing to do reports
// 'skipped'; a run that must encode but can't reports 'failed' AND warns,
// never silently ships the raw capture as success.
describe('retimeRecordingToRealTime outcome', () => {
  test('reports skipped when nothing to do (unreadable probe, no quality)', async () => {
    const outcome = await retimeRecordingToRealTime('/nonexistent/recording.webm', events(34));
    expect(outcome).toStrictEqual({status: 'skipped'});
  });

  test('reports failed + warns when a requested bitrate encode cannot run', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const outcome = await retimeRecordingToRealTime('/nonexistent/recording.webm', events(34), {videoBitrateKbps: 4000});
      expect(outcome.status).toBe('failed');
      expect(outcome.videoBitrateKbps).toBe(4000);
      expect(outcome.error).toBeTruthy();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain('post-process');
    } finally {
      warn.mockRestore();
    }
  });
});
