// Gap #12 in ROAST.md — multi-resolution / multi-format outputs at once.
// Exercises the parser; the actual matrix run is mocked-out at the convertVideo
// boundary in the unit test (we don't want to spin ffmpeg here).
import {describe, expect, test} from 'vitest';
import {parseFormatList, parseAspectList} from '../src/video/format.js';

describe('parseFormatList', () => {
  test('parses a single format', () => {
    expect(parseFormatList('mp4')).toEqual(['mp4']);
  });

  test('parses a comma-separated list and de-duplicates', () => {
    expect(parseFormatList('mp4,gif,mp4,webm')).toEqual(['mp4', 'gif', 'webm']);
  });

  test('rejects unknown formats with a helpful error', () => {
    expect(() => parseFormatList('mp4,mov')).toThrow(/Invalid --format value "mov"/);
  });

  test('returns empty for empty input', () => {
    expect(parseFormatList(undefined)).toEqual([]);
    expect(parseFormatList('')).toEqual([]);
    expect(parseFormatList('   ')).toEqual([]);
  });

  test('tolerates whitespace around entries', () => {
    expect(parseFormatList(' mp4 , gif ')).toEqual(['mp4', 'gif']);
  });
});

describe('parseAspectList', () => {
  test('parses a single aspect', () => {
    expect(parseAspectList('16:9')).toEqual(['16:9']);
  });

  test('parses every supported aspect', () => {
    expect(parseAspectList('16:9,1:1,9:16')).toEqual(['16:9', '1:1', '9:16']);
  });

  test('rejects unknown aspects', () => {
    expect(() => parseAspectList('4:3')).toThrow(/Invalid --aspect value "4:3"/);
  });
});
