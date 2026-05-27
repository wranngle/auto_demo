// Unit contract for the narration-script parser. narrate.bats covers the CLI
// end-to-end; this pins the pure parse format (`start | duration | text`, with
// `#` comments and blank lines ignored, `|` OR tab separators, decimal seconds)
// and its rejection rules — the format consumers must author scripts against.

import {describe, expect, test} from 'vitest';
// eslint-disable-next-line @typescript-eslint/naming-convention
import {parseNarrationScript, __test__} from '../src/modes/narrate.js';

const {mockToneFrequencyHz} = __test__;

describe('parseNarrationScript', () => {
  test('parses pipe-separated start | duration | text into typed cues', () => {
    const cues = parseNarrationScript('0 | 2.5 | Welcome to the demo\n2.5 | 3 | Now watch the agent work');
    expect(cues).toEqual([
      {startSec: 0, durationSec: 2.5, text: 'Welcome to the demo'},
      {startSec: 2.5, durationSec: 3, text: 'Now watch the agent work'},
    ]);
  });

  test('accepts tab as the separator', () => {
    const cues = parseNarrationScript('1\t2\tTab separated');
    expect(cues).toEqual([{startSec: 1, durationSec: 2, text: 'Tab separated'}]);
  });

  test('ignores blank lines and # comments', () => {
    const cues = parseNarrationScript('# header comment\n\n0 | 1 | Only real cue\n   \n# trailing note');
    expect(cues).toHaveLength(1);
    expect(cues[0]!.text).toBe('Only real cue');
  });

  test('handles CRLF line endings and trims surrounding whitespace', () => {
    const cues = parseNarrationScript('  0 | 1.5 |   spaced text  \r\n1.5 | 1 | second');
    expect(cues[0]).toEqual({startSec: 0, durationSec: 1.5, text: 'spaced text'});
    expect(cues).toHaveLength(2);
  });

  test('rejects a malformed line that is not start|duration|text', () => {
    expect(() => parseNarrationScript('this is not a cue')).toThrow(/expected "start\|duration\|text"/v);
  });

  test('rejects a non-positive duration', () => {
    expect(() => parseNarrationScript('0 | 0 | zero duration')).toThrow(/duration/v);
  });

  test('rejects a negative start time', () => {
    // A leading "-" makes the line fail the numeric pattern, surfacing as a format error.
    expect(() => parseNarrationScript('-1 | 2 | negative start')).toThrow(/expected "start\|duration\|text"|start/v);
  });

  test('an all-comment / empty script yields zero cues', () => {
    expect(parseNarrationScript('# just notes\n\n   \n')).toEqual([]);
  });
});

// mockToneFrequencyHz (src/modes/narrate.ts:145-152) hashes the cue text into
// a tone frequency in [220, 660] Hz — used by --voice mock so every line in a
// script gets a distinct, deterministic pitch. Locks the determinism + range
// contract so a refactor that changes the hash, range, or breaks idempotency
// fails CI before the recordings sound different.
describe('mockToneFrequencyHz', () => {
  test('is deterministic for the same input', () => {
    expect(mockToneFrequencyHz('Welcome to the demo')).toBe(mockToneFrequencyHz('Welcome to the demo'));
    expect(mockToneFrequencyHz('')).toBe(mockToneFrequencyHz(''));
  });

  test('returns frequencies in the documented [220, 660) Hz range', () => {
    for (const text of ['a', 'ab', 'abc', 'Quick brown fox', 'X', '12345', '!!!', 'Welcome']) {
      const hz = mockToneFrequencyHz(text);
      expect(hz, `${text} → ${hz}`).toBeGreaterThanOrEqual(220);
      expect(hz, `${text} → ${hz}`).toBeLessThan(660);
    }
  });

  test('distinct inputs typically map to distinct frequencies (anti-collision sanity)', () => {
    const inputs = ['opener', 'middle line', 'closing remark', 'one more cue'];
    const frequencies = new Set(inputs.map(s => mockToneFrequencyHz(s)));
    // Not a hash strength claim — just confirming the hash isn't degenerate
    // (e.g., refactor to a constant return).
    expect(frequencies.size).toBeGreaterThanOrEqual(3);
  });
});
