// Unit contract for the pure SVG builder. tests/svg.bats covers the CLI
// end-to-end against a real MP4 fixture (round-trip via ffmpeg); this file
// pins the structural contract of `buildSvg`, the deterministic frames →
// XML string function. src/svg/index.ts exports `__test__` for exactly this.

import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {describe, expect, test} from 'vitest';
// eslint-disable-next-line @typescript-eslint/naming-convention
import {__test__} from '../src/svg/index.js';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

const {buildSvg, MAX_BYTES} = __test__;

// 1x1 JPEG, base64-encoded — small enough to keep tests fast, well-formed
// enough that the resulting SVG remains parseable.
const onePxJpeg = '/9j/4AAQSkZJRgABAQEAYABgAAD//gA7Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcgSlBFRyB2NjIpLCBxdWFsaXR5ID0gOTAK/9sAQwADAgIDAgIDAwMDBAMDBAUIBQUEBAUKBwcGCAwKDAwLCgsLDQ4SEA0OEQ4LCxAWEBETFBUVFQwPFxgWFBgSFBUU/9sAQwEDBAQFBAUJBQUJFA0LDRQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAAwDAQACEQMRAD8A/v8ooooA//9k=';

describe('buildSvg', () => {
  test('emits well-formed XML preamble + opening svg tag with the documented brand', () => {
    const svg = buildSvg({frames: [onePxJpeg], width: 320, height: 240, frameDurationMs: 100, totalDurationMs: 100});
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 320 240"');
    expect(svg).toContain('width="320" height="240"');
    // Brand-rename drift coupling — PR #18 renamed auto_demo → ui-demo-runner
    // throughout the user-visible surface, including this aria-label.
    expect(svg).toContain('aria-label="ui-demo-runner animated preview"');
  });

  test('emits exactly one <image> + one <animate> per frame', () => {
    const svg = buildSvg({frames: [onePxJpeg, onePxJpeg, onePxJpeg], width: 100, height: 100, frameDurationMs: 50, totalDurationMs: 150});
    expect((svg.match(/<image\b/gv) ?? []).length).toBe(3);
    expect((svg.match(/<animate\b/gv) ?? []).length).toBe(3);
    expect(svg).toContain('data-frame-duration-ms="50"');
    expect(svg).toContain('data:image/jpeg;base64,');
  });

  test('MAX_BYTES is the documented 200 KB README ceiling', () => {
    // Constant lives in CHANGELOG/README too ("200 KB ceiling"). Locks the
    // budget so a refactor that bumps it without a CHANGELOG update fails CI.
    expect(MAX_BYTES).toBe(200 * 1024);
  });

  // Doctrine-drift coupling: the SVG byte-budget is referenced in three
  // places — src/svg/index.ts (MAX_BYTES), README.md ("200KB ceiling"), and
  // CHANGELOG.md ("200 KB ceiling"). The previous test only locked the
  // numeric constant; this one parses the actual prose so a bump to
  // MAX_BYTES that skips updating either doc fails CI instead of silently
  // shipping a stale ceiling claim.
  test('doctrine drift: README + CHANGELOG cite the same byte-budget MAX_BYTES enforces', async () => {
    const expectedKb = MAX_BYTES / 1024;
    const readme = await readFile(resolve(repoRoot, 'README.md'), 'utf8');
    const changelog = await readFile(resolve(repoRoot, 'CHANGELOG.md'), 'utf8');

    // Tolerate `200KB` or `200 KB` (README uses no space; CHANGELOG uses one).
    const ceilingPattern = /(\d+)\s*KB\s+ceiling/v;
    const readmeMatch = ceilingPattern.exec(readme);
    const changelogMatch = ceilingPattern.exec(changelog);

    expect(readmeMatch, 'README must contain a "<N>KB ceiling" or "<N> KB ceiling" phrase').not.toBeNull();
    expect(changelogMatch, 'CHANGELOG must contain a "<N>KB ceiling" or "<N> KB ceiling" phrase').not.toBeNull();
    expect(Number(readmeMatch![1]), `README claims ${readmeMatch![1]}KB ceiling; MAX_BYTES is ${expectedKb}KB`).toBe(expectedKb);
    expect(Number(changelogMatch![1]), `CHANGELOG claims ${changelogMatch![1]}KB ceiling; MAX_BYTES is ${expectedKb}KB`).toBe(expectedKb);
  });
});
