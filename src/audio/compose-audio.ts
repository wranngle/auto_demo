// Mix per-narration audio clips into the composed video at the right
// timestamps. The narrate events in the event log carry both the caption
// text and the timestamp (ms since recording started). After idle-trim
// runs, the timestamps inside the composed video shift — we accept the
// post-trim mapping as an input here.
import {join} from 'node:path';
import {existsSync, statSync} from 'node:fs';
import type {RecordingEvent} from '../recording/types.js';
import {runFFmpeg, getVideoDuration} from '../video/ffmpeg.js';

export interface PlannedClip {
  /** Index in the source narrations list. */
  index: number;
  /** Caption / spoken text. */
  text: string;
  /** Start offset in the composed video, in ms. */
  startMs: number;
}

export interface AudioPlan {
  clips: PlannedClip[];
}

/**
 * Build a plan: which narrations to render, and at what offset in the
 * composed video to drop each clip. `eventsForEffects` is the post-trim
 * event list (timestamps already shifted) — same shape capture/author pass
 * to the video filter graph.
 */
export function planAudioFromEvents(eventsForEffects: RecordingEvent[]): AudioPlan {
  const clips: PlannedClip[] = [];
  let index = 0;
  for (const event of eventsForEffects) {
    if (event.type !== 'narrate') continue;
    const text = (event.value ?? event.description ?? '').trim();
    if (!text) continue;
    clips.push({index, text, startMs: Math.max(0, event.timestamp_ms)});
    index++;
  }
  return {clips};
}

/**
 * Build the ffmpeg filter_complex string that:
 *   - Takes inputs [1:a]..[N:a] (the narration clips)
 *   - Applies adelay to each so they start at the right offset
 *   - Mixes them down to a single [aout] track
 *
 * Returns null when there are zero clips — caller should skip the audio
 * mix entirely.
 */
export function buildAudioMixFilter(clips: PlannedClip[]): string | null {
  if (clips.length === 0) return null;
  const delayed: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    const ms = clips[i]!.startMs;
    // [i+1:a] because [0] is the video input
    delayed.push(`[${i + 1}:a]adelay=${ms}|${ms},apad[d${i}]`);
  }
  const mixInputs = clips.map((_, i) => `[d${i}]`).join('');
  // amix with longest duration ensures the audio doesn't get cut short.
  const mix = `${mixInputs}amix=inputs=${clips.length}:duration=longest:dropout_transition=0[aout]`;
  return [...delayed, mix].join(';');
}

export interface AudioComposeOptions {
  /** Composed (silent) video. */
  videoPath: string;
  /** Output path for the audio-mixed video. */
  outputPath: string;
  /** Pre-rendered audio clip files, in plan order. */
  clipPaths: string[];
  /** Plan (used for the filter graph). */
  plan: AudioPlan;
}

/**
 * Mux audio clips into the composed video. Encodes audio as AAC; copies
 * video stream (no re-encode). Output is `outputPath`.
 */
export async function muxAudioIntoVideo(opts: AudioComposeOptions): Promise<string> {
  if (opts.plan.clips.length === 0 || opts.clipPaths.length === 0) {
    // Nothing to mix — return the input unchanged.
    return opts.videoPath;
  }
  if (opts.plan.clips.length !== opts.clipPaths.length) {
    throw new Error(`Audio plan/clip mismatch: ${opts.plan.clips.length} clips planned, ${opts.clipPaths.length} files`);
  }
  for (const p of opts.clipPaths) {
    if (!existsSync(p) || statSync(p).size === 0) {
      throw new Error(`Audio clip missing or empty: ${p}`);
    }
  }

  // Sanity: the longest clip endpoint should fit within the video duration
  // (or close to it). If a narration is past the end, that's the agent
  // producing a narrate event after the recording stopped — log and let
  // amix=longest deal with it.
  let videoDuration_s = 0;
  try {
    videoDuration_s = await getVideoDuration(opts.videoPath);
  } catch {
    // Non-fatal: we still try the mix.
  }
  void videoDuration_s;

  const filter = buildAudioMixFilter(opts.plan.clips)!;
  await runFFmpeg({
    input: opts.videoPath,
    extraInputs: opts.clipPaths,
    output: opts.outputPath,
    filterComplex: filter,
    outputArgs: [
      '-map', '0:v',
      '-map', '[aout]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-shortest',
    ],
  });
  return opts.outputPath;
}

/** Default audio-output filename next to a composed video. */
export function audioVideoPath(composedDir: string): string {
  return join(composedDir, 'composed-audio.mp4');
}
