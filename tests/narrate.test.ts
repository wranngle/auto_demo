// Unit contract for the narration-script parser. narrate.bats covers the CLI
// end-to-end; this pins the pure parse format (`start | duration | text`, with
// `#` comments and blank lines ignored, `|` OR tab separators, decimal seconds)
// and its rejection rules — the format consumers must author scripts against.

import {describe, expect, test} from 'vitest';
import {parseNarrationScript} from '../src/modes/narrate.js';

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
