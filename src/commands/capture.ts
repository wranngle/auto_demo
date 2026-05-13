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
}

export async function captureCommand(options: CaptureOptions): Promise<CaptureResult> {
  if (options.verbose) setLogLevel('debug');

  const auth = resolveAnthropicAuth();
  if (auth.source === 'none') {
    throw new Error(
      'No Anthropic auth available. Set ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or sign in with `claude` so ~/.claude/.credentials.json exists.',
    );
  }

  const id = uuid();
  const recDir = recordingDir(resolve(options.output), id);

  console.log(`auto_demo capture`);
  console.log(`  id:        ${id}`);
  console.log(`  url:       ${options.url}`);
  console.log(`  model:     ${options.model}`);
  console.log(`  auth:      ${describeAuth(auth)}`);
  console.log(`  output:    ${recDir}`);
  console.log('');

  const session = await launchSession({
    viewport: options.viewport,
    headless: options.headless,
    slowMo: options.slowMoMs,
    recordDir: recDir,
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

  console.log('');
  console.log(`auto_demo capture complete`);
  console.log(`  summary:   ${result.summary}`);
  console.log(`  actions:   ${result.stats.total_actions}`);
  console.log(`  tokens:    ${result.stats.input_tokens} in / ${result.stats.output_tokens} out`);
  console.log(`  duration:  ${(eventLog.getDurationMs() / 1000).toFixed(1)}s`);
  console.log(`  output:    ${recDir}`);

  return {
    recordingDir: recDir,
    summary: result.summary,
    actions: result.stats.total_actions,
    inputTokens: result.stats.input_tokens,
    outputTokens: result.stats.output_tokens,
    durationMs: eventLog.getDurationMs(),
    composedVideo: composedPath,
    rawVideo,
  };
}

export {BACKGROUND_PRESETS};
