// Unit contract for the narration-script parser. narrate.bats covers the CLI
// end-to-end; this pins the pure parse format (`start | duration | text`, with
// `#` comments and blank lines ignored, `|` OR tab separators, decimal seconds)
// and its rejection rules — the format consumers must author scripts against.

import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {
  afterEach, describe, expect, test, vi,
} from 'vitest';
import {
  DEFAULT_ELEVENLABS_VOICE_ID,
  parseNarrationScript,
  SUPPORTED_VOICES,

  __test__,
} from '../src/modes/narrate.js';

const {mockToneFrequencyHz} = __test__;
const repoRoot = resolve(dirname(fileURLToPath(new URL('.', import.meta.url))));

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

// MockToneFrequencyHz (src/modes/narrate.ts) hashes the cue text into
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

// FetchElevenLabsSpeech network contract, with fetch mocked so nothing ever
// leaves the process — and no ffmpeg: CI's vitest job has no external
// binaries (the decode/mix/mux integration lives in narrate.bats, which
// runs on the ffmpeg-equipped bats CI step against a local mock server).
// Locks: request shape, --voice-id routing, 429/5xx retry with backoff,
// and hard HTTP failures throwing instead of degrading to the mock tone.
describe('fetchElevenLabsSpeech (mocked network)', () => {
  const {fetchElevenLabsSpeech} = __test__;
  const line = {startSec: 0, durationSec: 1, text: 'First line'};
  const speechBytes = new Uint8Array([1, 2, 3, 4]);
  const config = (overrides: Partial<{apiKey: string; voiceId: string; retryBaseMs: number}> = {}) => ({
    apiKey: 'test-api-key',
    voiceId: DEFAULT_ELEVENLABS_VOICE_ID,
    retryBaseMs: 1,
    ...overrides,
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('POSTs the line to the voice endpoint and returns the audio bytes', async () => {
    const fetchMock = vi.fn(async () => new Response(speechBytes, {status: 200}));
    vi.stubGlobal('fetch', fetchMock);

    const audio = await fetchElevenLabsSpeech(line, config());

    expect([...audio]).toEqual([...speechBytes]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, {method: string; headers: Record<string, string>; body: string}];
    expect(url).toContain(`/v1/text-to-speech/${DEFAULT_ELEVENLABS_VOICE_ID}`);
    expect(url).toContain('output_format=mp3_44100_128');
    expect(init.method).toBe('POST');
    expect(init.headers['xi-api-key']).toBe('test-api-key');
    expect(JSON.parse(init.body)).toMatchObject({text: 'First line'});
  });

  test('voiceId routes the request to the requested voice', async () => {
    const fetchMock = vi.fn(async () => new Response(speechBytes, {status: 200}));
    vi.stubGlobal('fetch', fetchMock);

    await fetchElevenLabsSpeech(line, config({voiceId: 'custom-voice-123'}));

    const [url] = fetchMock.mock.calls[0]! as unknown as [string];
    expect(url).toContain('/v1/text-to-speech/custom-voice-123');
  });

  test('429 retries with backoff and then succeeds', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      return calls === 1
        ? new Response('rate limited', {status: 429, headers: {'retry-after': '0'}})
        : new Response(speechBytes, {status: 200});
    });
    vi.stubGlobal('fetch', fetchMock);

    const audio = await fetchElevenLabsSpeech(line, config());

    expect(audio.length).toBe(speechBytes.length);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('a non-retryable HTTP failure throws instead of degrading to mock', async () => {
    const fetchMock = vi.fn(async () => new Response('invalid api key', {status: 401}));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchElevenLabsSpeech(line, config())).rejects.toThrow(/HTTP 401/v);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('persistent 5xx exhausts retries and throws', async () => {
    const fetchMock = vi.fn(async () => new Response('upstream sad', {status: 503}));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchElevenLabsSpeech(line, config())).rejects.toThrow(/after 3 attempts/v);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('a network-level failure throws with the cause code, no retry', async () => {
    const fetchMock = vi.fn(async () => {
      throw Object.assign(new TypeError('fetch failed'), {cause: {code: 'ECONNREFUSED'}});
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchElevenLabsSpeech(line, config())).rejects.toThrow(/ECONNREFUSED/v);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// Doctrine drift: the `--voice <id>` enum (`mock`, `elevenlabs`) lives in
// `SUPPORTED_VOICES` (source of truth, src/modes/narrate.ts) plus two
// doc surfaces — the CLI option help text in src/cli.ts and the README
// narration prose. Adding a new voice (e.g. `openai`) would expose it via
// the runtime but leave both surfaces still claiming the two-voice list.
describe('doctrine drift: --voice enum across narrate.ts ↔ CLI help ↔ README', () => {
  test('CLI option help + README narration prose enumerate exactly SUPPORTED_VOICES', async () => {
    const sourceTruth = new Set<string>(SUPPORTED_VOICES);

    // CLI: `--voice <id>` help text reads `Voice id: "mock" (...) or "elevenlabs"`.
    const cli = await readFile(resolve(repoRoot, 'src', 'cli.ts'), 'utf8');
    const cliMatch = /--voice[^\)]*'\s*Voice id:\s*([^']+)'/v.exec(cli);
    expect(cliMatch, 'src/cli.ts must contain `--voice <id>` with `Voice id: ...` help text').not.toBeNull();
    const cliVoices = new Set([...cliMatch![1]!.matchAll(/"([\w\-]+)"/gv)].map(m => m[1]!));
    expect(cliVoices, `CLI help "${cliMatch![1]}" must enumerate ${[...sourceTruth].join(', ')}`).toEqual(sourceTruth);

    // README narrate section: enumerates `--voice mock` and `--voice elevenlabs`
    // as separate phrases. Pull every `--voice <name>` mention and dedupe.
    const readme = await readFile(resolve(repoRoot, 'README.md'), 'utf8');
    const readmeVoices = new Set([...readme.matchAll(/--voice\s+([\w\-]+)/gv)].map(m => m[1]!));
    expect(readmeVoices, `README enumerates ${[...readmeVoices].join(', ')}; SUPPORTED_VOICES is ${[...sourceTruth].join(', ')}`)
      .toEqual(sourceTruth);
  });
});
