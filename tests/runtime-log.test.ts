// Coverage for the NDJSON runtime log.
import {describe, expect, test, beforeEach, afterEach} from 'vitest';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RuntimeLog, NoopRuntimeLog} from '../src/utils/runtime-log.js';

let scratch: string;
let logPath: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'auto_demo-rlog-'));
  logPath = join(scratch, 'sub/log.jsonl');
});

afterEach(() => {
  rmSync(scratch, {recursive: true, force: true});
});

function readNdjson(path: string): Record<string, unknown>[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}

describe('RuntimeLog', () => {
  test('creates parent directories on first event', () => {
    const log = new RuntimeLog(logPath);
    log.event({action: 'first.event'});
    const lines = readNdjson(logPath);
    expect(lines).toHaveLength(1);
  });

  test('every line is ECS-shaped: @timestamp + service + event + log + message', () => {
    const log = new RuntimeLog(logPath);
    log.event({action: 'ffmpeg.compose', outcome: 'success', duration_ms: 1234, message: 'composed'});
    const [entry] = readNdjson(logPath);
    expect(entry).toMatchObject({
      service: {name: 'auto_demo'},
      event: {action: 'ffmpeg.compose', outcome: 'success', duration_ms: 1234},
      log: {level: 'info'},
      message: 'composed',
    });
    expect(typeof entry['@timestamp']).toBe('string');
    expect(/^\d{4}-\d{2}-\d{2}T/.test(entry['@timestamp'] as string)).toBe(true);
  });

  test('defaults outcome=success and level=info', () => {
    const log = new RuntimeLog(logPath);
    log.event({action: 'a'});
    const [entry] = readNdjson(logPath);
    expect((entry.event as Record<string, unknown>).outcome).toBe('success');
    expect((entry.log as Record<string, unknown>).level).toBe('info');
  });

  test('preserves arbitrary extra fields at the top level', () => {
    const log = new RuntimeLog(logPath);
    log.event({action: 'agent.click', step: 4, target: '#nav', url: 'http://x'});
    const [entry] = readNdjson(logPath);
    expect(entry).toMatchObject({step: 4, target: '#nav', url: 'http://x'});
  });

  test('appends — each event becomes its own line', () => {
    const log = new RuntimeLog(logPath);
    for (let i = 0; i < 5; i++) log.event({action: 'iteration', i});
    const lines = readNdjson(logPath);
    expect(lines).toHaveLength(5);
    expect(lines.every((l) => l.event && (l.event as Record<string, unknown>).action === 'iteration')).toBe(true);
  });

  test('time() records success + duration', async () => {
    const log = new RuntimeLog(logPath);
    const out = await log.time('slow.thing', async () => {
      await new Promise((r) => setTimeout(r, 25));
      return 'result';
    });
    expect(out).toBe('result');
    const [entry] = readNdjson(logPath);
    expect((entry.event as Record<string, unknown>).action).toBe('slow.thing');
    expect((entry.event as Record<string, unknown>).outcome).toBe('success');
    expect((entry.event as Record<string, unknown>).duration_ms).toBeGreaterThanOrEqual(20);
  });

  test('time() records failure + rethrows', async () => {
    const log = new RuntimeLog(logPath);
    await expect(log.time('break.it', async () => { throw new Error('boom'); })).rejects.toThrow(/boom/);
    const [entry] = readNdjson(logPath);
    expect((entry.event as Record<string, unknown>).outcome).toBe('failure');
    expect((entry.log as Record<string, unknown>).level).toBe('error');
    expect(entry.message).toBe('boom');
  });

  test('close() makes further events no-ops', () => {
    const log = new RuntimeLog(logPath);
    log.event({action: 'before'});
    log.close();
    log.event({action: 'after'});
    const lines = readNdjson(logPath);
    expect(lines).toHaveLength(1);
    expect((lines[0]!.event as Record<string, unknown>).action).toBe('before');
  });
});

describe('NoopRuntimeLog', () => {
  test('does not write to disk', () => {
    const log = new NoopRuntimeLog();
    expect(() => log.event({action: 'whatever'})).not.toThrow();
  });
});
