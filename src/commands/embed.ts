// auto_demo embed <recordingDir>
//
// Reads the recording's metadata.json + locates the best video file, prints
// a README-ready markdown snippet that embeds the demo as a video (with a
// poster image for HTML5 fallback). Closes the "now what do I do with this
// file" loop that capture/author leaves open.
import {existsSync, readFileSync} from 'node:fs';
import {basename, join, relative, resolve} from 'node:path';
import type {RecordingMetadata} from '../recording/types.js';

export interface EmbedOptions {
  recordingDir: string;
  relativeTo?: string;
  title?: string;
}

export interface EmbedResult {
  markdown: string;
  htmlFallback: string;
  videoPath: string;
  posterPath?: string;
}

const VIDEO_CANDIDATES = ['composed.mp4', 'composed.gif', 'composed.webm', 'recording.webm'];

export function buildEmbedSnippet(opts: EmbedOptions): EmbedResult {
  const dir = resolve(opts.recordingDir);
  let videoPath: string | undefined;
  for (const candidate of VIDEO_CANDIDATES) {
    const full = join(dir, candidate);
    if (existsSync(full)) {
      videoPath = full;
      break;
    }
  }
  if (!videoPath) {
    throw new Error(`No video found in ${dir} (looked for: ${VIDEO_CANDIDATES.join(', ')})`);
  }

  const meta: RecordingMetadata | undefined = existsSync(join(dir, 'metadata.json'))
    ? (JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8')) as RecordingMetadata)
    : undefined;

  const posterCandidates = ['thumbnail.jpg', 'preview.jpg'];
  const posterPath = posterCandidates
    .map((c) => join(dir, c))
    .find((p) => existsSync(p));

  const base = opts.relativeTo ? relative(resolve(opts.relativeTo), videoPath) : videoPath;
  const posterRel = posterPath && opts.relativeTo ? relative(resolve(opts.relativeTo), posterPath) : posterPath;

  const title = opts.title ?? meta?.prompt?.slice(0, 80) ?? basename(dir);
  const isGif = videoPath.endsWith('.gif');

  // Markdown for GitHub READMEs.
  const markdown = isGif
    ? `![${title}](${base})`
    : posterRel
      ? `[![${title}](${posterRel})](${base})`
      : `[Watch demo](${base})`;

  // HTML fallback for sites that render full HTML5 video controls.
  const htmlFallback = isGif
    ? `<img src="${base}" alt="${title}" />`
    : `<video src="${base}"${posterRel ? ` poster="${posterRel}"` : ''} controls muted playsinline loop>` +
      `Your browser does not support the video tag.</video>`;

  return {
    markdown,
    htmlFallback,
    videoPath,
    ...(posterPath ? {posterPath} : {}),
  };
}
