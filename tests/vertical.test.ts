// Unit contract for the vertical mode's ffmpeg filter builders. tests/vertical.bats
// covers the CLI end-to-end with a real ffmpeg invocation; this file pins the
// shape of the filter strings + the documented 9:16 preset dimensions.
// src/modes/vertical.ts exports `__test__` for exactly this.

import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {describe, expect, test} from 'vitest';
// eslint-disable-next-line @typescript-eslint/naming-convention
import {FIT_MODES, __test__} from '../src/modes/vertical.js';

const {buildCropFilter, buildPadFilter, ASPECT_PRESETS} = __test__;
const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

describe('ASPECT_PRESETS', () => {
  test('9:16 preset matches the documented 1080x1920 dimensions', () => {
    // CHANGELOG / README cite "vertical export (9:16)" + "1080x1920" as the
    // shipped contract. Lock the constants so a refactor that bumps them
    // without a docs update fails CI.
    expect(ASPECT_PRESETS['9:16']).toEqual({width: 1080, height: 1920, ratio: 9 / 16});
  });

  // Doctrine-drift coupling: README's "Vertical export (9:16)" section cites
  // `(1080x1920)` as the shipped dimensions. The constant test above only
  // pins the in-code value; this one parses the README prose, so a bump to
  // ASPECT_PRESETS that forgets to update the README fails CI instead of
  // silently shipping stale doc dimensions to consumers.
  test('doctrine drift: README cites the same 9:16 dimensions ASPECT_PRESETS exposes', async () => {
    const preset = ASPECT_PRESETS['9:16']!;
    const readme = await readFile(resolve(repoRoot, 'README.md'), 'utf8');
    // Tolerate `1080x1920` or `1080×1920` (ASCII `x` vs Unicode `×`).
    const dimsPattern = /\((\d+)\s*[x×]\s*(\d+)\)/v;
    const match = dimsPattern.exec(readme);
    expect(match, 'README must contain a "(<W>x<H>)" or "(<W>×<H>)" 9:16 dimensions phrase').not.toBeNull();
    expect(Number(match![1]), `README claims width ${match![1]}; preset is ${preset.width}`).toBe(preset.width);
    expect(Number(match![2]), `README claims height ${match![2]}; preset is ${preset.height}`).toBe(preset.height);
  });
});

describe('buildCropFilter', () => {
  test('scales then center-crops to exact dimensions', () => {
    const filter = buildCropFilter(1080, 1920);
    // Scale-to-cover step: aspect-aware scaling, target dimensions present.
    expect(filter).toContain('scale=w=');
    expect(filter).toContain('1080');
    expect(filter).toContain('1920');
    // Final crop pins exact output dimensions.
    expect(filter).toContain('crop=1080:1920');
  });
});

describe('buildPadFilter', () => {
  test('scales to fit then centers with black bars', () => {
    const filter = buildPadFilter(1080, 1920);
    expect(filter).toContain('scale=w=');
    // Center-pad with black background matters for the "fit pad" preset.
    expect(filter).toContain('pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black');
  });
});

// Doctrine drift: the `--fit <mode>` enum (`crop`, `pad`) lives in
// `FIT_MODES` (source of truth, src/modes/vertical.ts) + README's
// "Vertical export" prose (`--fit crop`, `--fit pad`) + CHANGELOG's
// "--fit crop|pad" mention. src/cli.ts now derives its `.choices(...)`
// list from FIT_MODES by import (no more duplicate literal), but README
// and CHANGELOG can still desync if a new mode is added.
describe('doctrine drift: --fit enum across vertical.ts ↔ README ↔ CHANGELOG', () => {
  test('README + CHANGELOG enumerate exactly FIT_MODES', async () => {
    const sourceTruth = new Set<string>(FIT_MODES);

    // README: every `--fit <mode>` mention. The "Vertical export" section
    // names both `--fit crop` and `--fit pad`.
    const readme = await readFile(resolve(repoRoot, 'README.md'), 'utf8');
    const readmeModes = new Set([...readme.matchAll(/--fit\s+([\w-]+)/gu)].map(m => m[1]!));
    expect(readmeModes, `README enumerates ${[...readmeModes].join(', ')}; FIT_MODES is ${[...sourceTruth].join(', ')}`)
      .toEqual(sourceTruth);

    // CHANGELOG: the pipe-separated list in `--fit crop|pad`.
    const changelog = await readFile(resolve(repoRoot, 'CHANGELOG.md'), 'utf8');
    const changelogMatch = /--fit\s+([\w|]+)/u.exec(changelog);
    expect(changelogMatch, 'CHANGELOG must contain a `--fit <a>|<b>|...` reference').not.toBeNull();
    const changelogModes = new Set(changelogMatch![1]!.split('|').map(s => s.trim()).filter(Boolean));
    expect(changelogModes, `CHANGELOG "${changelogMatch![1]}" must enumerate ${[...sourceTruth].join(', ')}`)
      .toEqual(sourceTruth);
  });
});
