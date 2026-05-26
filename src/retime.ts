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

import {execFile} from 'node:child_process';
import {rename, rm} from 'node:fs/promises';
import {promisify} from 'node:util';
import type {StepEvent} from './types.js';

const execFileAsync = promisify(execFile);

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

export async function retimeRecordingToRealTime(videoPath: string, events: StepEvent[]): Promise<void> {
  const containerSec = await probeDurationSec(videoPath);
  const ratio = computeRetimeRatio(events, containerSec);
  if (ratio === undefined) {
    return;
  }

  const tmp = `${videoPath}.retime.webm`;
  try {
    await execFileAsync('ffmpeg', [
      '-y', '-i', videoPath,
      '-filter:v', `setpts=${ratio.toFixed(6)}*PTS`,
      '-an', tmp,
    ]);
    await rename(tmp, videoPath);
  } catch {
    await rm(tmp, {force: true}).catch(() => undefined);
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
