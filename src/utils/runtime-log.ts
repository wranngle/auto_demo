// Append-only NDJSON runtime log. Each line is one ECS-shaped object so the
// file is grep-able, jq-able, and DuckDB-readable with no special parser.
//
// Shape (every line):
//   {
//     "@timestamp": "2026-05-13T07:54:24.123Z",
//     "service": {"name": "auto_demo", "version": "0.2.0"},
//     "event": {"action": "browser.launch", "outcome": "success", "duration_ms": 1240},
//     "log":   {"level": "info"},
//     "message": "human-readable summary",
//     ...arbitrary context...
//   }
//
// The terminal-facing `logger` (src/utils/logger.ts) is for humans; this one
// is for machines + later forensics.
import {appendFileSync, mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createRequire} from 'node:module';

const requireCjs = createRequire(import.meta.url);
function packageVersion(): string {
  try {
    return (requireCjs('../../package.json') as {version?: string}).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const SERVICE = {name: 'auto_demo', version: packageVersion()};

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type EventOutcome = 'success' | 'failure' | 'unknown';

export interface EventRecord {
  /** dot-separated action name, e.g. "browser.launch", "ffmpeg.compose". */
  action: string;
  outcome?: EventOutcome;
  /** Duration of the action in milliseconds (when applicable). */
  duration_ms?: number;
  /** Human-readable summary. */
  message?: string;
  /** Log severity. Defaults to info. */
  level?: LogLevel;
  /** Any extra structured fields (file paths, ids, sizes). */
  [extra: string]: unknown;
}

export class RuntimeLog {
  private filePath: string;
  private closed = false;

  constructor(filePath: string) {
    this.filePath = filePath;
    mkdirSync(dirname(filePath), {recursive: true});
  }

  /** Append a single event. Synchronous + fail-soft (logs to stderr on IO error). */
  event(record: EventRecord): void {
    if (this.closed) return;
    const {action, outcome = 'success', message, level = 'info', duration_ms, ...rest} = record;
    const entry: Record<string, unknown> = {
      '@timestamp': new Date().toISOString(),
      service: SERVICE,
      event: {action, outcome, ...(duration_ms !== undefined ? {duration_ms} : {})},
      log: {level},
      ...(message !== undefined ? {message} : {}),
      ...rest,
    };
    try {
      appendFileSync(this.filePath, JSON.stringify(entry) + '\n');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`runtime-log write failed: ${msg}\n`);
    }
  }

  /** Convenience: time a function call and log a single event with duration_ms. */
  async time<T>(action: string, fn: () => Promise<T>, extra: Record<string, unknown> = {}): Promise<T> {
    const t0 = Date.now();
    try {
      const result = await fn();
      this.event({action, outcome: 'success', duration_ms: Date.now() - t0, ...extra});
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.event({
        action,
        outcome: 'failure',
        duration_ms: Date.now() - t0,
        level: 'error',
        message,
        ...extra,
      });
      throw err;
    }
  }

  close(): void {
    this.closed = true;
  }

  path(): string {
    return this.filePath;
  }
}

/** No-op runtime log used by tests / dry runs. */
export class NoopRuntimeLog extends RuntimeLog {
  constructor() {
    super('/dev/null');
  }

  event(): void {
    /* discard */
  }
}
