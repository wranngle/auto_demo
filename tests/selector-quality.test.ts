// The roast test. Author mode's whole pitch is "capture once, replay forever
// for free." That requires the emitted flow.demo.json to have stable selectors.
//
// In practice, smaller models (Haiku) act by accessibility-tree index alone,
// which produces flows where most interaction steps fall back to `TODO selector`.
// This test scores the already-recorded demos against a 75% selector-quality bar.
// It fails today — by design — as a scoreboard for the architectural gap.
//
// What "passing" would require:
//   - The agent's system prompt biases it toward role/name targets, OR
//   - tool-handlers.ts back-resolves indices to stable selectors at capture time, OR
//   - Author runs default to a stronger model that volunteers role/name in tool inputs.
import {describe, expect, test} from 'vitest';
import {readFileSync, existsSync, readdirSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';
import type {DemoFlow, DemoStep} from '../src/types.js';

const SELECTOR_REQUIRED: Array<DemoStep['action']> = ['click', 'fill', 'hover', 'focus'];
const QUALITY_THRESHOLD = 0.75;

function selectorQuality(flow: DemoFlow): {required: number; resolved: number; ratio: number} {
  const required = flow.steps.filter((s) => SELECTOR_REQUIRED.includes(s.action));
  const resolved = required.filter(
    (s) => typeof s.selector === 'string' && s.selector.length > 0 && !(typeof s.label === 'string' && s.label.startsWith('TODO selector')),
  );
  return {
    required: required.length,
    resolved: resolved.length,
    ratio: required.length === 0 ? 1 : resolved.length / required.length,
  };
}

const demosDir = resolve(__dirname, '..', 'demos');
const recordedDemos = existsSync(demosDir)
  ? readdirSync(demosDir)
      .map((name) => join(demosDir, name, 'flow.demo.json'))
      .filter((p) => existsSync(p) && statSync(p).isFile())
  : [];

describe('author-mode selector quality (roast)', () => {
  // .each so each demo gets a separate test entry in the report.
  test.each(recordedDemos)('%s should resolve ≥75%% of interaction selectors', (path) => {
    const flow = JSON.parse(readFileSync(path, 'utf8')) as DemoFlow;
    const score = selectorQuality(flow);

    // Negative-pass: this MAY fail. We assert with a soft message that names
    // the gap so the CI surface explains itself.
    if (score.required === 0) return; // pure-scroll demos are excused
    expect(
      score.ratio,
      `Selector quality on ${path}: ${score.resolved}/${score.required} = ${(score.ratio * 100).toFixed(0)}%. ` +
        `Below the ${QUALITY_THRESHOLD * 100}% bar — the agent acted by index for most clicks/fills.`,
    ).toBeGreaterThanOrEqual(QUALITY_THRESHOLD);
  });

  test('there is at least one recorded demo to score against', () => {
    expect(recordedDemos.length).toBeGreaterThan(0);
  });
});
