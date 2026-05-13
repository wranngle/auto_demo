// auto_demo judge <recordingDir>
//
// Vision-judge a finished recording: pass the final frame (thumbnail) plus
// the prompt+metadata to Claude vision, get back a JSON scorecard:
//   - covers_prompt (0..1)  : did the agent actually accomplish the prompt
//   - aesthetic     (0..1)  : how polished the demo looks
//   - blockers      string[]: specific defects the model spotted
//
// This is the oracle the test corpus uses when "looks good" is not assertable
// by string match.
import {readFileSync, existsSync, statSync} from 'node:fs';
import {join} from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import type {RecordingMetadata} from '../recording/types.js';
import {resolveAnthropicAuth} from '../oauth.js';
import {createAnthropicClient} from '../agent/client.js';

export interface JudgeScore {
  covers_prompt: number;
  aesthetic: number;
  blockers: string[];
  raw?: string;
}

export interface JudgeOptions {
  recordingDir: string;
  /** Override Claude model used for the judge call. */
  model?: string;
  /** Custom client (used in tests). */
  client?: Anthropic;
  /** Bypass live API entirely — return this score (used in tests). */
  stubScore?: JudgeScore;
}

const DEFAULT_MODEL = 'claude-opus-4-7';

const RUBRIC = [
  'You are a critic scoring a UI demo recording.',
  'You receive: (1) the user prompt the agent was given, and (2) the final screenshot.',
  'Return STRICTLY valid JSON of the form:',
  '{"covers_prompt": <0..1 float>, "aesthetic": <0..1 float>, "blockers": [<string>, ...]}',
  '',
  'Scoring rules:',
  '- covers_prompt: Does the final screenshot show that the prompt was fulfilled?',
  '  1.0 = clearly fulfilled. 0.5 = partial. 0.0 = unrelated / error page.',
  '- aesthetic: How polished is this image? 1.0 = portfolio-grade. 0.5 = ok. 0.0 = visibly broken.',
  '- blockers: short strings naming concrete defects (e.g. "error toast visible", "blank canvas",',
  '  "modal half-open"). Empty list when nothing is wrong.',
].join('\n');

export async function judgeRecording(opts: JudgeOptions): Promise<JudgeScore> {
  if (opts.stubScore) return opts.stubScore;

  const dir = opts.recordingDir;
  const metaPath = join(dir, 'metadata.json');
  if (!existsSync(metaPath)) {
    throw new Error(`metadata.json not found in ${dir}`);
  }
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as RecordingMetadata;
  const prompt = meta.prompt ?? '(no prompt)';

  // Final frame: prefer thumbnail.jpg, fall back to the last screenshot.
  const thumb = join(dir, 'thumbnail.jpg');
  if (!existsSync(thumb) || statSync(thumb).size === 0) {
    throw new Error(`thumbnail.jpg missing in ${dir} — re-run capture or pass an explicit image.`);
  }
  const imageBytes = readFileSync(thumb);
  const imageB64 = imageBytes.toString('base64');

  let client = opts.client;
  if (!client) {
    const auth = resolveAnthropicAuth();
    if (auth.source === 'none') {
      throw new Error('No Anthropic auth available for judge — set ANTHROPIC_API_KEY or use ~/.claude OAuth.');
    }
    client = createAnthropicClient(auth);
  }

  const model = opts.model ?? DEFAULT_MODEL;
  const response = await client.messages.create({
    model,
    max_tokens: 400,
    system: RUBRIC,
    messages: [
      {
        role: 'user',
        content: [
          {type: 'text', text: `Prompt: ${prompt}\n\nScore the final screenshot below. Respond with JSON only.`},
          {type: 'image', source: {type: 'base64', media_type: 'image/jpeg', data: imageB64}},
        ],
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return parseJudgeResponse(text);
}

/**
 * Parse the model's JSON response. Tolerates fenced code blocks and extra text;
 * fails loudly when no parseable object is present.
 */
export function parseJudgeResponse(raw: string): JudgeScore {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Try to extract the first {...} block.
    const match = /\{[\s\S]*\}/.exec(trimmed);
    if (!match) throw new Error(`Judge response is not JSON: ${raw.slice(0, 200)}`);
    parsed = JSON.parse(match[0]);
  }
  const score: JudgeScore = {
    covers_prompt: clamp01(toNumber(parsed.covers_prompt, 0)),
    aesthetic: clamp01(toNumber(parsed.aesthetic, 0)),
    blockers: Array.isArray(parsed.blockers)
      ? parsed.blockers.filter((b: unknown) => typeof b === 'string') as string[]
      : [],
    raw,
  };
  return score;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}
