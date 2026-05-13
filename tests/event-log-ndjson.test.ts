// Coverage for the NDJSON event-log + the legacy JSON-array reader fallback.
import {describe, expect, test, beforeEach, afterEach} from 'vitest';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventLog, readEventLog} from '../src/recording/event-log.js';

let scratch: string;
let logPath: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'auto_demo-elog-'));
  logPath = join(scratch, 'events.jsonl');
});

afterEach(() => {
  rmSync(scratch, {recursive: true, force: true});
});

const viewport = {width: 1280, height: 720};

describe('EventLog (NDJSON writes)', () => {
  test('each append() writes exactly one line to disk', () => {
    const log = new EventLog(logPath);
    log.append({type: 'navigate', description: 'go', viewport});
    log.append({type: 'click', description: 'tap', viewport});
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed).toHaveProperty('id');
      expect(parsed).toHaveProperty('timestamp_ms');
      expect(parsed).toHaveProperty('type');
    }
  });

  test('truncates any pre-existing file on construction', () => {
    writeFileSync(logPath, '{"stale":true}\n');
    const log = new EventLog(logPath);
    log.append({type: 'click', description: 'fresh', viewport});
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).description).toBe('fresh');
  });

  test('getDurationMs returns last event timestamp', async () => {
    const log = new EventLog(logPath);
    log.append({type: 'navigate', description: 'a', viewport});
    await new Promise((r) => setTimeout(r, 10));
    log.append({type: 'click', description: 'b', viewport});
    expect(log.getDurationMs()).toBeGreaterThan(0);
  });
});

describe('readEventLog', () => {
  test('reads NDJSON files produced by EventLog', () => {
    const log = new EventLog(logPath);
    log.append({type: 'navigate', description: 'n', viewport});
    log.append({type: 'click', description: 'c', viewport});
    const events = readEventLog(logPath);
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe('navigate');
    expect(events[1]!.type).toBe('click');
  });

  test('falls back to legacy JSON-array files', () => {
    // Older capture/author runs wrote events.json as a single array.
    const legacy = join(scratch, 'legacy.json');
    writeFileSync(legacy, JSON.stringify([
      {id: 1, timestamp_ms: 0, type: 'navigate', description: 'go', viewport},
      {id: 2, timestamp_ms: 100, type: 'click', description: 'tap', viewport},
    ]));
    const events = readEventLog(legacy);
    expect(events).toHaveLength(2);
    expect(events[1]!.type).toBe('click');
  });

  test('skips malformed lines instead of throwing', () => {
    writeFileSync(logPath, '\n' +
      JSON.stringify({id: 1, type: 'navigate', timestamp_ms: 0, description: '', viewport}) + '\n' +
      'not-json\n' +
      JSON.stringify({id: 2, type: 'click', timestamp_ms: 1, description: '', viewport}) + '\n');
    const events = readEventLog(logPath);
    expect(events.map((e) => e.type)).toEqual(['navigate', 'click']);
  });

  test('returns [] for missing or empty files', () => {
    expect(readEventLog(join(scratch, 'missing.jsonl'))).toEqual([]);
    writeFileSync(logPath, '');
    expect(readEventLog(logPath)).toEqual([]);
  });
});
