import {describe, expect, test} from 'vitest';
import {QUALITY_PRESETS, parseQualityPreset} from '../src/quality.js';

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
    expect(() => parseQualityPreset('8k')).toThrow(/720p, 1080p, 4k/);
  });

  test('higher resolutions carry higher bitrate', () => {
    expect(QUALITY_PRESETS['720p'].videoBitrateKbps)
      .toBeLessThan(QUALITY_PRESETS['1080p'].videoBitrateKbps);
    expect(QUALITY_PRESETS['1080p'].videoBitrateKbps)
      .toBeLessThan(QUALITY_PRESETS['4k'].videoBitrateKbps);
  });
});
