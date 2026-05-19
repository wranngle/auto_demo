import type {ViewportSize} from './types.js';

export type QualityPreset = '720p' | '1080p' | '4k';

export type QualitySpec = {
  preset: QualityPreset;
  viewport: ViewportSize;
  videoBitrateKbps: number;
};

export const QUALITY_PRESETS: Record<QualityPreset, QualitySpec> = {
  '720p': {
    preset: '720p',
    viewport: {width: 1280, height: 720},
    videoBitrateKbps: 4000,
  },
  '1080p': {
    preset: '1080p',
    viewport: {width: 1920, height: 1080},
    videoBitrateKbps: 8000,
  },
  '4k': {
    preset: '4k',
    viewport: {width: 3840, height: 2160},
    videoBitrateKbps: 20_000,
  },
};

export function parseQualityPreset(value: string): QualitySpec {
  const key = value.toLowerCase() as QualityPreset;
  const spec = QUALITY_PRESETS[key];

  if (spec === undefined) {
    const valid = Object.keys(QUALITY_PRESETS).join(', ');
    throw new Error(`Expected one of ${valid}, received ${value}`);
  }

  return spec;
}
