// Tests for the embed-snippet generator.
import {describe, expect, test, beforeEach, afterEach} from 'vitest';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildEmbedSnippet} from '../src/commands/embed.js';

let recDir: string;

beforeEach(() => {
  recDir = mkdtempSync(join(tmpdir(), 'auto_demo-embed-'));
});

afterEach(() => {
  rmSync(recDir, {recursive: true, force: true});
});

function writeFixture(filename: string, body: Buffer | string = Buffer.from([0])): void {
  writeFileSync(join(recDir, filename), body);
}

describe('buildEmbedSnippet', () => {
  test('emits an HTML5 <video> + linked-poster markdown for composed.mp4', () => {
    writeFixture('composed.mp4');
    writeFixture('thumbnail.jpg');
    writeFixture('metadata.json', JSON.stringify({prompt: 'Show the dashboard.'}));

    const snippet = buildEmbedSnippet({recordingDir: recDir});
    expect(snippet.markdown).toMatch(/Show the dashboard/);
    expect(snippet.markdown).toMatch(/composed\.mp4/);
    expect(snippet.markdown).toMatch(/thumbnail\.jpg/);
    expect(snippet.htmlFallback).toMatch(/<video src=".+composed\.mp4"/);
    expect(snippet.htmlFallback).toMatch(/poster=".+thumbnail\.jpg"/);
  });

  test('emits a plain image-style markdown for .gif (no poster needed)', () => {
    writeFixture('composed.gif');
    const snippet = buildEmbedSnippet({recordingDir: recDir, title: 'My demo'});
    expect(snippet.markdown).toMatch(/^!\[My demo\]\(.+composed\.gif\)$/);
    expect(snippet.htmlFallback).toMatch(/<img src=".+composed\.gif" alt="My demo"/);
  });

  test('falls back to recording.webm when composed is missing', () => {
    writeFixture('recording.webm');
    const snippet = buildEmbedSnippet({recordingDir: recDir});
    expect(snippet.videoPath).toMatch(/recording\.webm$/);
  });

  test('respects --relative-to for nice README paths', () => {
    writeFixture('composed.mp4');
    writeFixture('thumbnail.jpg');
    // Pretend the recording lives inside a repo at recDir, and we want paths
    // relative to recDir itself.
    const snippet = buildEmbedSnippet({recordingDir: recDir, relativeTo: recDir});
    expect(snippet.markdown).toContain('composed.mp4');
    expect(snippet.markdown).not.toContain(recDir);
  });

  test('throws when there is no video at all', () => {
    expect(() => buildEmbedSnippet({recordingDir: recDir})).toThrow(/No video found/);
  });
});

