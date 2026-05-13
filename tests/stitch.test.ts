// Gap #11 in ROAST.md — multi-shot composition. We test the planning + filter
// generation (pure logic) here; the full ffmpeg concat path is exercised when
// a CI run has ffmpeg available.
import {describe, expect, test, beforeEach, afterEach} from 'vitest';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {planStitch, pickBestVideo, buildConcatFadeFilter, writeConcatManifest} from '../src/commands/stitch.js';

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'auto_demo-stitch-'));
});

afterEach(() => {
  rmSync(scratch, {recursive: true, force: true});
});

function makeRecording(name: string, files: string[]): string {
  const dir = join(scratch, name);
  mkdirSync(dir, {recursive: true});
  for (const f of files) writeFileSync(join(dir, f), 'fake');
  return dir;
}

describe('pickBestVideo', () => {
  test('prefers composed-audio.mp4 over composed.mp4', () => {
    const dir = makeRecording('rec', ['composed-audio.mp4', 'composed.mp4']);
    expect(pickBestVideo(dir)).toContain('composed-audio.mp4');
  });

  test('falls through to composed.mp4 when audio-mix is absent', () => {
    const dir = makeRecording('rec', ['composed.mp4', 'recording.webm']);
    expect(pickBestVideo(dir)).toContain('composed.mp4');
  });

  test('falls through to recording.webm when no composed output exists', () => {
    const dir = makeRecording('rec', ['recording.webm']);
    expect(pickBestVideo(dir)).toContain('recording.webm');
  });

  test('returns undefined when the directory has no recognized video', () => {
    const dir = makeRecording('rec', ['notes.txt']);
    expect(pickBestVideo(dir)).toBeUndefined();
  });
});

describe('planStitch', () => {
  test('returns one plan entry per input in order', () => {
    const a = makeRecording('a', ['composed.mp4']);
    const b = makeRecording('b', ['recording.webm']);
    const plan = planStitch([a, b]);
    expect(plan).toHaveLength(2);
    expect(plan[0]!.video).toContain('a/composed.mp4');
    expect(plan[1]!.video).toContain('b/recording.webm');
  });

  test('throws when an input directory has no video at all', () => {
    const a = makeRecording('a', ['composed.mp4']);
    const b = makeRecording('b', []);
    expect(() => planStitch([a, b])).toThrow(/No video found/);
  });

  test('throws when an input directory does not exist', () => {
    expect(() => planStitch([join(scratch, 'nope')])).toThrow(/does not exist/);
  });
});

describe('writeConcatManifest', () => {
  test('writes one `file` line per plan entry', () => {
    const a = makeRecording('a', ['composed.mp4']);
    const b = makeRecording('b', ['composed.mp4']);
    const plan = planStitch([a, b]);
    const manifest = writeConcatManifest(plan, scratch);
    expect(existsSync(manifest)).toBe(true);
    const body = readFileSync(manifest, 'utf8');
    expect(body).toMatch(/^file '.*a\/composed\.mp4'/m);
    expect(body).toMatch(/^file '.*b\/composed\.mp4'/m);
  });
});

describe('buildConcatFadeFilter', () => {
  test('emits empty string for no segments', () => {
    expect(buildConcatFadeFilter([], 1)).toBe('');
  });

  test('emits a passthrough for a single segment', () => {
    expect(buildConcatFadeFilter([5], 1)).toBe('[0:v]null[v];[0:a]anull[a]');
  });

  test('chains xfade + acrossfade for N segments, with cumulative offsets', () => {
    // Three 4s clips, 0.5s fade ⇒ first xfade at t=3.5, second at t=3.5+(4-0.5)=7.0
    const filter = buildConcatFadeFilter([4, 4, 4], 0.5);
    expect(filter).toContain('offset=3.500');
    expect(filter).toContain('offset=7.000');
    // Final segment emits both video and audio output labels [v] and [a].
    expect(filter).toMatch(/xfade=[^[]*\[v\]/);
    expect(filter).toMatch(/acrossfade=d=0\.500\[a\]/);
  });
});
