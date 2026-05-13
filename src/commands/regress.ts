// Selector-durability regression harness. Re-runs a list of flow.demo.json
// files and produces a JSON report of selector quality + step pass rate.
// Used in CI on staging snapshots (#13 in the roast file).
import {readFileSync, writeFileSync, existsSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {loadFlow} from '../flow-schema.js';
import {runFlow} from '../runner.js';
import type {DemoFlow, DemoStep} from '../types.js';

const SELECTOR_REQUIRED: Array<DemoStep['action']> = ['click', 'fill', 'hover', 'focus'];

export interface FlowScore {
  flowPath: string;
  flowName: string;
  selectorRequired: number;
  selectorResolved: number;
  selectorRatio: number;
  stepsTotal: number;
  stepsFailed: number;
  passed: boolean;
  failureMessages: string[];
}

export interface RegressionReport {
  generated_at: string;
  threshold: number;
  flows: FlowScore[];
  passed: boolean;
}

export interface RegressionOptions {
  flows: string[];
  /** Selector-quality threshold (default 0.75). */
  threshold?: number;
  /** Where to write the report JSON. */
  outputPath?: string;
  /** Skip running the flow (for selector-scoring only). */
  scoreOnly?: boolean;
  /** Optional baseUrl applied to every flow's relative URLs. */
  baseUrl?: string;
}

/** Selector quality for a single flow object (no IO). */
export function scoreSelectors(flow: DemoFlow): {required: number; resolved: number; ratio: number} {
  const required = flow.steps.filter((s) => SELECTOR_REQUIRED.includes(s.action));
  const resolved = required.filter(
    (s) =>
      typeof s.selector === 'string' && s.selector.length > 0 &&
      !(typeof s.label === 'string' && s.label.startsWith('TODO selector')),
  );
  return {
    required: required.length,
    resolved: resolved.length,
    ratio: required.length === 0 ? 1 : resolved.length / required.length,
  };
}

export async function runRegression(opts: RegressionOptions): Promise<RegressionReport> {
  const threshold = opts.threshold ?? 0.75;
  const flows: FlowScore[] = [];

  for (const inp of opts.flows) {
    const flowPath = resolve(inp);
    if (!existsSync(flowPath)) {
      flows.push({
        flowPath,
        flowName: '(missing)',
        selectorRequired: 0,
        selectorResolved: 0,
        selectorRatio: 0,
        stepsTotal: 0,
        stepsFailed: 0,
        passed: false,
        failureMessages: [`flow file not found: ${flowPath}`],
      });
      continue;
    }
    const loaded = await loadFlow(flowPath);
    const sel = scoreSelectors(loaded.flow);
    let stepsTotal = loaded.flow.steps.length;
    let stepsFailed = 0;
    const failureMessages: string[] = [];

    if (!opts.scoreOnly) {
      const outDir = mkdtempSync(join(tmpdir(), 'auto_demo-regress-'));
      try {
        const runOptions = {
          outputDir: outDir,
          flowDir: loaded.sourceDir,
          headed: false,
          recordVideo: false,
          slowMoMs: 0,
          speed: 1,
        };
        const result = await runFlow(
          loaded.flow,
          opts.baseUrl === undefined ? runOptions : {...runOptions, baseUrl: opts.baseUrl},
        );
        stepsTotal = result.events.length;
        stepsFailed = result.events.filter((e) => e.status === 'failed').length;
        for (const e of result.events) {
          if (e.status === 'failed' && e.error) {
            failureMessages.push(`step ${e.index} (${e.action}): ${e.error}`);
          }
        }
      } catch (err) {
        stepsFailed = stepsTotal;
        failureMessages.push(`run threw: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const passed = sel.ratio >= threshold && stepsFailed === 0;
    flows.push({
      flowPath,
      flowName: loaded.flow.name ?? '(unnamed)',
      selectorRequired: sel.required,
      selectorResolved: sel.resolved,
      selectorRatio: sel.ratio,
      stepsTotal,
      stepsFailed,
      passed,
      failureMessages,
    });
  }

  const report: RegressionReport = {
    generated_at: new Date().toISOString(),
    threshold,
    flows,
    passed: flows.every((f) => f.passed),
  };

  if (opts.outputPath) {
    writeFileSync(opts.outputPath, JSON.stringify(report, null, 2));
  }

  return report;
}
