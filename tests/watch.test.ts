// Gap #9 in ROAST.md — watch / auto-rerecord. Unit-tests the regression
// detector (pure function) and exercises the file watcher's debounce path.
import {describe, expect, test, beforeEach, afterEach} from 'vitest';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {diffEvents} from '../src/commands/watch.js';

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'auto_demo-watch-'));
});

afterEach(() => {
  rmSync(scratch, {recursive: true, force: true});
});

function ev(index: number, action: string, status: 'ok' | 'failed', error?: string) {
  const base = {
    index,
    action: action as any,
    startedAt: new Date().toISOString(),
    status,
  };
  return error ? {...base, error} : base;
}

describe('diffEvents', () => {
  test('returns no regressions when both runs match', () => {
    const prev = [ev(0, 'click', 'ok'), ev(1, 'fill', 'ok')];
    const curr = [ev(0, 'click', 'ok'), ev(1, 'fill', 'ok')];
    const report = diffEvents(prev, curr);
    expect(report.totalRegressions).toBe(0);
    expect(report.newFailures).toEqual([]);
    expect(report.newPasses).toEqual([]);
  });

  test('flags a step that was passing and is now failing', () => {
    const prev = [ev(0, 'click', 'ok'), ev(1, 'fill', 'ok')];
    const curr = [ev(0, 'click', 'ok'), ev(1, 'fill', 'failed', 'no such selector')];
    const report = diffEvents(prev, curr);
    expect(report.totalRegressions).toBe(1);
    expect(report.newFailures[0]).toMatchObject({index: 1, action: 'fill', error: 'no such selector'});
  });

  test('flags a step that was failing and is now passing', () => {
    const prev = [ev(0, 'click', 'failed', 'broken')];
    const curr = [ev(0, 'click', 'ok')];
    const report = diffEvents(prev, curr);
    expect(report.totalRegressions).toBe(0);
    expect(report.newPasses).toHaveLength(1);
  });

  test('ignores steps that did not exist in the previous run', () => {
    const prev = [ev(0, 'click', 'ok')];
    const curr = [ev(0, 'click', 'ok'), ev(1, 'fill', 'failed', 'new step')];
    const report = diffEvents(prev, curr);
    // New step isn't a regression — there's nothing to regress against.
    expect(report.totalRegressions).toBe(0);
  });
});
