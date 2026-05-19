import {describe, expect, test} from 'vitest';
import {createMockLlmClient, generateScriptFromUrl} from '../src/from-url/index.js';

describe('generateScriptFromUrl', () => {
  test('returns a 5-step script with selector, action, narration on every step', async () => {
    const script = await generateScriptFromUrl({
      url: 'https://example.com/billing',
      goal: 'show how to add a credit card',
    });

    expect(script.startUrl).toBe('https://example.com/billing');
    expect(script.goal).toBe('show how to add a credit card');
    expect(script.steps).toHaveLength(5);

    for (const step of script.steps) {
      expect(typeof step.selector).toBe('string');
      expect(step.selector.length).toBeGreaterThan(0);
      expect(typeof step.action).toBe('string');
      expect(step.action.length).toBeGreaterThan(0);
      expect(typeof step.narration).toBe('string');
      expect(step.narration.length).toBeGreaterThan(0);
    }
  });

  test('is deterministic across two invocations', async () => {
    const first = await generateScriptFromUrl({url: 'https://example.com/x', goal: 'g'});
    const second = await generateScriptFromUrl({url: 'https://example.com/x', goal: 'g'});
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  test('rejects empty url', async () => {
    await expect(generateScriptFromUrl({url: '', goal: 'g'})).rejects.toThrow(/url/v);
  });

  test('rejects empty goal', async () => {
    await expect(generateScriptFromUrl({url: 'https://example.com', goal: ''})).rejects.toThrow(/goal/v);
  });

  test('mock LLM client honors an override fixture path', async () => {
    const client = createMockLlmClient();
    const result = await client.generateScript({url: 'https://example.com', goal: 'g'});
    expect(result.steps).toHaveLength(5);
    const firstStep = result.steps[0];
    expect(firstStep).toBeDefined();
    expect(firstStep!.selector).toContain('nav-billing');
  });
});
