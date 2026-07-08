// The from-url → narrate bridge: renderNarrationScript converts a
// FromUrlScript's steps[].narration into the `start | duration | text`
// format narrate consumes. Locks determinism, reading-time pacing, and —
// the load-bearing contract — that its output round-trips through
// parseNarrationScript without loss.

import {describe, expect, test} from 'vitest';
import {renderNarrationScript} from '../src/from-url/narration-script.js';
import {parseNarrationScript} from '../src/modes/narrate.js';
import type {FromUrlScript} from '../src/from-url/types.js';

const script: FromUrlScript = {
  name: 'billing-demo',
  startUrl: 'https://example.com/billing',
  goal: 'show how to add a credit card',
  steps: [
    {selector: 'nav >> text=Billing', action: 'click', narration: 'Open the Billing page from the main navigation.'},
    {selector: '#add-card', action: 'click', narration: 'Start adding a new credit card.'},
    {
      selector: '#card-number', action: 'fill', narration: 'Enter the card number.', value: '4242',
    },
  ],
};

describe('renderNarrationScript', () => {
  test('is deterministic: same script in, byte-identical narration out', () => {
    expect(renderNarrationScript(script)).toBe(renderNarrationScript(script));
  });

  test('round-trips through parseNarrationScript with one cue per narrated step', () => {
    const cues = parseNarrationScript(renderNarrationScript(script));
    expect(cues).toHaveLength(script.steps.length);
    expect(cues.map(c => c.text)).toEqual(script.steps.map(s => s.narration));
  });

  test('cues are sequential and non-overlapping (each starts after the previous ends)', () => {
    const cues = parseNarrationScript(renderNarrationScript(script));
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i]!.startSec).toBeGreaterThanOrEqual(cues[i - 1]!.startSec + cues[i - 1]!.durationSec);
    }
  });

  test('duration scales with reading time and respects the minimum', () => {
    const short = parseNarrationScript(renderNarrationScript({
      ...script,
      steps: [{selector: 'x', action: 'click', narration: 'Go.'}],
    }));
    expect(short[0]!.durationSec).toBe(1.2); // Floor: one word never gets < MIN_LINE_SEC.

    const long = parseNarrationScript(renderNarrationScript({
      ...script,
      steps: [{
        selector: 'x', action: 'click',
        narration: 'This is a much longer narration line that a voiceover needs several seconds to read aloud comfortably.',
      }],
    }));
    expect(long[0]!.durationSec).toBeGreaterThan(4);
  });

  test('narration containing newlines collapses to one physical cue line (round-trip safe)', () => {
    const cues = parseNarrationScript(renderNarrationScript({
      ...script,
      steps: [{selector: 'a', action: 'click', narration: 'Open Billing.\nThen  wait\n\tfor the table.'}],
    }));
    expect(cues).toHaveLength(1);
    expect(cues[0]!.text).toBe('Open Billing. Then wait for the table.');
  });

  test('steps with empty narration are skipped, not emitted as blank cues', () => {
    const cues = parseNarrationScript(renderNarrationScript({
      ...script,
      steps: [
        {selector: 'a', action: 'click', narration: 'First.'},
        {selector: 'b', action: 'click', narration: '   '},
        {selector: 'c', action: 'click', narration: 'Second.'},
      ],
    }));
    expect(cues.map(c => c.text)).toEqual(['First.', 'Second.']);
  });

  test('header comments carry the script name and goal', () => {
    const out = renderNarrationScript(script);
    expect(out).toContain('# narration for billing-demo');
    expect(out).toContain('# goal: show how to add a credit card');
  });
});

// The package "exports" map points at dist/index.js built from this barrel;
// importing it here catches a barrel entry that names a non-existent export
// (which would otherwise only fail for library consumers at install time).
describe('library barrel (src/index.ts)', () => {
  test('exposes the documented programmatic surface', async () => {
    const lib = await import('../src/index.js');
    for (const name of [
      'runFlow',
      'loadFlow',
      'validateFlow',
      'renderNarration',
      'renderSplit',
      'renderVertical',
      'writeRegressArtifacts',
      'buildRegressReport',
      'generateScriptFromUrl',
      'renderNarrationScript',
      'watchOnce',
      'writeStoryboard',
      'renderAnimatedSvg',
      'buildWidgetScenario',
      'retimeRecordingToRealTime',
      'parseQualityPreset',
      'parseLanguages',
    ]) {
      expect(typeof (lib as Record<string, unknown>)[name], `barrel must export ${name}`).toBe('function');
    }
  });
});
