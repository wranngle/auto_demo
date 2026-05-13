import {describe, expect, test} from 'vitest';
import {parseInteger, parseSpeed, parseViewport} from '../src/cli-parsers.js';

describe('parseInteger', () => {
  test('accepts non-negative integers', () => {
    expect(parseInteger('0')).toBe(0);
    expect(parseInteger('14')).toBe(14);
    expect(parseInteger('9999')).toBe(9999);
  });

  test('rejects negative values', () => {
    expect(() => parseInteger('-1')).toThrow(/non-negative integer/v);
  });

  test('rejects non-numeric input', () => {
    expect(() => parseInteger('abc')).toThrow(/non-negative integer/v);
  });

  test('rejects decimals', () => {
    expect(() => parseInteger('3.14')).toThrow(/non-negative integer/v);
  });
});

describe('parseSpeed', () => {
  test('accepts speeds in (0, 8]', () => {
    expect(parseSpeed('1')).toBe(1);
    expect(parseSpeed('1.25')).toBe(1.25);
    expect(parseSpeed('8')).toBe(8);
  });

  test('rejects zero and negative speeds', () => {
    expect(() => parseSpeed('0')).toThrow(/speed/v);
    expect(() => parseSpeed('-2')).toThrow(/speed/v);
  });

  test('rejects speeds over 8', () => {
    expect(() => parseSpeed('8.1')).toThrow(/speed/v);
    expect(() => parseSpeed('100')).toThrow(/speed/v);
  });

  test('rejects NaN', () => {
    expect(() => parseSpeed('garbage')).toThrow(/speed/v);
  });
});

describe('parseViewport', () => {
  test('parses WxH', () => {
    expect(parseViewport('1280x720')).toEqual({width: 1280, height: 720});
    expect(parseViewport('1920x1080')).toEqual({width: 1920, height: 1080});
  });

  test('rejects malformed input', () => {
    expect(() => parseViewport('1280')).toThrow(/Invalid viewport/v);
    expect(() => parseViewport('1280X720')).toThrow(/Invalid viewport/v);
    expect(() => parseViewport('-1x720')).toThrow(/Invalid viewport/v);
    expect(() => parseViewport('')).toThrow(/Invalid viewport/v);
  });

  test('rejects tiny viewports', () => {
    expect(() => parseViewport('100x100')).toThrow(/too small/v);
    expect(() => parseViewport('320x239')).toThrow(/too small/v);
  });

  test('accepts the minimum threshold', () => {
    expect(parseViewport('320x240')).toEqual({width: 320, height: 240});
  });
});
