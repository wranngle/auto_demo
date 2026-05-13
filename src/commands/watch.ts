// auto_demo watch <flow.demo.json>
//
// File watcher that re-runs the deterministic `run` pipeline whenever the
// flow file (or its sibling fixtures) change. Detects selector-quality
// regressions across runs by diffing the manifest's event statuses.

import {watch} from 'node:fs';
import {readFileSync, existsSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname, resolve} from 'node:path';
import {loadFlow} from '../flow-schema.js';
import {runFlow} from '../runner.js';
import type {RunResult} from '../types.js';

export interface WatchOptions {
  flowPath: string;
  outputBase: string;
  baseUrl?: string;
  headed?: boolean;
  /** Debounce window for file events, in ms. Default 500. */
  debounceMs?: number;
  /** When true, returns after the first run instead of staying resident. */
  once?: boolean;
}

export interface RegressionReport {
  newFailures: Array<{index: number; action: string; label?: string; error?: string}>;
  newPasses: Array<{index: number; action: string; label?: string}>;
  totalRegressions: number;
}

/**
 * Pure comparator: given the previous and current RunResult event arrays,
 * return what got worse (was ok, now failed) and what got better.
 */
export function diffEvents(prev: RunResult['events'], curr: RunResult['events']): RegressionReport {
  const prevByIndex = new Map(prev.map((e) => [e.index, e]));
  const newFailures: RegressionReport['newFailures'] = [];
  const newPasses: RegressionReport['newPasses'] = [];

  for (const c of curr) {
    const p = prevByIndex.get(c.index);
    if (!p) continue; // step didn't exist before — neither pass nor regression
    if (p.status === 'ok' && c.status === 'failed') {
      newFailures.push({
        index: c.index,
        action: String(c.action),
        ...(c.label ? {label: c.label} : {}),
        ...(c.error ? {error: c.error} : {}),
      });
    } else if (p.status === 'failed' && c.status === 'ok') {
      newPasses.push({
        index: c.index,
        action: String(c.action),
        ...(c.label ? {label: c.label} : {}),
      });
    }
  }

  return {newFailures, newPasses, totalRegressions: newFailures.length};
}

/** Run the flow once. Pure orchestration around runFlow. */
export async function runOnce(opts: WatchOptions): Promise<RunResult> {
  const loaded = await loadFlow(opts.flowPath);
  const outDir = join(opts.outputBase, `run-${Date.now()}`);
  const runOptions = {
    outputDir: outDir,
    flowDir: loaded.sourceDir,
    headed: opts.headed ?? false,
    recordVideo: false,
    slowMoMs: 0,
    speed: 1,
  };
  return runFlow(
    loaded.flow,
    opts.baseUrl === undefined ? runOptions : {...runOptions, baseUrl: opts.baseUrl},
  );
}

/**
 * Watch the flow file and re-run on change. Returns when `once: true`, or
 * when the abort signal fires (test harnesses call abort to stop the watcher).
 */
export async function watchCommand(opts: WatchOptions, signal?: AbortSignal): Promise<{
  /** Last completed run. */
  last?: RunResult;
  /** Number of runs completed. */
  runs: number;
  /** Last regression report (against the previous run). */
  lastReport?: RegressionReport;
}> {
  const flowPath = resolve(opts.flowPath);
  if (!existsSync(flowPath)) {
    throw new Error(`Flow file not found: ${flowPath}`);
  }
  const outBase = opts.outputBase ?? mkdtempSync(join(tmpdir(), 'auto_demo-watch-'));
  const debounceMs = opts.debounceMs ?? 500;

  let last: RunResult | undefined;
  let lastReport: RegressionReport | undefined;
  let runs = 0;
  let pendingTimer: NodeJS.Timeout | undefined;
  let running = false;
  let stopped = false;

  async function executeRun(): Promise<void> {
    if (running || stopped) return;
    running = true;
    try {
      const res = await runOnce({...opts, outputBase: outBase});
      runs++;
      if (last) {
        lastReport = diffEvents(last.events, res.events);
        if (lastReport.totalRegressions > 0) {
          console.error(`[watch] ${lastReport.totalRegressions} regression(s):`);
          for (const f of lastReport.newFailures) {
            console.error(`  - step ${f.index} (${f.action}) "${f.label ?? ''}" → ${f.error ?? 'failed'}`);
          }
        }
        if (lastReport.newPasses.length > 0) {
          console.error(`[watch] ${lastReport.newPasses.length} step(s) recovered.`);
        }
      } else {
        console.error(`[watch] initial run: ${res.events.length} steps, ${res.events.filter((e) => e.status === 'failed').length} failures.`);
      }
      last = res;
    } catch (err) {
      console.error(`[watch] run failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      running = false;
    }
  }

  // Initial run.
  await executeRun();
  if (opts.once) {
    return {last, runs, ...(lastReport ? {lastReport} : {})};
  }

  const watcher = watch(flowPath, () => {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      void executeRun();
    }, debounceMs);
  });

  // Optionally also watch the flow's directory for fixture changes.
  const dirWatcher = watch(dirname(flowPath), () => {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      void executeRun();
    }, debounceMs);
  });

  await new Promise<void>((resolveFn) => {
    if (!signal) return; // caller never aborts — would resolve only on process exit
    if (signal.aborted) {
      resolveFn();
      return;
    }
    signal.addEventListener('abort', () => resolveFn(), {once: true});
  });

  stopped = true;
  if (pendingTimer) clearTimeout(pendingTimer);
  watcher.close();
  dirWatcher.close();

  // Make typescript happy: ensure we read the variable.
  void readFileSync;
  return {last, runs, ...(lastReport ? {lastReport} : {})};
}
