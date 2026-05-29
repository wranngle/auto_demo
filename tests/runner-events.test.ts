// Contract tests for runner internals: the NDJSON event-log sidecar
// (events.jsonl alongside manifest.json) and the timing primitives
// (`delay`, `clamp`) that drive every Playwright wait. NDJSON format aligns
// with the git_good ECS-shaped JSONL ledger doctrine.

import {describe, expect, test} from 'vitest';
// eslint-disable-next-line @typescript-eslint/naming-convention
import {formatEventNdjson, __test__} from '../src/runner.js';
import type {DemoTiming, StepEvent} from '../src/types.js';

const {delay, clamp} = __test__;

const sample: StepEvent[] = [
  {
    index: 0, action: 'waitForText', label: 'Landing page ready',
    startedAt: '2026-05-26T01:00:00.000Z', endedAt: '2026-05-26T01:00:00.420Z',
    status: 'ok',
  },
  {
    index: 1, action: 'click', label: 'Send turn 1',
    startedAt: '2026-05-26T01:00:01.000Z', endedAt: '2026-05-26T01:00:01.150Z',
    status: 'failed', error: 'Selector not found',
  },
  {
    index: 2, action: 'screenshot', label: 'Poster frame',
    startedAt: '2026-05-26T01:00:02.000Z', endedAt: '2026-05-26T01:00:02.080Z',
    status: 'ok', artifact: '/tmp/poster.png',
  },
];

describe('formatEventNdjson', () => {
  test('emits one JSON line per event, newline-terminated', () => {
    const text = formatEventNdjson('acme', sample);
    expect(text.endsWith('\n')).toBe(true);
    const lines = text.trim().split('\n');
    expect(lines).toHaveLength(3);
  });

  test('each line is valid JSON and ECS-shaped', () => {
    const lines = formatEventNdjson('acme', sample).trim().split('\n');
    for (const line of lines) {
      const record = JSON.parse(line) as Record<string, unknown>;
      expect(typeof record['@timestamp']).toBe('string');
      expect(record.service).toMatchObject({name: 'ui-demo-runner'});
      expect((record.event as Record<string, unknown>).action).toMatch(/^step\./v);
      expect((record.event as Record<string, unknown>).outcome).toMatch(/^(success|failure)$/v);
      expect((record.flow as Record<string, unknown>).name).toBe('acme');
      expect(typeof (record.flow as Record<string, unknown>).step_index).toBe('number');
    }
  });

  test('maps step status to event.outcome + log.level', () => {
    const [ok, failed] = formatEventNdjson('f', sample).trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>);
    expect((ok!.event as Record<string, unknown>).outcome).toBe('success');
    expect((ok!.log as Record<string, unknown>).level).toBe('info');
    expect((failed!.event as Record<string, unknown>).outcome).toBe('failure');
    expect((failed!.log as Record<string, unknown>).level).toBe('error');
    expect((failed!.error as Record<string, unknown>).message).toBe('Selector not found');
  });

  test('carries artifact path when the step produced one', () => {
    const lines = formatEventNdjson('f', sample).trim().split('\n');
    const screenshotLine = JSON.parse(lines[2]!) as Record<string, unknown>;
    expect(screenshotLine.artifact).toBe('/tmp/poster.png');
  });

  test('empty events array yields an empty string (no stray newline)', () => {
    expect(formatEventNdjson('f', [])).toBe('');
  });
});

const timing = (overrides: Partial<DemoTiming> = {}): Required<DemoTiming> => ({
  speed: 1,
  moveMs: 0,
  clickPauseMs: 0,
  fillPauseMs: 0,
  pressPauseMs: 0,
  scrollPauseMs: 0,
  zoomMs: 0,
  ...overrides,
});

// `delay` is called by every Playwright wait in runStep (11+ call sites):
// every pause, click-pause, fill-pause, zoom, scroll, press, and reset-zoom
// runs `await page.waitForTimeout(delay(...))`. A silent regression that
// breaks the clamp (negative input → negative wait, which crashes
// Playwright) or the round (fractional ms, which Playwright may not honor)
// would shift the timing of every shipped recording. Lock the contract.
describe('delay', () => {
  test('speed=1 returns the input rounded to an integer', () => {
    expect(delay(100, timing({speed: 1}))).toBe(100);
    expect(delay(123.4, timing({speed: 1}))).toBe(123);
    expect(delay(123.5, timing({speed: 1}))).toBe(124);
  });

  test('speed > 1 shortens the wait (faster playback)', () => {
    expect(delay(1000, timing({speed: 2}))).toBe(500);
    expect(delay(1000, timing({speed: 4}))).toBe(250);
  });

  test('speed < 1 lengthens the wait (slower playback)', () => {
    expect(delay(500, timing({speed: 0.5}))).toBe(1000);
    expect(delay(1000, timing({speed: 0.25}))).toBe(4000);
  });

  test('negative or zero input clamps to 0 (never schedule a negative wait)', () => {
    expect(delay(0, timing())).toBe(0);
    expect(delay(-1, timing())).toBe(0);
    expect(delay(-9999, timing({speed: 2}))).toBe(0);
  });

  test('result is always an integer (Playwright waitForTimeout expects ms as int)', () => {
    expect(Number.isInteger(delay(123.7, timing({speed: 1.35})))).toBe(true);
    expect(Number.isInteger(delay(50, timing({speed: 3})))).toBe(true);
  });
});

// `clamp` gates the runtime speed at [0.25, 8] via
// `clamp(flow.timing?.speed ?? options.speed, 0.25, 8)` in normalizeTiming.
// flow-schema validates speed in (0, 8], so the clamp protects against an
// options.speed override (or a regression in validateFlow) producing a
// near-zero value that would blow up `delay`'s division.
describe('clamp', () => {
  test('returns value unchanged when within [min, max]', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  test('clamps below min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(0.1, 1, 10)).toBe(1);
  });

  test('clamps above max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(8.5, 0, 8)).toBe(8);
  });

  test('runtime speed gate: clamp(speed, 0.25, 8)', () => {
    expect(clamp(0.05, 0.25, 8)).toBe(0.25);
    expect(clamp(1, 0.25, 8)).toBe(1);
    expect(clamp(8.5, 0.25, 8)).toBe(8);
  });
});
