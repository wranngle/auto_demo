import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {describe, expect, test} from 'vitest';
import {QUALITY_PRESETS, parseQualityPreset} from '../src/quality.js';

const repoRoot = resolve(dirname(fileURLToPath(new URL('.', import.meta.url))));

describe('quality presets', () => {
  test('4k preset has 3840x2160 viewport', () => {
    const spec = QUALITY_PRESETS['4k'];
    expect(spec.viewport.width).toBe(3840);
    expect(spec.viewport.height).toBe(2160);
  });

  test('4k preset bitrate is within +/-10% of 20Mbps', () => {
    const spec = QUALITY_PRESETS['4k'];
    const targetKbps = 20_000;
    const tolerance = targetKbps * 0.1;
    expect(spec.videoBitrateKbps).toBeGreaterThanOrEqual(targetKbps - tolerance);
    expect(spec.videoBitrateKbps).toBeLessThanOrEqual(targetKbps + tolerance);
  });

  test('1080p preset has 1920x1080 viewport', () => {
    const spec = QUALITY_PRESETS['1080p'];
    expect(spec.viewport.width).toBe(1920);
    expect(spec.viewport.height).toBe(1080);
  });

  test('720p preset has 1280x720 viewport', () => {
    const spec = QUALITY_PRESETS['720p'];
    expect(spec.viewport.width).toBe(1280);
    expect(spec.viewport.height).toBe(720);
  });

  test('parseQualityPreset accepts "4k"', () => {
    const spec = parseQualityPreset('4k');
    expect(spec.preset).toBe('4k');
    expect(spec.viewport.width).toBe(3840);
  });

  test('parseQualityPreset is case-insensitive', () => {
    expect(parseQualityPreset('4K').preset).toBe('4k');
    expect(parseQualityPreset('1080P').preset).toBe('1080p');
  });

  test('parseQualityPreset rejects unknown preset', () => {
    expect(() => parseQualityPreset('8k')).toThrow(/720p, 1080p, 4k/v);
  });

  test('higher resolutions carry higher bitrate', () => {
    expect(QUALITY_PRESETS['720p'].videoBitrateKbps)
      .toBeLessThan(QUALITY_PRESETS['1080p'].videoBitrateKbps);
    expect(QUALITY_PRESETS['1080p'].videoBitrateKbps)
      .toBeLessThan(QUALITY_PRESETS['4k'].videoBitrateKbps);
  });

  // Doctrine drift: the `720p | 1080p | 4k` preset list lives in three
  // places — `QUALITY_PRESETS` (source of truth, src/quality.ts), the
  // CLI option help text in src/cli.ts, and the CHANGELOG entry. Adding
  // a new preset (e.g. `1440p`) would expose it via `parseQualityPreset`
  // but leave both the CLI's --help output and the CHANGELOG description
  // claiming the three-preset list. Lock the pipe-separated names so the
  // docs catch up at CI time.
  test('doctrine drift: CLI help text + CHANGELOG line enumerate exactly the QUALITY_PRESETS keys', async () => {
    const sourceTruth = new Set(Object.keys(QUALITY_PRESETS));

    const parsePipeList = (raw: string): Set<string> =>
      new Set(raw.split('|').map(s => s.trim()).filter(Boolean));

    // CLI help: `--quality <preset>` option text reads `Video preset: 720p | 1080p | 4k (...)`.
    const cli = await readFile(resolve(repoRoot, 'src', 'cli.ts'), 'utf8');
    const cliMatch = /--quality[^\)]*Video preset:\s*([\w\s\|]+?)\s*\(/v.exec(cli);
    expect(cliMatch, 'src/cli.ts must contain `Video preset: <a> | <b> | ... (...)` help text').not.toBeNull();
    const cliPresets = parsePipeList(cliMatch![1]!);
    expect(cliPresets, `CLI help "${cliMatch![1]}" must enumerate ${[...sourceTruth].join(', ')}`).toEqual(sourceTruth);

    // CHANGELOG: `--quality 720p | 1080p | 4k` preset for `run` (...).
    const changelog = await readFile(resolve(repoRoot, 'CHANGELOG.md'), 'utf8');
    const changelogMatch = /--quality\s+([\w\s\|]+?)`/v.exec(changelog);
    expect(changelogMatch, 'CHANGELOG must contain a `--quality <a> | <b> | ...` reference').not.toBeNull();
    const changelogPresets = parsePipeList(changelogMatch![1]!);
    expect(changelogPresets, `CHANGELOG "${changelogMatch![1]}" must enumerate ${[...sourceTruth].join(', ')}`).toEqual(sourceTruth);
  });
});
