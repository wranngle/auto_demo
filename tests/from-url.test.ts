import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';
import {describe, expect, test} from 'vitest';
import {createMockLlmClient, generateScriptFromUrl} from '../src/from-url/index.js';

const repoRoot = resolve(dirname(fileURLToPath(new URL('.', import.meta.url))));

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

  // Doctrine drift: the "5-step" claim for the from-url mock fixture lives
  // in three docs (this test's own name, the README narrative, the
  // CHANGELOG entry). The actual step count comes from
  // fixtures/from-url-mock-response.json. If a 6th step is appended to
  // the fixture, the existing length assertion above catches the test,
  // but README + CHANGELOG silently say "5-step" until a reader notices.
  // Couple the fixture's step count to both docs' "N-step" prose.
  test('doctrine drift: README + CHANGELOG "<N>-step" claims match the from-url fixture step count', async () => {
    const fixture = JSON.parse(await readFile(
      resolve(repoRoot, 'fixtures', 'from-url-mock-response.json'),
      'utf8',
    )) as {steps: unknown[]};
    const actualSteps = fixture.steps.length;
    expect(actualSteps, 'fixture must declare at least one step').toBeGreaterThan(0);

    const stepPhrase = /deterministic\s+(\d+)-step/gu;
    for (const docFile of ['README.md', 'CHANGELOG.md']) {
      // eslint-disable-next-line no-await-in-loop
      const body = await readFile(resolve(repoRoot, docFile), 'utf8');
      const matches = [...body.matchAll(stepPhrase)];
      expect(matches.length, `${docFile} must contain a "deterministic <N>-step" phrase`).toBeGreaterThan(0);
      for (const match of matches) {
        expect(Number(match[1]), `${docFile} claims ${match[1]}-step; fixture has ${actualSteps}`).toBe(actualSteps);
      }
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

  // Mock-LLM fixture validation reject paths (src/from-url/mock-llm.ts).
  // Locks the six "malformed fixture" failure modes in one parametric block so
  // a refactor that loosens type guards (e.g. accepts empty narration, drops
  // the DemoAction allowlist) fails CI. The mock backs every from-url test
  // run and any consumer offline tests, so its parser contract matters.
  test.each([
    ['root is an array', '["not an object"]', /expected object/v],
    ['steps is missing', '{"name": "x"}', /steps must be an array/v],
    ['steps element is not an object', '{"steps": ["bare"]}', /expected object/v],
    ['step missing selector', '{"steps": [{"action": "click", "narration": "n"}]}', /selector must be a non-empty string/v],
    ['step has unknown action', '{"steps": [{"selector": "#x", "action": "fart", "narration": "n"}]}', /action must be a DemoAction/v],
    ['step missing narration', '{"steps": [{"selector": "#x", "action": "click"}]}', /narration must be a non-empty string/v],
  ])('mock LLM rejects malformed fixture: %s', async (_label, body, expected) => {
    const dir = await mkdtemp(join(tmpdir(), 'ui-demo-from-url-malformed-'));
    const fixturePath = join(dir, 'bad.json');
    await writeFile(fixturePath, body);

    const client = createMockLlmClient({fixturePath});
    await expect(client.generateScript({url: 'https://example.com', goal: 'g'})).rejects.toThrow(expected);
  });
});
