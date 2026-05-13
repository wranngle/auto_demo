// NDJSON event log. Each agent action / browser event is appended as its own
// line so the file is grep-able + streamable mid-run. Backwards-compatible
// reader for legacy JSON-array event files lives in `readEventLog`.
import {appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import type {RecordingEvent, EventType, BoundingBox, Viewport, TargetMeta} from './types.js';

export class EventLog {
  private events: RecordingEvent[] = [];
  private startTime: number;
  private nextId = 1;

  constructor(private filePath: string) {
    this.startTime = Date.now();
    mkdirSync(dirname(filePath), {recursive: true});
    // Truncate any prior file from an aborted run.
    writeFileSync(filePath, '');
  }

  append(params: {
    type: EventType;
    description: string;
    bounding_box?: BoundingBox;
    viewport: Viewport;
    value?: string;
    url?: string;
    target_meta?: TargetMeta;
  }): RecordingEvent {
    const event: RecordingEvent = {
      id: this.nextId++,
      timestamp_ms: Date.now() - this.startTime,
      type: params.type,
      description: params.description,
      viewport: params.viewport,
      bounding_box: params.bounding_box,
      value: params.value,
      url: params.url,
      target_meta: params.target_meta,
    };
    this.events.push(event);
    try {
      appendFileSync(this.filePath, JSON.stringify(event) + '\n');
    } catch (err) {
      // Non-fatal: keep the in-memory log so flush() can recover.
      process.stderr.write(`event-log append failed: ${(err as Error).message}\n`);
    }
    return event;
  }

  getEvents(): RecordingEvent[] {
    return [...this.events];
  }

  getDurationMs(): number {
    if (this.events.length === 0) return 0;
    return this.events[this.events.length - 1]!.timestamp_ms;
  }

  /**
   * Rewrite the entire NDJSON file from the in-memory buffer. Safe fallback
   * when streaming appends failed mid-run; otherwise a no-op on the existing
   * lines.
   */
  flush(): void {
    if (this.events.length === 0) return;
    const body = this.events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    writeFileSync(this.filePath, body);
  }
}

/** Read an NDJSON event log written by EventLog, with fallback to legacy JSON-array files. */
export function readEventLog(path: string): RecordingEvent[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf8').trim();
  if (raw.length === 0) return [];
  // Heuristic: starts with `[` → legacy JSON array; otherwise NDJSON.
  if (raw.startsWith('[')) return JSON.parse(raw) as RecordingEvent[];
  const out: RecordingEvent[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as RecordingEvent);
    } catch (err) {
      process.stderr.write(`event-log: skipping malformed line: ${(err as Error).message}\n`);
    }
  }
  return out;
}
