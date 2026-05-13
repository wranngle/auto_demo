// Standard auto_demo artifact layout.
//
//   <cwd>/.auto_demo/<key>.raw.mp4
//   <cwd>/.auto_demo/<key>.composed.mp4
//   <cwd>/.auto_demo/<key>.composed-audio.mp4
//   <cwd>/.auto_demo/<key>.events.jsonl          (NDJSON)
//   <cwd>/.auto_demo/<key>.log.jsonl             (NDJSON, ECS-shaped)
//   <cwd>/.auto_demo/<key>.metadata.json
//   <cwd>/.auto_demo/<key>.manifest.json         (run-mode)
//   <cwd>/.auto_demo/<key>.flow.demo.json        (author-mode)
//   <cwd>/.auto_demo/<key>.thumbnail.jpg
//   <cwd>/.auto_demo/<key>.screenshots/step-001.jpg
//   <cwd>/.auto_demo/<key>.audio/narration-001.wav
//
// `<key>` is a slug (kebab-case). When the user passes `--output <dir>`, that
// directory becomes the base instead of `<cwd>/.auto_demo`. When the user
// passes `--key <name>`, that overrides the auto-derived key.
import {existsSync, mkdirSync} from 'node:fs';
import {join, resolve, basename} from 'node:path';

export const DEFAULT_BASE_DIR = '.auto_demo';

export function ensureDir(dir: string): string {
  mkdirSync(dir, {recursive: true});
  return dir;
}

/** Slugify an arbitrary string into a safe kebab-case key. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'demo';
}

/**
 * Derive a key from a URL (hostname + first path segment) or a flow filename.
 * Falls back to "demo" when nothing else is available.
 */
export function deriveKey(input: {url?: string; flowPath?: string; explicit?: string}): string {
  if (input.explicit) return slugify(input.explicit);
  if (input.url) {
    try {
      const u = new URL(input.url);
      const path = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean)[0];
      return slugify(path ? `${u.hostname}-${path}` : u.hostname);
    } catch {
      return slugify(input.url);
    }
  }
  if (input.flowPath) {
    return slugify(basename(input.flowPath).replace(/\.demo\.json$/i, '').replace(/\.json$/i, ''));
  }
  return 'demo';
}

export interface OutputPaths {
  /** The kebab-case key for this artifact set. */
  key: string;
  /** The base dir (e.g., <cwd>/.auto_demo, or a user-supplied --output). */
  baseDir: string;
  /** Prefix for every keyed top-level file (<baseDir>/<key>). */
  prefix: string;
  rawVideo: string;
  composedVideo: string;
  composedAudioVideo: string;
  events: string;
  log: string;
  metadata: string;
  manifest: string;
  flow: string;
  thumbnail: string;
  screenshotsDir: string;
  audioDir: string;
}

export interface ResolveOutputsOptions {
  /** Explicit key (kebab-case). When omitted, derives from url / flowPath. */
  key?: string;
  /** When set, becomes the base dir instead of <cwd>/.auto_demo. */
  baseDir?: string;
  /** Optional source hints for key derivation. */
  url?: string;
  flowPath?: string;
}

export function resolveOutputs(options: ResolveOutputsOptions = {}): OutputPaths {
  const key = options.key
    ? slugify(options.key)
    : deriveKey({url: options.url, flowPath: options.flowPath});
  const baseDir = resolve(options.baseDir ?? join(process.cwd(), DEFAULT_BASE_DIR));
  ensureDir(baseDir);
  const prefix = join(baseDir, key);
  return {
    key,
    baseDir,
    prefix,
    rawVideo: `${prefix}.raw.mp4`,
    composedVideo: `${prefix}.composed.mp4`,
    composedAudioVideo: `${prefix}.composed-audio.mp4`,
    events: `${prefix}.events.jsonl`,
    log: `${prefix}.log.jsonl`,
    metadata: `${prefix}.metadata.json`,
    manifest: `${prefix}.manifest.json`,
    flow: `${prefix}.flow.demo.json`,
    thumbnail: `${prefix}.thumbnail.jpg`,
    screenshotsDir: `${prefix}.screenshots`,
    audioDir: `${prefix}.audio`,
  };
}

/**
 * Inverse of resolveOutputs: given any artifact path (e.g.,
 * .auto_demo/pinchgrab.composed.mp4 or .auto_demo/pinchgrab), discover the key
 * + paths. Used by `embed`, `judge`, `stitch` when accepting a "recording" arg
 * from the CLI.
 */
export function discoverFromHint(hint: string): OutputPaths {
  const full = resolve(hint);
  if (existsSync(full) && isDirectory(full)) {
    // Legacy mode: hint is a recording dir (<output>/<uuid>/composed.mp4 etc).
    // Surface a synthesized OutputPaths so existing tests/readers still work.
    const key = slugify(basename(full));
    return {
      key,
      baseDir: full,
      prefix: full,
      rawVideo: join(full, 'raw.mp4'),
      composedVideo: join(full, 'composed.mp4'),
      composedAudioVideo: join(full, 'composed-audio.mp4'),
      events: join(full, 'events.jsonl'),
      log: join(full, 'log.jsonl'),
      metadata: join(full, 'metadata.json'),
      manifest: join(full, 'manifest.json'),
      flow: join(full, 'flow.demo.json'),
      thumbnail: join(full, 'thumbnail.jpg'),
      screenshotsDir: join(full, 'screenshots'),
      audioDir: join(full, 'audio'),
    };
  }
  // Treat hint as `<baseDir>/<key>` or `<baseDir>/<key>.<artifact>`.
  // Strip trailing artifact suffix if present.
  const stem = full.replace(/\.(raw|composed|composed-audio|thumbnail)\.[a-z0-9]+$/, '')
                  .replace(/\.(events|log)\.jsonl$/, '')
                  .replace(/\.(metadata|manifest|flow\.demo)\.json$/, '');
  const baseDir = require('node:path').dirname(stem);
  const key = basename(stem);
  return resolveOutputs({key, baseDir});
}

function isDirectory(path: string): boolean {
  try {
    return require('node:fs').statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// ── Legacy helpers (kept for backwards compatibility) ─────────────────────

export function recordingDir(baseOutput: string, id: string): string {
  return ensureDir(join(baseOutput, id));
}

export function screenshotsDir(recDir: string): string {
  return ensureDir(join(recDir, 'screenshots'));
}

export function exportsDir(recDir: string): string {
  return ensureDir(join(recDir, 'exports'));
}

export function rawVideoPath(recDir: string): string {
  return join(recDir, 'raw.webm');
}

export function eventsPath(recDir: string): string {
  return join(recDir, 'events.json');
}

export function metadataPath(recDir: string): string {
  return join(recDir, 'metadata.json');
}

export function composedVideoPath(recDir: string): string {
  return join(recDir, 'composed.mp4');
}
