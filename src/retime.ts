// Real-time playback correction for Playwright-captured webms.
//
// THE BUG: Playwright captures ~75 fps of real frames over a session but tags
// the webm stream as 25 fps. Players honor the tag, so a 34s session plays back
// as ~100s of slow motion. The smoke demo (~2.7s wall-clock) plays back as
// ~15s — a 5–6x stretch on every recording. Posters look fine; only viewing
// catches it.
//
// THE FIX: after the recording lands, compare the run's wall-clock (first event
// start → last event end) to the webm container duration. If the video is
// stretched by >10%, re-encode with ffmpeg `setpts` to compress it back to
// real-time. No-op when ffmpeg is missing or the ratio is already ~1.
//
// computeRetimeRatio is pure (unit-tested in tests/retime.test.ts). retime is
// the IO wrapper that probes + invokes ffmpeg + atomically replaces the file.

import {rename, rm} from 'node:fs/promises';
import {execFileAsync} from './exec-file.js';
import type {StepEvent} from './types.js';

export function computeRetimeRatio(events: StepEvent[], containerSec: number | undefined): number | undefined {
  if (events.length < 2 || containerSec === undefined || !Number.isFinite(containerSec) || containerSec <= 0) {
    return undefined;
  }

  const start = Date.parse(events[0]!.startedAt);
  const endStamp = events.at(-1)!.endedAt ?? events.at(-1)!.startedAt;
  const wallClockSec = (Date.parse(endStamp) - start) / 1000;
  if (!Number.isFinite(wallClockSec) || wallClockSec <= 0) {
    return undefined;
  }

  const ratio = wallClockSec / containerSec;
  // >0.9 means within 10% of real-time — not worth a lossy re-encode.
  return ratio > 0.9 ? undefined : ratio;
}

export type RetimeOutcome = {
  status: 'retimed' | 'skipped' | 'failed';
  ratio?: number;
  videoBitrateKbps?: number;
  error?: string;
};

// Pure arg assembly for the post-process encode, split out so the encode
// contract stays unit-testable without ffmpeg (CI's vitest job has none):
// setpts only when the recording is stretched, -b:v/-maxrate/-bufsize only
// when a --quality preset asked for a bitrate target.
export function buildRetimeArgs(ratio: number | undefined, videoBitrateKbps: number | undefined): string[] {
  const filter = ratio === undefined ? [] : ['-filter:v', `setpts=${ratio.toFixed(6)}*PTS`];
  const bitrate = videoBitrateKbps === undefined
    ? []
    : [
      '-b:v',
      `${videoBitrateKbps}k`,
      '-maxrate',
      `${videoBitrateKbps}k`,
      '-bufsize',
      `${videoBitrateKbps * 2}k`,
    ];
  return [...filter, ...bitrate, '-an'];
}

// Re-encodes in place when the capture is stretched (setpts) and/or a
// --quality preset requests a bitrate target. Never throws: the raw capture
// is still a valid deliverable — but a failure is WARNED and returned, never
// swallowed, so `run` cannot silently ship the 3-5x slow-motion video the
// CHANGELOG claims is dead.
export async function retimeRecordingToRealTime(videoPath: string, events: StepEvent[], quality?: {videoBitrateKbps: number}): Promise<RetimeOutcome> {
  const containerSec = await probeDurationSec(videoPath);
  const ratio = computeRetimeRatio(events, containerSec);
  const videoBitrateKbps = quality?.videoBitrateKbps;
  if (ratio === undefined && videoBitrateKbps === undefined) {
    return {status: 'skipped'};
  }

  const applied = {
    ...(ratio === undefined ? {} : {ratio: Number(ratio.toFixed(6))}),
    ...(videoBitrateKbps === undefined ? {} : {videoBitrateKbps}),
  };

  const temporary = `${videoPath}.retime.webm`;
  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      videoPath,
      ...buildRetimeArgs(ratio, videoBitrateKbps),
      temporary,
    ]);
    await rename(temporary, videoPath);
    return {status: 'retimed', ...applied};
  } catch (error) {
    await rm(temporary, {force: true}).catch(() => undefined);
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    console.error(`Warning: recording post-process (retime/bitrate) failed; shipping the raw capture. ${message}`);
    return {status: 'failed', ...applied, error: message};
  }
}

async function probeDurationSec(videoPath: string): Promise<number | undefined> {
  try {
    const {stdout} = await execFileAsync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoPath,
    ]);
    const value = Number.parseFloat(stdout.trim());
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
