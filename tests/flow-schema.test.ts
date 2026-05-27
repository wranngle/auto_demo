import {describe, expect, test} from 'vitest';
import {validateFlow} from '../src/flow-schema.js';

describe('validateFlow', () => {
  test('accepts a minimal useful demo flow', () => {
    const flow = validateFlow({
      startUrl: './fixtures/smoke.html',
      steps: [
        {
          action: 'waitForText',
          text: 'Pipeline Console',
        },
        {
          action: 'click',
          selector: '#nav-opportunities',
        },
      ],
    });

    expect(flow.steps).toHaveLength(2);
  });

  test('rejects click steps without selectors', () => {
    expect(() => validateFlow({
      startUrl: './fixtures/smoke.html',
      steps: [
        {
          action: 'click',
        },
      ],
    })).toThrow(/click requires selector/v);
  });

  test('rejects tiny viewports that make recordings unusable', () => {
    expect(() => validateFlow({
      startUrl: './fixtures/smoke.html',
      viewport: {
        width: 200,
        height: 120,
      },
      steps: [
        {
          action: 'pause',
          ms: 1,
        },
      ],
    })).toThrow(/viewport\.width/v);
  });

  test('requires zoom steps to provide a numeric scale', () => {
    expect(() => validateFlow({
      startUrl: './fixtures/smoke.html',
      steps: [
        {
          action: 'zoom',
        },
      ],
    })).toThrow(/zoom requires scale/v);
  });

  test('accepts portfolio polish and timing controls', () => {
    const flow = validateFlow({
      startUrl: './fixtures/smoke.html',
      timing: {
        speed: 1.4,
        moveMs: 180,
      },
      polish: {
        cursor: {
          style: 'modern',
          accentColor: '#ff5f00',
        },
        actionRail: {
          enabled: true,
        },
        captions: {
          enabled: true,
          position: 'bottom',
        },
        zoom: {
          defaultScale: 1.08,
          durationMs: 420,
        },
      },
      steps: [
        {
          action: 'caption',
          text: 'Open on proof, not a title slide.',
        },
        {
          action: 'focus',
          selector: '#nav-opportunities',
          scale: 1.06,
        },
        {
          action: 'resetZoom',
        },
      ],
    });

    expect(flow.polish?.cursor?.style).toBe('modern');
    expect(flow.timing?.speed).toBe(1.4);
    expect(flow.steps).toHaveLength(3);
  });

  test('rejects unsupported cursor styles', () => {
    expect(() => validateFlow({
      startUrl: './fixtures/smoke.html',
      polish: {
        cursor: {
          style: 'sparkle',
        },
      },
      steps: [
        {
          action: 'pause',
          ms: 1,
        },
      ],
    })).toThrow(/cursor\.style/v);
  });

  // Central-promise contract: a flow with zero steps is a no-op. The runner
  // would still spin up Playwright, navigate to startUrl, and write a
  // manifest — burning seconds for nothing. The validator rejects it before
  // any side effects. (src/flow-schema.ts:90-92)
  test('rejects a flow with zero steps', () => {
    expect(() => validateFlow({
      startUrl: './fixtures/smoke.html',
      steps: [],
    })).toThrow(/steps must contain at least one action/v);
  });
});
