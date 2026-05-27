import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
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

  // Previously this test claimed to exercise the `fixturePath` override but
  // instantiated the client with no options — proving only that the DEFAULT
  // fixture loads. Now actually writes a custom fixture and asserts the
  // override is honored end-to-end.
  test('mock LLM client honors an override fixture path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ui-demo-from-url-fixture-'));
    const fixturePath = join(dir, 'custom.json');
    await writeFile(fixturePath, JSON.stringify({
      name: 'override-marker-script',
      steps: [
        {selector: '#override-marker', action: 'click', narration: 'override step'},
      ],
    }));

    const client = createMockLlmClient({fixturePath});
    const result = await client.generateScript({url: 'https://example.com', goal: 'g'});

    expect(result.name).toBe('override-marker-script');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]!.selector).toBe('#override-marker');
    expect(result.steps[0]!.narration).toBe('override step');
  });
});
