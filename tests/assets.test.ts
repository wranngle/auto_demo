// Packaging contract: every background preset and the cursor sprite must ship
// with the package. Regression of screencli@0.2.3, which excluded assets/ from
// the npm tarball and silently produced a broken composition step.
import {describe, expect, test} from 'vitest';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {resolve} from 'node:path';
import {BACKGROUND_PRESETS, backgroundImagePath} from '../src/video/background.js';

const repoRoot = resolve(__dirname, '..');

describe('packaged assets', () => {
  test('cursor.png exists and is a valid PNG of nontrivial size', () => {
    const cursor = resolve(repoRoot, 'assets', 'cursor.png');
    expect(existsSync(cursor)).toBe(true);
    const buf = readFileSync(cursor);
    // PNG magic bytes
    expect(buf.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    // Cursor sprite is small by design (~190 B 25x32 RGBA). Floor just
    // catches an empty or truncated file, not a "too small" file.
    expect(buf.length).toBeGreaterThan(100);
  });

  test.each(BACKGROUND_PRESETS)('background preset "%s" resolves to a real PNG > 100KB', (preset) => {
    const path = backgroundImagePath(preset);
    expect(existsSync(path)).toBe(true);
    const buf = readFileSync(path);
    expect(buf.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(statSync(path).size).toBeGreaterThan(100 * 1024);
  });

  test('package.json includes assets/ in the published files list', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {files?: string[]};
    expect(pkg.files).toContain('assets');
  });
});
