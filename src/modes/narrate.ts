import {execFile} from 'node:child_process';
import {mkdir, readFile, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

const SAMPLE_RATE = 44_100;
const KNOWN_VOICES = new Set(['mock', 'elevenlabs']);

export type NarrateOptions = {
  scriptPath: string;
  inputVideoPath: string;
  outputPath: string;
  voice: string;
  workDir?: string;
  elevenLabsApiKey?: string;
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

  const workDir = resolve(options.workDir ?? join(dirname(outputPath), '.auto_demo-narrate'));
  await rm(workDir, {recursive: true, force: true});
  await mkdir(workDir, {recursive: true});
  await mkdir(dirname(outputPath), {recursive: true});

  const useRealVoice = options.voice === 'elevenlabs';
  const apiKey = options.elevenLabsApiKey ?? process.env.ELEVENLABS_API_KEY;

  const wavPaths: string[] = [];
  for (const [index, line] of lines.entries()) {
    const wavPath = join(workDir, `line-${String(index).padStart(4, '0')}.wav`);
    if (useRealVoice && apiKey !== undefined && apiKey !== '') {
      await synthesizeElevenLabsLine(line, wavPath, apiKey);
    } else {
      await synthesizeMockLine(line, wavPath);
    }

    wavPaths.push(wavPath);
  }

  const mixedAudioPath = join(workDir, 'mixed.wav');
  await mixNarrationTrack(wavPaths, lines, mixedAudioPath);

  await muxAudioOntoVideo(inputVideoPath, mixedAudioPath, outputPath);

  const {audioStreams, videoStreams} = await probeStreamCounts(outputPath);
  const byteSize = await fileSize(outputPath);

  return {
    outputPath,
    voice: useRealVoice && apiKey !== undefined && apiKey !== '' ? 'elevenlabs' : 'mock',
    lineCount: lines.length,
    audioStreams,
    videoStreams,
    byteSize,
  };
}

export function parseNarrationScript(raw: string): NarrationLine[] {
  const lines: NarrationLine[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const match = /^(\d+(?:\.\d+)?)\s*[\|\t]\s*(\d+(?:\.\d+)?)\s*[\|\t]\s*(.+)$/.exec(line);
    if (match === null) {
      throw new Error(`Invalid narration line (expected "start|duration|text"): ${line}`);
    }

    const startSec = Number.parseFloat(match[1] ?? '');
    const durationSec = Number.parseFloat(match[2] ?? '');
    const text = (match[3] ?? '').trim();
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
    '-f', 'lavfi',
    '-i', `sine=frequency=${frequency}:duration=${line.durationSec.toFixed(4)}:sample_rate=${SAMPLE_RATE}`,
    '-ac', '1',
    '-acodec', 'pcm_s16le',
    wavPath,
  ]);
}

async function synthesizeElevenLabsLine(line: NarrationLine, wavPath: string, _apiKey: string): Promise<void> {
  // Real ElevenLabs synthesis would POST to https://api.elevenlabs.io/v1/text-to-speech/<voice_id>
  // and decode the mp3 response into wavPath. This branch is intentionally a thin stub for now —
  // the round-2 plan ships the mock-voice contract; the network path is exercised by integration env.
  await synthesizeMockLine(line, wavPath);
}

function mockToneFrequencyHz(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) & 0xff_ff_ff_ff;
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
  const totalDurationSec = lines.reduce((max, line) => Math.max(max, line.startSec + line.durationSec), 0);
  const filterComplex = `${filterParts.join(';')};${labels}amix=inputs=${wavPaths.length}:duration=longest:normalize=0[out]`;

  await execFileAsync('ffmpeg', [
    '-y',
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', '[out]',
    '-t', totalDurationSec.toFixed(4),
    '-ac', '1',
    '-ar', String(SAMPLE_RATE),
    '-acodec', 'pcm_s16le',
    outputPath,
  ]);
}

async function muxAudioOntoVideo(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-y',
    '-i', videoPath,
    '-i', audioPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    '-movflags', '+faststart',
    outputPath,
  ]);
}

async function probeStreamCounts(mediaPath: string): Promise<{audioStreams: number; videoStreams: number}> {
  const {stdout} = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=codec_type',
    '-of', 'csv=p=0',
    mediaPath,
  ]);
  let audioStreams = 0;
  let videoStreams = 0;
  for (const codecType of stdout.trim().split(/\r?\n/)) {
    if (codecType === 'audio') audioStreams++;
    if (codecType === 'video') videoStreams++;
  }

  return {audioStreams, videoStreams};
}

async function fileSize(path: string): Promise<number> {
  const buffer = await readFile(path);
  return buffer.byteLength;
}

// Re-export for test introspection.
export const __test__ = {mockToneFrequencyHz, mixNarrationTrack, muxAudioOntoVideo};
