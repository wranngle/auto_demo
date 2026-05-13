// Coverage for the new .auto_demo/<key>.<artifact> layout.
import {describe, expect, test, beforeEach, afterEach} from 'vitest';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolveOutputs, deriveKey, slugify, DEFAULT_BASE_DIR} from '../src/utils/paths.js';

let scratch: string;
let prevCwd: string;

beforeEach(() => {
  prevCwd = process.cwd();
  scratch = mkdtempSync(join(tmpdir(), 'auto_demo-paths-'));
  process.chdir(scratch);
});

afterEach(() => {
  process.chdir(prevCwd);
  rmSync(scratch, {recursive: true, force: true});
});

describe('slugify', () => {
  test('lowercases, kebab-cases, strips scheme', () => {
    expect(slugify('https://App.Wranngle.COM/console/')).toBe('app-wranngle-com-console');
  });

  test('keeps existing kebab-case alone', () => {
    expect(slugify('pinchgrab-demo')).toBe('pinchgrab-demo');
  });

  test('falls back to "demo" for empty / unprintable input', () => {
    expect(slugify('')).toBe('demo');
    expect(slugify('!!!')).toBe('demo');
  });

  test('clamps very long strings to 80 chars', () => {
    expect(slugify('x'.repeat(200)).length).toBe(80);
  });
});

describe('deriveKey', () => {
  test('explicit key wins', () => {
    expect(deriveKey({explicit: 'custom-name', url: 'https://x.com/'})).toBe('custom-name');
  });

  test('url derives <host>-<firstSegment>', () => {
    expect(deriveKey({url: 'https://app.wranngle.com/console/'})).toBe('app-wranngle-com-console');
    expect(deriveKey({url: 'https://app.wranngle.com/'})).toBe('app-wranngle-com');
  });

  test('flowPath derives from basename', () => {
    expect(deriveKey({flowPath: '/some/dir/local-smoke.demo.json'})).toBe('local-smoke');
  });

  test('falls back to "demo"', () => {
    expect(deriveKey({})).toBe('demo');
  });
});

describe('resolveOutputs', () => {
  test('builds .auto_demo/<key>.<artifact> under cwd by default', () => {
    const paths = resolveOutputs({key: 'pinchgrab'});
    expect(paths.baseDir).toBe(join(scratch, DEFAULT_BASE_DIR));
    expect(paths.events).toBe(join(scratch, DEFAULT_BASE_DIR, 'pinchgrab.events.jsonl'));
    expect(paths.log).toBe(join(scratch, DEFAULT_BASE_DIR, 'pinchgrab.log.jsonl'));
    expect(paths.composedVideo).toBe(join(scratch, DEFAULT_BASE_DIR, 'pinchgrab.composed.mp4'));
    expect(paths.composedAudioVideo).toBe(join(scratch, DEFAULT_BASE_DIR, 'pinchgrab.composed-audio.mp4'));
    expect(paths.rawVideo).toBe(join(scratch, DEFAULT_BASE_DIR, 'pinchgrab.raw.mp4'));
    expect(paths.flow).toBe(join(scratch, DEFAULT_BASE_DIR, 'pinchgrab.flow.demo.json'));
    expect(paths.manifest).toBe(join(scratch, DEFAULT_BASE_DIR, 'pinchgrab.manifest.json'));
    expect(paths.metadata).toBe(join(scratch, DEFAULT_BASE_DIR, 'pinchgrab.metadata.json'));
    expect(paths.thumbnail).toBe(join(scratch, DEFAULT_BASE_DIR, 'pinchgrab.thumbnail.jpg'));
    expect(paths.screenshotsDir).toBe(join(scratch, DEFAULT_BASE_DIR, 'pinchgrab.screenshots'));
    expect(paths.audioDir).toBe(join(scratch, DEFAULT_BASE_DIR, 'pinchgrab.audio'));
  });

  test('honors an explicit baseDir', () => {
    const custom = join(scratch, 'somewhere-else');
    const paths = resolveOutputs({key: 'pinchgrab', baseDir: custom});
    expect(paths.baseDir).toBe(custom);
    expect(paths.events).toBe(join(custom, 'pinchgrab.events.jsonl'));
  });

  test('auto-derives the key from a url', () => {
    const paths = resolveOutputs({url: 'https://app.wranngle.com/console/'});
    expect(paths.key).toBe('app-wranngle-com-console');
  });

  test('ensures the base directory exists', () => {
    const fresh = join(scratch, '_fresh');
    const paths = resolveOutputs({key: 'x', baseDir: fresh});
    expect(paths.baseDir).toBe(fresh);
    // The dir must have been mkdir-recursive'd by resolveOutputs.
    const {existsSync, statSync} = require('node:fs');
    expect(existsSync(fresh)).toBe(true);
    expect(statSync(fresh).isDirectory()).toBe(true);
  });
});
