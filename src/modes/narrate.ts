import process from 'node:process';
import {
  mkdir, readFile, rm, writeFile,
} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {execFileAsync} from '../exec-file.js';

const SAMPLE_RATE = 44_100;

// Base URL is env-overridable (ELEVENLABS_TTS_API) so shell-level tests can
// point it at an unroutable address and exercise the failure path offline.
const ELEVENLABS_TTS_API = 'https://api.elevenlabs.io/v1/text-to-speech';
// "George — Warm, Captivating Storyteller": a current premade voice present
// in every workspace's roster, so it works via API even on the free tier
// (legacy voices like Rachel resolve as "library voices" there and 402).
export const DEFAULT_ELEVENLABS_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
const ELEVENLABS_MODEL_ID = 'eleven_multilingual_v2';
const SYNTHESIS_MAX_ATTEMPTS = 3;
const RETRYABLE_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);

// Supported `--voice` ids. The CLI option help and README enumerate these
// — adding a new id requires updating both surfaces (locked by
// tests/narrate.test.ts).
export const SUPPORTED_VOICES = ['mock', 'elevenlabs'] as const;
const KNOWN_VOICES: ReadonlySet<string> = new Set(SUPPORTED_VOICES);

export type NarrateOptions = {
  scriptPath: string;
  inputVideoPath: string;
  outputPath: string;
  voice: string;
  workDir?: string;
  elevenLabsApiKey?: string;
  /** ElevenLabs voice to synthesize with; only read when voice === 'elevenlabs'. */
  voiceId?: string;
  /** Base backoff in ms between synthesis retries (doubles per attempt); tests shrink it. */
  retryBaseMs?: number;
};

export type NarrateResult = {
  outputPath: string;
  voice: string;
  lineCount: number;
  audioStreams: number;
  videoStreams: number;
  byteSize: number;
};

export type NarrationLine = {
  startSec: number;
  durationSec: number;
  text: string;
};

export async function renderNarration(options: NarrateOptions): Promise<NarrateResult> {
  if (!KNOWN_VOICES.has(options.voice)) {
    throw new Error(`Unknown voice "${options.voice}". Valid: ${[...KNOWN_VOICES].join(', ')}`);
  }

  const scriptPath = resolve(options.scriptPath);
  const inputVideoPath = resolve(options.inputVideoPath);
  const outputPath = resolve(options.outputPath);

  if (!existsSync(scriptPath)) {
    throw new Error(`Script not found: ${scriptPath}`);
  }

  if (!existsSync(inputVideoPath)) {
    throw new Error(`Input video not found: ${inputVideoPath}`);
  }

  const lines = parseNarrationScript(await readFile(scriptPath, 'utf8'));
  if (lines.length === 0) {
    throw new Error(`Script ${scriptPath} contains no narration lines`);
  }

  const workDir = resolve(options.workDir ?? join(dirname(outputPath), '.ui-demo-runner-narrate'));
  await rm(workDir, {recursive: true, force: true});
  await mkdir(workDir, {recursive: true});
  await mkdir(dirname(outputPath), {recursive: true});

  // `--voice elevenlabs` performs real synthesis when a key is available
  // (option first, then ELEVENLABS_API_KEY). Without a key it deliberately
  // falls back to the mock tone — documented in the README — and the result
  // must honestly report `'mock'`: realSynthesisRan only flips on a
  // successful network synthesis. Once a key IS provided, failures throw
  // rather than silently degrading to the tone.
  const wantElevenLabs = options.voice === 'elevenlabs';
  const apiKey = options.elevenLabsApiKey ?? process.env.ELEVENLABS_API_KEY;
  let realSynthesisRan = false;

  const wavPaths: string[] = [];
  const mixLines: NarrationLine[] = [];
  for (const [index, line] of lines.entries()) {
    const wavPath = join(workDir, `line-${String(index).padStart(4, '0')}.wav`);
    if (wantElevenLabs && apiKey !== undefined && apiKey !== '') {
      // NOT `||=`: logical-or assignment short-circuits once true, which
      // would skip synthesis for every line after the first.
      const lineSynthesized = await synthesizeElevenLabsLine(line, wavPath, {
        apiKey,
        voiceId: options.voiceId ?? DEFAULT_ELEVENLABS_VOICE_ID,
        retryBaseMs: options.retryBaseMs ?? 1000,
      });
      realSynthesisRan ||= lineSynthesized;
      // Real speech has a natural length that can overrun the script's slot.
      // The mix must know the true extent or its trailing `-t` would clip the
      // final line mid-word (mux still caps audio at video length via -shortest).
      const actualSec = await probeDurationSec(wavPath);
      mixLines.push({...line, durationSec: Math.max(line.durationSec, actualSec)});
    } else {
      await synthesizeMockLine(line, wavPath);
      mixLines.push(line);
    }

    wavPaths.push(wavPath);
  }

  const mixedAudioPath = join(workDir, 'mixed.wav');
  await mixNarrationTrack(wavPaths, mixLines, mixedAudioPath);

  await muxAudioOntoVideo(inputVideoPath, mixedAudioPath, outputPath);

  const {audioStreams, videoStreams} = await probeStreamCounts(outputPath);
  const byteSize = await fileSize(outputPath);

  return {
    outputPath,
    // Report what actually ran: 'elevenlabs' only if at least one line was
    // synthesized over the network. The keyless fall-through renders the
    // mock tone, and claiming 'elevenlabs' for it would lie to the operator.
    voice: realSynthesisRan ? 'elevenlabs' : 'mock',
    lineCount: lines.length,
    audioStreams,
    videoStreams,
    byteSize,
  };
}

// A cue field must be a plain non-negative decimal. Anchored on a short,
// already-isolated field — no separator ambiguity, no backtracking blowup
// (the previous one-regex-per-line parse was polynomial on long tab runs).
const CUE_NUMBER = /^\d+(?:\.\d+)?$/v;

function splitCueLine(line: string): [string, string, string] | undefined {
  const first = separatorIndex(line, 0);
  if (first === -1) {
    return undefined;
  }

  const second = separatorIndex(line, first + 1);
  if (second === -1) {
    return undefined;
  }

  return [line.slice(0, first).trim(), line.slice(first + 1, second).trim(), line.slice(second + 1).trim()];
}

function separatorIndex(line: string, from: number): number {
  const pipe = line.indexOf('|', from);
  const tab = line.indexOf('\t', from);
  if (pipe === -1) {
    return tab;
  }

  if (tab === -1) {
    return pipe;
  }

  return Math.min(pipe, tab);
}

export function parseNarrationScript(raw: string): NarrationLine[] {
  const lines: NarrationLine[] = [];
  for (const rawLine of raw.split(/\r?\n/v)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const parts = splitCueLine(line);
    if (parts === undefined || !CUE_NUMBER.test(parts[0]) || !CUE_NUMBER.test(parts[1]) || parts[2] === '') {
      throw new Error(`Invalid narration line (expected "start|duration|text"): ${line}`);
    }

    const startSec = Number.parseFloat(parts[0]);
    const durationSec = Number.parseFloat(parts[1]);
    const text = parts[2];
    if (!Number.isFinite(startSec) || startSec < 0) {
      throw new Error(`Invalid start time in: ${line}`);
    }

    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      throw new Error(`Invalid duration in: ${line}`);
    }

    lines.push({startSec, durationSec, text});
  }

  return lines;
}

async function synthesizeMockLine(line: NarrationLine, wavPath: string): Promise<void> {
  const frequency = mockToneFrequencyHz(line.text);
  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${frequency}:duration=${line.durationSec.toFixed(4)}:sample_rate=${SAMPLE_RATE}`,
    '-ac',
    '1',
    '-acodec',
    'pcm_s16le',
    wavPath,
  ]);
}

type ElevenLabsSynthesisConfig = {
  apiKey: string;
  voiceId: string;
  retryBaseMs: number;
};

// Network layer, split from the ffmpeg decode so the retry/error contract
// stays unit-testable without external binaries (CI's vitest job has no
// ffmpeg; the bats job covers the decode integration against a local mock
// server). POSTs one narration line to the ElevenLabs TTS API and returns
// the mp3 bytes. Rate limits and transient 5xx retry with exponential
// backoff (honouring Retry-After when the server sends a longer wait);
// every other failure throws — once the operator provides a key, degrading
// to the mock tone silently is never acceptable.
async function fetchElevenLabsSpeech(line: NarrationLine, config: ElevenLabsSynthesisConfig): Promise<Uint8Array> {
  const base = process.env.ELEVENLABS_TTS_API ?? ELEVENLABS_TTS_API;
  const url = `${base}/${config.voiceId}?output_format=mp3_44100_128`;
  const snippet = line.text.length > 48 ? `${line.text.slice(0, 48)}…` : line.text;

  let lastFailure = '';
  for (let attempt = 1; attempt <= SYNTHESIS_MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': config.apiKey,
          'content-type': 'application/json',
          accept: 'audio/mpeg',
        },
        body: JSON.stringify({text: line.text, model_id: ELEVENLABS_MODEL_ID}),
      });
    } catch (error) {
      let cause: string | undefined;
      if (error instanceof Error && typeof error.cause === 'object' && error.cause !== null
        && 'code' in error.cause && typeof error.cause.code === 'string') {
        cause = error.cause.code;
      }

      throw new Error(`ElevenLabs TTS request failed for line "${snippet}": ${cause ?? (error instanceof Error ? error.message : String(error))}`, {cause: error});
    }

    if (response.ok) {
      return new Uint8Array(await response.arrayBuffer());
    }

    const responseText = await response.text();
    const body = responseText.slice(0, 300);
    lastFailure = `HTTP ${response.status}${body === '' ? '' : `: ${body}`}`;
    if (!RETRYABLE_HTTP_STATUS.has(response.status)) {
      throw new Error(`ElevenLabs TTS failed for line "${snippet}": ${lastFailure}`);
    }

    if (attempt < SYNTHESIS_MAX_ATTEMPTS) {
      const backoffMs = config.retryBaseMs * (2 ** (attempt - 1));
      const retryAfterSec = Number.parseFloat(response.headers.get('retry-after') ?? '');
      await sleep(Math.max(backoffMs, Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : 0));
    }
  }

  throw new Error(`ElevenLabs TTS failed for line "${snippet}" after ${SYNTHESIS_MAX_ATTEMPTS} attempts (${lastFailure})`);
}

// Fetches one line's speech and decodes it into the mono 44.1 kHz WAV the
// mixer expects, returning true so the caller's `realSynthesisRan` flips.
async function synthesizeElevenLabsLine(line: NarrationLine, wavPath: string, config: ElevenLabsSynthesisConfig): Promise<boolean> {
  const audio = await fetchElevenLabsSpeech(line, config);
  const mp3Path = wavPath.replace(/\.wav$/v, '.mp3');
  await writeFile(mp3Path, audio);
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    mp3Path,
    '-ac',
    '1',
    '-ar',
    String(SAMPLE_RATE),
    '-acodec',
    'pcm_s16le',
    wavPath,
  ]);
  return true;
}

async function probeDurationSec(mediaPath: string): Promise<number> {
  const {stdout} = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    mediaPath,
  ]);
  const seconds = Number.parseFloat(stdout.trim());
  return Number.isFinite(seconds) ? seconds : 0;
}

const sleep = async (ms: number) => new Promise<void>(resolve => {
  setTimeout(resolve, ms);
});

function mockToneFrequencyHz(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    // eslint-disable-next-line no-bitwise, unicorn/prefer-code-point -- Deliberate int32 wraparound over UTF-16 units; codePointAt would repitch any narration containing astral characters (e.g. emoji), breaking historical mock-tone parity.
    hash = ((hash * 31) + text.charCodeAt(i)) & 0xFF_FF_FF_FF;
  }

  return 220 + (Math.abs(hash) % 440);
}

async function mixNarrationTrack(wavPaths: string[], lines: NarrationLine[], outputPath: string): Promise<void> {
  const inputs: string[] = [];
  const filterParts: string[] = [];
  for (const [index, wavPath] of wavPaths.entries()) {
    const line = lines[index];
    if (line === undefined) {
      throw new Error(`Mismatched line/wav index ${index} (lines=${lines.length}, wavs=${wavPaths.length})`);
    }

    inputs.push('-i', wavPath);
    const delayMs = Math.round(line.startSec * 1000);
    filterParts.push(`[${index}:a]adelay=${delayMs}|${delayMs}[a${index}]`);
  }

  const labels = wavPaths.map((_value, index) => `[a${index}]`).join('');
  const totalDurationSec = Math.max(0, ...lines.map(line => line.startSec + line.durationSec));
  const filterComplex = `${filterParts.join(';')};${labels}amix=inputs=${wavPaths.length}:duration=longest:normalize=0[out]`;

  await execFileAsync('ffmpeg', [
    '-y',
    ...inputs,
    '-filter_complex',
    filterComplex,
    '-map',
    '[out]',
    '-t',
    totalDurationSec.toFixed(4),
    '-ac',
    '1',
    '-ar',
    String(SAMPLE_RATE),
    '-acodec',
    'pcm_s16le',
    outputPath,
  ]);
}

async function muxAudioOntoVideo(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    videoPath,
    '-i',
    audioPath,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-shortest',
    '-movflags',
    '+faststart',
    outputPath,
  ]);
}

async function probeStreamCounts(mediaPath: string): Promise<{audioStreams: number; videoStreams: number}> {
  const {stdout} = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'stream=codec_type',
    '-of',
    'csv=p=0',
    mediaPath,
  ]);
  let audioStreams = 0;
  let videoStreams = 0;
  for (const codecType of stdout.trim().split(/\r?\n/v)) {
    if (codecType === 'audio') {
      audioStreams++;
    }

    if (codecType === 'video') {
      videoStreams++;
    }
  }

  return {audioStreams, videoStreams};
}

async function fileSize(path: string): Promise<number> {
  const buffer = await readFile(path);
  return buffer.byteLength;
}

// Re-export for test introspection.
export const __test__ = {
  mockToneFrequencyHz, mixNarrationTrack, muxAudioOntoVideo, fetchElevenLabsSpeech,
};
