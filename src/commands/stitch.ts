// auto_demo stitch <dir1> <dir2> ...
//
// Concatenate the best-available video from each recording directory into
// a single output. Uses ffmpeg's concat demuxer (no re-encode when codecs
// match) and falls back to filter-graph concat when they don't.
import {existsSync, statSync, writeFileSync} from 'node:fs';
import {join, resolve, basename} from 'node:path';
import {runFFmpeg, getVideoDuration} from '../video/ffmpeg.js';
import {ensureDir} from '../utils/paths.js';

// Both dir-suffixed (<dir>/composed-audio.mp4) and keyed-prefix
// (<dir>/<key>.composed-audio.mp4) forms are searched.
const VIDEO_PRIORITY = ['composed-audio.mp4', 'composed.mp4', 'composed.webm', 'recording.webm', 'raw.mp4', 'raw.webm'];

export interface StitchOptions {
  inputs: string[];
  output: string;
  /** Optional cross-fade duration in seconds (0 = hard cut, default 0). */
  fadeS?: number;
  /** Force re-encode rather than concat-demuxer copy (default false). */
  reencode?: boolean;
}

export interface StitchResult {
  output: string;
  segments: Array<{dir: string; video: string; duration_s: number}>;
}

/** Find the best available video file given a directory OR a keyed prefix (.auto_demo/<key>). */
export function pickBestVideo(hint: string): string | undefined {
  if (existsSync(hint) && statSync(hint).isDirectory()) {
    for (const name of VIDEO_PRIORITY) {
      const candidate = join(hint, name);
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
  }
  // Keyed prefix mode: hint might be `.auto_demo/pinchgrab` or
  // `.auto_demo/pinchgrab.composed.mp4` — strip artifact suffix and try.
  const stem = hint.replace(/\.(composed-audio|composed|raw|thumbnail|events|metadata|manifest|flow\.demo|log)\.[a-z0-9]+$/, '');
  for (const name of VIDEO_PRIORITY) {
    const candidate = `${stem}.${name}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

/**
 * Plan-only: gather each input's best video. Pure, no IO past file existence
 * checks — easy to unit-test.
 */
export function planStitch(inputs: string[]): Array<{dir: string; video: string}> {
  const plan: Array<{dir: string; video: string}> = [];
  for (const inp of inputs) {
    const hint = resolve(inp);
    // Distinguish "the hint is a missing directory" from "the directory exists
    // but has no video" — both are user errors but the diagnostic differs.
    if (!existsSync(hint)) {
      // The hint might still be a valid keyed-prefix where `<hint>.composed.mp4`
      // exists. Only complain when *no* keyed sibling resolves.
      const probe = pickBestVideo(hint);
      if (!probe) throw new Error(`Stitch input does not exist: ${inp}`);
      plan.push({dir: hint, video: probe});
      continue;
    }
    const vid = pickBestVideo(hint);
    if (!vid) {
      throw new Error(`No video found in ${hint} (looked for: ${VIDEO_PRIORITY.join(', ')})`);
    }
    plan.push({dir: hint, video: vid});
  }
  return plan;
}

/** Write a temp `concat` demuxer manifest. Returns the manifest path. */
export function writeConcatManifest(plan: Array<{video: string}>, workDir: string): string {
  ensureDir(workDir);
  const path = join(workDir, '_stitch-manifest.txt');
  const body = plan.map((p) => `file '${p.video.replace(/'/g, "'\\''")}'`).join('\n');
  writeFileSync(path, body + '\n');
  return path;
}

/**
 * Build the filter_complex string for a cross-fade chain between N segments.
 * Tests assert on this string directly.
 */
export function buildConcatFadeFilter(
  durations_s: number[],
  fadeS: number,
): string {
  if (durations_s.length === 0) return '';
  if (durations_s.length === 1) return '[0:v]null[v];[0:a]anull[a]';

  // First segment is the running "base"; we xfade each next segment onto it.
  const chains: string[] = [];
  // Normalize video stream tag — the first is [0:v], subsequent come from xfade outputs.
  let runningV = '[0:v]';
  let runningA = '[0:a]';
  let accumOffset = 0;
  for (let i = 1; i < durations_s.length; i++) {
    const prevDur = durations_s[i - 1]!;
    accumOffset += prevDur - fadeS;
    const outV = i === durations_s.length - 1 ? '[v]' : `[v${i}]`;
    const outA = i === durations_s.length - 1 ? '[a]' : `[a${i}]`;
    chains.push(
      `${runningV}[${i}:v]xfade=transition=fade:duration=${fadeS.toFixed(3)}:offset=${accumOffset.toFixed(3)}${outV}`,
    );
    chains.push(
      `${runningA}[${i}:a]acrossfade=d=${fadeS.toFixed(3)}${outA}`,
    );
    runningV = outV;
    runningA = outA;
  }
  return chains.join(';');
}

/** Run the stitch end-to-end. */
export async function stitchVideos(opts: StitchOptions): Promise<StitchResult> {
  const plan = planStitch(opts.inputs);
  ensureDir(resolve(opts.output, '..'));

  // Probe durations once; used in both fade and copy paths for reporting.
  const segments: StitchResult['segments'] = [];
  for (const p of plan) {
    let duration_s = 0;
    try {
      duration_s = await getVideoDuration(p.video);
    } catch {
      // Some webm files don't report a duration cleanly; non-fatal.
      duration_s = 0;
    }
    segments.push({dir: p.dir, video: p.video, duration_s});
  }

  const fadeS = opts.fadeS ?? 0;
  if (fadeS > 0 && plan.length > 1) {
    // Filter-graph concat with crossfade.
    const filter = buildConcatFadeFilter(segments.map((s) => s.duration_s), fadeS);
    await runFFmpeg({
      input: plan[0]!.video,
      extraInputs: plan.slice(1).map((p) => p.video),
      output: opts.output,
      filterComplex: filter,
      outputArgs: [
        '-map', '[v]',
        '-map', '[a]?',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '160k',
      ],
    });
  } else {
    // Concat demuxer — fast, byte-copy when codecs match.
    const manifest = writeConcatManifest(plan, resolve(opts.output, '..'));
    await runFFmpeg({
      input: manifest,
      output: opts.output,
      inputArgs: ['-f', 'concat', '-safe', '0'],
      outputArgs: opts.reencode
        ? ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k']
        : ['-c', 'copy'],
    });
  }

  void basename;
  return {output: opts.output, segments};
}
