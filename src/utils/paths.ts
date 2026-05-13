import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}

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
