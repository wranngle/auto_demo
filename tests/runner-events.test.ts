// Contract test for the NDJSON event-log sidecar (events.jsonl alongside
// manifest.json). Format aligns with the git_good ECS-shaped JSONL ledger
// doctrine; concept salvaged from the archived auto-demo-merger exploration.

import {describe, expect, test} from 'vitest';
import {formatEventNdjson} from '../src/runner.js';
import type {StepEvent} from '../src/types.js';

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
