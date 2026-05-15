import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {describe, expect, test} from 'vitest';
import {hashDom, watchOnce} from '../src/watch/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => resolve(here, '..', 'fixtures', name);

describe('watchOnce', () => {
  test('CHANGE_DETECTED log line fires when DOMs differ, runner invoked exactly once', async () => {
    const logLines: string[] = [];
    let runnerCalls = 0;

    const result = await watchOnce({
      fixture: fixture('old-dom.html'),
      next: fixture('new-dom.html'),
      logger: (line) => logLines.push(line),
      runner: () => {
        runnerCalls += 1;
      },
    });

    expect(result.changed).toBe(true);
    expect(result.rerunCount).toBe(1);
    expect(runnerCalls).toBe(1);
    expect(logLines.some((line) => line.startsWith('CHANGE_DETECTED '))).toBe(true);
  });

  test('NO_CHANGE log line fires when DOMs match, runner is not invoked', async () => {
    const logLines: string[] = [];
    let runnerCalls = 0;

    const result = await watchOnce({
      fixture: fixture('old-dom.html'),
      next: fixture('old-dom.html'),
      logger: (line) => logLines.push(line),
      runner: () => {
        runnerCalls += 1;
      },
    });

    expect(result.changed).toBe(false);
    expect(result.rerunCount).toBe(0);
    expect(runnerCalls).toBe(0);
    expect(logLines.some((line) => line.startsWith('NO_CHANGE '))).toBe(true);
    expect(logLines.some((line) => line.startsWith('CHANGE_DETECTED '))).toBe(false);
  });

  test('hashDom strips HTML comments, is case-insensitive, and is deterministic', () => {
    const base = hashDom('<div>hello</div>');
    const withComment = hashDom('<!-- header --><div>hello</div>');
    const upper = hashDom('<DIV>HELLO</DIV>');
    expect(withComment).toBe(base);
    expect(upper).toBe(base);
    expect(hashDom('<div>hello</div>')).toBe(base);
  });

  test('rejects an empty fixture path', async () => {
    await expect(watchOnce({fixture: '', next: fixture('new-dom.html')})).rejects.toThrow(/fixture/v);
  });

  test('rejects an empty next path', async () => {
    await expect(watchOnce({fixture: fixture('old-dom.html'), next: ''})).rejects.toThrow(/next/v);
  });
});
