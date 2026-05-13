// Gap #6 in ROAST.md — idle-time trim math, isolated and previously untested.
// Asserts the buffer windows, the merge rule (segments closer than
// MIN_GAP_TO_TRIM_S get joined), and that a 30s gap is actually trimmed.
import {describe, expect, test} from 'vitest';
import {computeActiveSegments, buildTrimFilter, estimateTrimmedDuration} from '../src/video/trim.js';
import type {RecordingEvent} from '../src/recording/types.js';

const baseViewport = {width: 1280, height: 720};

function ev(timestamp_ms: number, type: RecordingEvent['type'] = 'click'): RecordingEvent {
  return {
    id: timestamp_ms,
    timestamp_ms,
    type,
    description: '',
    viewport: baseViewport,
  };
}

describe('computeActiveSegments', () => {
  test('returns the full duration when there are no events', () => {
    const segs = computeActiveSegments([], 60);
    expect(segs).toEqual([{start_s: 0, end_s: 60}]);
  });

  test('wraps a single event with the before/after buffer', () => {
    const segs = computeActiveSegments([ev(5000)], 30);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.start_s).toBeCloseTo(4.2, 3); // 5 - 0.8
    expect(segs[0]!.end_s).toBeCloseTo(6.5, 3);   // 5 + 1.5
  });

  test('merges two events less than the gap-threshold apart', () => {
    // 1s and 2s — both windows overlap, should produce one segment.
    const segs = computeActiveSegments([ev(1000), ev(2000)], 10);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.start_s).toBeCloseTo(0.2, 3);
    expect(segs[0]!.end_s).toBeCloseTo(3.5, 3);
  });

  test('separates two events farther than the gap-threshold apart', () => {
    // First click at 2s, second at 35s. Gap is 30s+ → must be trimmed.
    const segs = computeActiveSegments([ev(2000), ev(35_000)], 40);
    expect(segs).toHaveLength(2);
    expect(segs[0]!.end_s).toBeLessThan(segs[1]!.start_s);
    const trimmed = estimateTrimmedDuration(segs);
    // Both windows = (1.5 + 0.8 buffer) * 2 ≈ 4.6s ish
    expect(trimmed).toBeLessThan(10);
  });

  test('clamps the trailing buffer to video duration', () => {
    const segs = computeActiveSegments([ev(58_000)], 60);
    expect(segs[0]!.end_s).toBeLessThanOrEqual(60);
  });

  test('clamps the leading buffer to zero', () => {
    const segs = computeActiveSegments([ev(100)], 60);
    expect(segs[0]!.start_s).toBe(0);
  });
});

describe('buildTrimFilter', () => {
  test('emits a select=between(...) filter with setpts reset', () => {
    const segs = [{start_s: 0, end_s: 5}, {start_s: 30, end_s: 35}];
    const filter = buildTrimFilter(segs);
    expect(filter).toContain("select='between(t,0.000,5.000)+between(t,30.000,35.000)'");
    expect(filter).toContain('setpts=N/FRAME_RATE/TB');
  });

  test('returns empty string when there are no segments', () => {
    expect(buildTrimFilter([])).toBe('');
  });
});

describe('estimateTrimmedDuration', () => {
  test('sums every segment exactly', () => {
    const segs = [
      {start_s: 0, end_s: 1.5},
      {start_s: 4, end_s: 7.25},
      {start_s: 30, end_s: 31},
    ];
    expect(estimateTrimmedDuration(segs)).toBeCloseTo(5.75, 4);
  });
});
