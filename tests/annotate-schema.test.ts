// Schema-level checks for the new `annotate` action (gap #10 in ROAST.md).
import {describe, expect, test} from 'vitest';
import {validateFlow} from '../src/flow-schema.js';

describe('annotate action validation', () => {
  test('accepts an arrow with explicit x/y and text', () => {
    const flow = validateFlow({
      startUrl: '/',
      steps: [
        {action: 'annotate', kind: 'arrow', x: 100, y: 200, text: 'Look here', durationMs: 1500},
      ],
    });
    expect(flow.steps[0]?.action).toBe('annotate');
  });

  test('accepts a callout anchored to a selector instead of x/y', () => {
    const flow = validateFlow({
      startUrl: '/',
      steps: [
        {action: 'annotate', kind: 'callout', anchor: '#nav', text: 'Primary nav'},
      ],
    });
    expect(flow.steps[0]?.anchor).toBe('#nav');
  });

  test('rejects an unknown kind', () => {
    expect(() => validateFlow({
      startUrl: '/',
      steps: [
        {action: 'annotate', kind: 'sparkle', x: 0, y: 0, text: 'x'},
      ],
    })).toThrow(/annotate\.kind must be one of/);
  });

  test('rejects an annotate with neither anchor nor x/y', () => {
    expect(() => validateFlow({
      startUrl: '/',
      steps: [
        {action: 'annotate', kind: 'box', text: 'nope'},
      ],
    })).toThrow(/annotate requires anchor.*x.*y/);
  });
});
