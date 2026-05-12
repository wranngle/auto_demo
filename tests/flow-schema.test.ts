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
});
