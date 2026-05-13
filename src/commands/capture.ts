import {resolve} from 'node:path';
import {v4 as uuid} from 'uuid';
import {launchSession} from '../browser/session.js';
import {EventLog} from '../recording/event-log.js';
import {deriveChapters} from '../recording/chapters.js';
import {writeMetadata} from '../recording/metadata.js';
import {runAgentLoop} from '../agent/loop.js';
import {composeVideo, generateThumbnail} from '../video/compose.js';
import {
  BACKGROUND_PRESETS,
} from '../video/background.js';
import type {BackgroundPreset, BackgroundOptions} from '../video/background.js';
import {
  recordingDir,
  eventsPath,
  metadataPath,
  composedVideoPath,
} from '../utils/paths.js';
import {setLogLevel} from '../utils/logger.js';
import {resolveAnthropicAuth, describeAuth} from '../oauth.js';
import {preflight} from '../preflight.js';
import {convertMatrix, type OutputFormat, type AspectRatio} from '../video/format.js';
import {existsSync, readFileSync} from 'node:fs';
import {resolveProvider, synthBatch, type TtsProviderName} from '../audio/tts.js';
import {planAudioFromEvents, muxAudioIntoVideo, audioVideoPath} from '../audio/compose-audio.js';
import {ensureDir} from '../utils/paths.js';

export const EXPLORE_DEFAULT_PROMPT =
  'Take a brief tour of this UI. Scroll through the main page in deliberate moves, hover ' +
  'over the primary navigation if present, then click into the first prominent action or section. ' +
  'After the next view loads, call the done tool. Do not submit forms, modify data, or trigger ' +
  'destructive actions.';

export interface CaptureOptions {
  url: string;
  prompt: string;
  output: string;
  viewport: {width: number; height: number};
  model: string;
  maxSteps: number;
  slowMoMs: number;
  headless: boolean;
  background?: BackgroundPreset | 'none';
  padding: number;
  cornerRadius: number;
  shadow: boolean;
  verbose: boolean;
  /** Single format (back-compat). Prefer `formats` for multi. */
  format?: OutputFormat;
  /** Multi-format list — when set, capture writes every entry. */
  formats?: OutputFormat[];
  aspect?: AspectRatio;
  /** Multi-aspect list — capture writes the (formats × aspects) matrix. */
  aspects?: AspectRatio[];
  logoPath?: string;
  authStatePath?: string;
  skipPreflight?: boolean;
  /** TTS provider for narration overlays. `none` = silent (default). */
  tts?: TtsProviderName | 'none';
}

export interface CaptureResult {
  recordingDir: string;
  summary: string;
  actions: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  composedVideo?: string;
  rawVideo?: string;
  formatOutput?: string;
  /** All format-matrix outputs (composed.mp4, composed.gif, etc.). */
  matrixOutputs?: string[];
  /** Path to the audio-mixed video when TTS ran. */
  audioVideo?: string;
}

export async function captureCommand(options: CaptureOptions): Promise<CaptureResult> {
  if (options.verbose) setLogLevel('debug');

  const auth = resolveAnthropicAuth();
  if (auth.source === 'none') {
    throw new Error(
      'No Anthropic auth available. Set ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or sign in with `claude` so ~/.claude/.credentials.json exists.',
    );
  }

  if (!options.skipPreflight) {
    const probe = await preflight(options.url);
    if (!probe.ok) {
      throw new Error(`Pre-flight failed for ${options.url}: ${probe.detail}. Pass --skip-preflight to override.`);
    }
  }

  const id = uuid();
  const recDir = recordingDir(resolve(options.output), id);

  let storageState: object | undefined;
  if (options.authStatePath) {
    if (!existsSync(options.authStatePath)) {
      throw new Error(`Auth state file not found: ${options.authStatePath}`);
    }
    storageState = JSON.parse(readFileSync(options.authStatePath, 'utf8'));
  }

  console.log(`auto_demo capture`);
  console.log(`  id:        ${id}`);
  console.log(`  url:       ${options.url}`);
  console.log(`  model:     ${options.model}`);
  console.log(`  auth:      ${describeAuth(auth)}`);
  if (storageState) console.log(`  storage:   ${options.authStatePath}`);
  console.log(`  output:    ${recDir}`);
  console.log('');

  const session = await launchSession({
    viewport: options.viewport,
    headless: options.headless,
    slowMo: options.slowMoMs,
    recordDir: recDir,
    ...(storageState ? {storageState} : {}),
  });

  const eventLog = new EventLog(eventsPath(recDir));

  let result;
  try {
    result = await runAgentLoop({
      apiKey: auth.apiKey,
      authToken: auth.authToken,
      model: options.model,
      recording_id: id,
      url: options.url,
      prompt: options.prompt,
      page: session.page,
      eventLog,
      recordingDir: recDir,
      actionDelayMs: 150,
      maxSteps: options.maxSteps,
      onAction: (step, toolName, description) => {
        const desc = description.length > 80 ? description.slice(0, 77) + '...' : description;
        console.log(`  [${String(step).padStart(2, '0')}] ${toolName.padEnd(12)} ${desc}`);
      },
    });
  } catch (err) {
    eventLog.flush();
    await session.close();
    throw err;
  }

  const rawVideo = await session.close();
  eventLog.flush();

  const events = eventLog.getEvents();
  const chapters = deriveChapters(events);
  writeMetadata(metadataPath(recDir), {
    id,
    created_at: new Date().toISOString(),
    url: options.url,
    prompt: options.prompt,
    model: options.model,
    viewport: options.viewport,
    duration_ms: eventLog.getDurationMs(),
    raw_video_path: rawVideo ?? '',
    event_log_path: eventsPath(recDir),
    chapters,
    agent_stats: result.stats,
  });

  let composedPath: string | undefined;
  const bgChoice = options.background as string | undefined;
  if (rawVideo && bgChoice !== 'none') {
    const background: BackgroundOptions | undefined =
      bgChoice && bgChoice !== 'none'
        ? {
            gradient: bgChoice as BackgroundPreset,
            padding: options.padding,
            cornerRadius: options.cornerRadius,
            shadow: options.shadow,
          }
        : undefined;

    try {
      composedPath = composedVideoPath(recDir);
      await composeVideo({
        rawVideoPath: rawVideo,
        events,
        outputPath: composedPath,
        viewport: options.viewport,
        zoom: true,
        highlight: false,
        cursor: true,
        background,
      });
      try {
        await generateThumbnail(composedPath, resolve(recDir, 'thumbnail.jpg'));
      } catch {
        // non-fatal
      }
    } catch (err) {
      console.warn(`  compose skipped: ${(err as Error).message}`);
      composedPath = undefined;
    }
  }

  // Optional TTS audio overlay (#3) — runs before the format matrix so the
  // audio-mixed video becomes the input to the matrix passes.
  let audioVideo: string | undefined;
  let videoForMatrix = composedPath;
  if (composedPath && options.tts && options.tts !== 'none') {
    try {
      const plan = planAudioFromEvents(events);
      if (plan.clips.length === 0) {
        console.warn('  tts: no narrate events to voice — skipping audio mix.');
      } else {
        const provider = resolveProvider(options.tts);
        const audioDir = ensureDir(resolve(recDir, 'audio'));
        const clipPaths = await synthBatch(provider, plan.clips.map((c) => ({text: c.text, index: c.index})), audioDir);
        const outAudio = audioVideoPath(recDir);
        await muxAudioIntoVideo({
          videoPath: composedPath,
          outputPath: outAudio,
          clipPaths,
          plan,
        });
        audioVideo = outAudio;
        videoForMatrix = outAudio;
      }
    } catch (err) {
      console.warn(`  tts skipped: ${(err as Error).message}`);
    }
  }

  // Output-format matrix (gif / aspect ratios / logo overlay). #12 in the roast.
  let formatOutput: string | undefined;
  let matrixOutputs: string[] | undefined;
  const formats = options.formats && options.formats.length > 0
    ? options.formats
    : (options.format ? [options.format] : []);
  const aspects = options.aspects && options.aspects.length > 0
    ? options.aspects
    : (options.aspect ? [options.aspect] : []);
  const needsFormatPass =
    videoForMatrix &&
    (formats.length > 0 || aspects.length > 0 || options.logoPath);
  if (videoForMatrix && needsFormatPass) {
    try {
      matrixOutputs = await convertMatrix({
        input: videoForMatrix,
        formats: formats.length > 0 ? formats : ['mp4'],
        aspects,
        ...(options.logoPath ? {logoPath: options.logoPath} : {}),
      });
      formatOutput = matrixOutputs[matrixOutputs.length - 1];
    } catch (err) {
      console.warn(`  format conversion skipped: ${(err as Error).message}`);
    }
  }

  console.log('');
  console.log(`auto_demo capture complete`);
  console.log(`  summary:   ${result.summary}`);
  console.log(`  actions:   ${result.stats.total_actions}`);
  console.log(`  tokens:    ${result.stats.input_tokens} in / ${result.stats.output_tokens} out`);
  console.log(`  duration:  ${(eventLog.getDurationMs() / 1000).toFixed(1)}s`);
  console.log(`  output:    ${recDir}`);
  if (matrixOutputs && matrixOutputs.length > 0) {
    for (const out of matrixOutputs) console.log(`  format:    ${out}`);
  } else if (formatOutput) console.log(`  format:    ${formatOutput}`);
  if (audioVideo) console.log(`  audio:     ${audioVideo}`);

  return {
    recordingDir: recDir,
    summary: result.summary,
    actions: result.stats.total_actions,
    inputTokens: result.stats.input_tokens,
    outputTokens: result.stats.output_tokens,
    durationMs: eventLog.getDurationMs(),
    composedVideo: composedPath,
    rawVideo,
    ...(formatOutput ? {formatOutput} : {}),
    ...(matrixOutputs ? {matrixOutputs} : {}),
    ...(audioVideo ? {audioVideo} : {}),
  };
}

export {BACKGROUND_PRESETS};
