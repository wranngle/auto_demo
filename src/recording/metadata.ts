import { writeFileSync, readFileSync } from 'node:fs';
import type { RecordingMetadata } from './types.js';

export function writeMetadata(path: string, metadata: RecordingMetadata): void {
  writeFileSync(path, JSON.stringify(metadata, null, 2));
}

export function readMetadata(path: string): RecordingMetadata {
  return JSON.parse(readFileSync(path, 'utf-8'));
}
