// auto_demo embed <recordingDir>
//
// Reads the recording's metadata.json + locates the best video file, prints
// a README-ready markdown snippet that embeds the demo as a video (with a
// poster image for HTML5 fallback). Closes the "now what do I do with this
// file" loop that capture/author leaves open.
import {existsSync, readFileSync, statSync} from 'node:fs';
import {basename, dirname, join, relative, resolve} from 'node:path';
import type {RecordingMetadata} from '../recording/types.js';

export interface EmbedOptions {
  /**
   * Either a recording directory (legacy layout: <dir>/composed.mp4) OR a
   * keyed prefix path (new layout: .auto_demo/<key> resolves to
   * .auto_demo/<key>.composed.mp4 etc.). Both forms are accepted.
   */
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

// Tried in priority order. Both dir-suffixed (`<dir>/composed.mp4`) and
// keyed-prefix (`<dir>/<key>.composed.mp4`) forms are resolved below.
const VIDEO_SUFFIXES = ['composed-audio.mp4', 'composed.mp4', 'composed.gif', 'composed.webm', 'recording.webm', 'raw.mp4', 'raw.webm'];

export function buildEmbedSnippet(opts: EmbedOptions): EmbedResult {
  const hint = resolve(opts.recordingDir);
  let videoPath: string | undefined;
  let metaPath: string | undefined;
  let posterPath: string | undefined;

  // Branch on whether the hint is a directory (legacy) or a stem (keyed).
  if (existsSync(hint) && statSync(hint).isDirectory()) {
    for (const suffix of VIDEO_SUFFIXES) {
      const full = join(hint, suffix);
      if (existsSync(full)) { videoPath = full; break; }
    }
    if (existsSync(join(hint, 'metadata.json'))) metaPath = join(hint, 'metadata.json');
    for (const p of ['thumbnail.jpg', 'preview.jpg']) {
      const full = join(hint, p);
      if (existsSync(full)) { posterPath = full; break; }
    }
  } else {
    // Keyed prefix mode — try .auto_demo/<key>.<suffix>
    const stem = hint.replace(/\.(composed-audio|composed|raw|thumbnail|events|metadata|manifest|flow\.demo|log)\.[a-z0-9]+$/, '');
    for (const suffix of VIDEO_SUFFIXES) {
      const full = `${stem}.${suffix}`;
      if (existsSync(full)) { videoPath = full; break; }
    }
    if (existsSync(`${stem}.metadata.json`)) metaPath = `${stem}.metadata.json`;
    for (const p of ['thumbnail.jpg', 'preview.jpg']) {
      const full = `${stem}.${p}`;
      if (existsSync(full)) { posterPath = full; break; }
    }
  }

  if (!videoPath) {
    throw new Error(`No video found at ${hint} (looked for suffixes: ${VIDEO_SUFFIXES.join(', ')})`);
  }

  const meta: RecordingMetadata | undefined = metaPath
    ? (JSON.parse(readFileSync(metaPath, 'utf8')) as RecordingMetadata)
    : undefined;
  void dirname; // keep import lint-clean if unused

  const base = opts.relativeTo ? relative(resolve(opts.relativeTo), videoPath) : videoPath;
  const posterRel = posterPath && opts.relativeTo ? relative(resolve(opts.relativeTo), posterPath) : posterPath;

  const title = opts.title ?? meta?.prompt?.slice(0, 80) ?? basename(hint);
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
