// Unit contract for the vertical mode's ffmpeg filter builders. tests/vertical.bats
// covers the CLI end-to-end with a real ffmpeg invocation; this file pins the
// shape of the filter strings + the documented 9:16 preset dimensions.
// src/modes/vertical.ts exports `__test__` for exactly this.

import {describe, expect, test} from 'vitest';
// eslint-disable-next-line @typescript-eslint/naming-convention
import {__test__} from '../src/modes/vertical.js';

const {buildCropFilter, buildPadFilter, ASPECT_PRESETS} = __test__;

describe('ASPECT_PRESETS', () => {
  test('9:16 preset matches the documented 1080x1920 dimensions', () => {
    // CHANGELOG / README cite "vertical export (9:16)" + "1080x1920" as the
    // shipped contract. Lock the constants so a refactor that bumps them
    // without a docs update fails CI.
    expect(ASPECT_PRESETS['9:16']).toEqual({width: 1080, height: 1920, ratio: 9 / 16});
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
