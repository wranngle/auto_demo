import {resolve, dirname} from 'node:path';
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
import {resolveOutputs, ensureDir, type OutputPaths} from '../utils/paths.js';
import {setLogLevel} from '../utils/logger.js';
import {RuntimeLog} from '../utils/runtime-log.js';
import {resolveAnthropicAuth, describeAuth} from '../oauth.js';
import {preflight} from '../preflight.js';
import {convertMatrix, type OutputFormat, type AspectRatio} from '../video/format.js';
import {existsSync, readFileSync} from 'node:fs';
import {resolveProvider, synthBatch, type TtsProviderName} from '../audio/tts.js';
import {planAudioFromEvents, muxAudioIntoVideo} from '../audio/compose-audio.js';

export const EXPLORE_DEFAULT_PROMPT =
  'Take a brief tour of this UI. Scroll through the main page in deliberate moves, hover ' +
  'over the primary navigation if present, then click into the first prominent action or section. ' +
  'After the next view loads, call the done tool. Do not submit forms, modify data, or trigger ' +
  'destructive actions.';

export interface CaptureOptions {
  url: string;
  prompt: string;
  /** Optional explicit output base dir. Defaults to <cwd>/.auto_demo. */
  output?: string;
  /** Optional explicit key (kebab-case). Defaults to slug of URL host+path. */
  key?: string;
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
  /** Path to an unpacked Chrome MV3 extension. Forces headed mode. */
  loadExtension?: string;
}

export interface CaptureResult {
  /** Full keyed paths for every artifact. */
  paths: OutputPaths;
  /** @deprecated Use paths.baseDir. */
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
  /** NDJSON runtime log path. */
  log: string;
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
  const paths = resolveOutputs({
    ...(options.key ? {key: options.key} : {}),
    ...(options.output ? {baseDir: options.output} : {}),
    url: options.url,
  });
  ensureDir(paths.baseDir);
  ensureDir(paths.screenshotsDir);
  const runtimeLog = new RuntimeLog(paths.log);
  runtimeLog.event({
    action: 'capture.start',
    message: `capture ${paths.key}`,
    key: paths.key,
    url: options.url,
    model: options.model,
    auth_source: auth.source,
    id,
  });

  let storageState: object | undefined;
  if (options.authStatePath) {
    if (!existsSync(options.authStatePath)) {
      throw new Error(`Auth state file not found: ${options.authStatePath}`);
    }
    storageState = JSON.parse(readFileSync(options.authStatePath, 'utf8'));
  }

  console.log(`auto_demo capture`);
  console.log(`  key:       ${paths.key}`);
  console.log(`  id:        ${id}`);
  console.log(`  url:       ${options.url}`);
  console.log(`  model:     ${options.model}`);
  console.log(`  auth:      ${describeAuth(auth)}`);
  if (storageState) console.log(`  storage:   ${options.authStatePath}`);
  console.log(`  output:    ${paths.baseDir}`);
  console.log(`  log:       ${paths.log}`);
  console.log('');

  // Playwright wants a directory to drop the raw video into; it then renames
  // the file. The new layout writes to <baseDir>/<key>.raw.mp4 directly via
  // a small move in close(). We tell Playwright to use the baseDir as scratch.
  const session = await launchSession({
    viewport: options.viewport,
    headless: options.loadExtension ? false : options.headless,
    slowMo: options.slowMoMs,
    recordDir: paths.baseDir,
    ...(storageState ? {storageState} : {}),
    ...(options.loadExtension ? {loadExtension: options.loadExtension} : {}),
  });

  const eventLog = new EventLog(paths.events);

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
      recordingDir: paths.baseDir,
      screenshotsDir: paths.screenshotsDir,
      actionDelayMs: 150,
      maxSteps: options.maxSteps,
      onAction: (step, toolName, description) => {
        const desc = description.length > 80 ? description.slice(0, 77) + '...' : description;
        console.log(`  [${String(step).padStart(2, '0')}] ${toolName.padEnd(12)} ${desc}`);
        runtimeLog.event({action: `agent.${toolName}`, step, message: description});
      },
    });
  } catch (err) {
    eventLog.flush();
    await session.close();
    runtimeLog.event({action: 'capture.error', outcome: 'failure', level: 'error', message: (err as Error).message});
    throw err;
  }

  let rawVideo = await session.close();
  eventLog.flush();
  // Promote Playwright's <baseDir>/raw.webm to the keyed <key>.raw.mp4 path.
  if (rawVideo && existsSync(rawVideo) && rawVideo !== paths.rawVideo) {
    try {
      const {renameSync} = await import('node:fs');
      // .webm → keep the extension Playwright produced; treat the keyed path
      // as a stable alias by symlinking when the extensions differ. The
      // compose step reads whichever exists.
      const keyedRaw = paths.rawVideo.replace(/\.mp4$/, '.webm');
      renameSync(rawVideo, keyedRaw);
      rawVideo = keyedRaw;
      runtimeLog.event({action: 'raw.rename', from: 'raw.webm', to: keyedRaw});
    } catch (err) {
      runtimeLog.event({action: 'raw.rename', outcome: 'failure', level: 'warn', message: (err as Error).message});
    }
  }

  const events = eventLog.getEvents();
  const chapters = deriveChapters(events);
  writeMetadata(paths.metadata, {
    id,
    created_at: new Date().toISOString(),
    url: options.url,
    prompt: options.prompt,
    model: options.model,
    viewport: options.viewport,
    duration_ms: eventLog.getDurationMs(),
    raw_video_path: rawVideo ?? '',
    event_log_path: paths.events,
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
      composedPath = paths.composedVideo;
      await runtimeLog.time('ffmpeg.compose', async () => composeVideo({
        rawVideoPath: rawVideo,
        events,
        outputPath: composedPath!,
        viewport: options.viewport,
        zoom: true,
        highlight: false,
        cursor: true,
        background,
      }), {output: composedPath});
      try {
        await generateThumbnail(composedPath, paths.thumbnail);
        runtimeLog.event({action: 'ffmpeg.thumbnail', output: paths.thumbnail});
      } catch (err) {
        runtimeLog.event({action: 'ffmpeg.thumbnail', outcome: 'failure', level: 'warn', message: (err as Error).message});
      }
    } catch (err) {
      console.warn(`  compose skipped: ${(err as Error).message}`);
      runtimeLog.event({action: 'ffmpeg.compose', outcome: 'failure', level: 'warn', message: (err as Error).message});
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
        const audioDir = ensureDir(paths.audioDir);
        const clipPaths = await synthBatch(provider, plan.clips.map((c) => ({text: c.text, index: c.index})), audioDir);
        runtimeLog.event({action: 'tts.synth', provider: provider.name, clips: clipPaths.length, dir: audioDir});
        await runtimeLog.time('ffmpeg.audio-mix', async () => muxAudioIntoVideo({
          videoPath: composedPath!,
          outputPath: paths.composedAudioVideo,
          clipPaths,
          plan,
        }), {output: paths.composedAudioVideo});
        audioVideo = paths.composedAudioVideo;
        videoForMatrix = paths.composedAudioVideo;
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

  runtimeLog.event({
    action: 'capture.complete',
    duration_ms: eventLog.getDurationMs(),
    actions: result.stats.total_actions,
    input_tokens: result.stats.input_tokens,
    output_tokens: result.stats.output_tokens,
    summary: result.summary,
    composed: composedPath,
    audio: audioVideo,
  });
  runtimeLog.close();

  console.log('');
  console.log(`auto_demo capture complete`);
  console.log(`  summary:   ${result.summary}`);
  console.log(`  actions:   ${result.stats.total_actions}`);
  console.log(`  tokens:    ${result.stats.input_tokens} in / ${result.stats.output_tokens} out`);
  console.log(`  duration:  ${(eventLog.getDurationMs() / 1000).toFixed(1)}s`);
  console.log(`  base:      ${paths.baseDir}`);
  console.log(`  key:       ${paths.key}`);
  if (composedPath) console.log(`  composed:  ${composedPath}`);
  if (matrixOutputs && matrixOutputs.length > 0) {
    for (const out of matrixOutputs) console.log(`  format:    ${out}`);
  } else if (formatOutput) console.log(`  format:    ${formatOutput}`);
  if (audioVideo) console.log(`  audio:     ${audioVideo}`);
  console.log(`  log:       ${paths.log}`);

  return {
    paths,
    recordingDir: paths.baseDir,
    summary: result.summary,
    actions: result.stats.total_actions,
    inputTokens: result.stats.input_tokens,
    outputTokens: result.stats.output_tokens,
    durationMs: eventLog.getDurationMs(),
    composedVideo: composedPath,
    rawVideo,
    log: paths.log,
    ...(formatOutput ? {formatOutput} : {}),
    ...(matrixOutputs ? {matrixOutputs} : {}),
    ...(audioVideo ? {audioVideo} : {}),
  };
}

export {BACKGROUND_PRESETS};
