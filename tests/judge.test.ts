// Gaps #1 + #2 in ROAST.md — vision judge. The HTTP call itself is left to a
// live-API CI job; here we lock the JSON parser so a regression in model
// output handling is caught immediately.
import {describe, expect, test} from 'vitest';
import {parseJudgeResponse} from '../src/commands/judge.js';

describe('parseJudgeResponse', () => {
  test('parses a clean JSON object', () => {
    const score = parseJudgeResponse(
      JSON.stringify({covers_prompt: 0.9, aesthetic: 0.7, blockers: ['modal overlay']}),
    );
    expect(score.covers_prompt).toBe(0.9);
    expect(score.aesthetic).toBe(0.7);
    expect(score.blockers).toEqual(['modal overlay']);
  });

  test('strips ```json fences and parses', () => {
    const score = parseJudgeResponse(
      '```json\n{"covers_prompt":1,"aesthetic":0.5,"blockers":[]}\n```',
    );
    expect(score.covers_prompt).toBe(1);
    expect(score.aesthetic).toBe(0.5);
    expect(score.blockers).toEqual([]);
  });

  test('extracts the first {...} block from a noisy response', () => {
    const score = parseJudgeResponse(
      'Here you go:\n\n{"covers_prompt": 0.4, "aesthetic": 0.2, "blockers": ["broken layout"]}\n\nLet me know if you want a breakdown.',
    );
    expect(score.covers_prompt).toBe(0.4);
    expect(score.blockers).toEqual(['broken layout']);
  });

  test('clamps out-of-range scores to [0,1]', () => {
    const score = parseJudgeResponse(
      JSON.stringify({covers_prompt: 1.7, aesthetic: -0.5, blockers: []}),
    );
    expect(score.covers_prompt).toBe(1);
    expect(score.aesthetic).toBe(0);
  });

  test('drops non-string blocker entries silently', () => {
    const score = parseJudgeResponse(
      JSON.stringify({covers_prompt: 1, aesthetic: 1, blockers: ['real', 42, null, 'also-real']}),
    );
    expect(score.blockers).toEqual(['real', 'also-real']);
  });

  test('coerces numeric strings', () => {
    const score = parseJudgeResponse('{"covers_prompt":"0.6","aesthetic":"0.8","blockers":[]}');
    expect(score.covers_prompt).toBe(0.6);
    expect(score.aesthetic).toBe(0.8);
  });

  test('throws when there is no parseable JSON', () => {
    expect(() => parseJudgeResponse('this is just prose, no scores')).toThrow(/not JSON/);
  });
});
