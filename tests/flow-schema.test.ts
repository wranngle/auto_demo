import {mkdtemp, readdir, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';
import {describe, expect, test} from 'vitest';
import {loadFlow, validateFlow, SUPPORTED_ACTIONS} from '../src/flow-schema.js';

const repoRoot = resolve(dirname(fileURLToPath(new URL('.', import.meta.url))));

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
  // any side effects. (src/flow-schema.ts)
  test('rejects a flow with zero steps', () => {
    expect(() => validateFlow({
      startUrl: './fixtures/smoke.html',
      steps: [],
    })).toThrow(/steps must contain at least one action/v);
  });

  // The action-enum guard (src/flow-schema.ts) catches the most
  // common authoring typo class — a misspelled action name. The error names
  // every valid action so the user knows what to pick. Locks the enum so
  // adding a new action without updating isDemoAction fails CI.
  test('rejects a step with an unknown action name', () => {
    expect(() => validateFlow({
      startUrl: './fixtures/smoke.html',
      steps: [{action: 'klick', selector: '#nav'}],
    })).toThrow(/action must be one of/v);
  });

  // Per-action required-field guards (src/flow-schema.ts). Each
  // covers a different "user authored an incomplete step" failure mode.
  // The pre-existing tests covered `click requires selector` + `zoom
  // requires scale`. This block locks the remaining six in one sweep:
  // fill/value, goto/url, press/key, waitForText/text, caption/text,
  // pause/ms — plus the non-click branches of the shared selector guard
  // (focus, hover, waitForSelector).
  test.each([
    ['fill missing value', {action: 'fill', selector: '#email'}, /fill requires value/v],
    ['goto missing url', {action: 'goto'}, /goto requires url/v],
    ['press missing key', {action: 'press'}, /press requires key/v],
    ['waitForText missing text', {action: 'waitForText'}, /waitForText requires text/v],
    ['caption missing text', {action: 'caption'}, /caption requires text/v],
    ['pause missing ms', {action: 'pause'}, /pause requires ms/v],
    ['focus missing selector', {action: 'focus'}, /focus requires selector/v],
    ['hover missing selector', {action: 'hover'}, /hover requires selector/v],
    ['waitForSelector missing selector', {action: 'waitForSelector'}, /waitForSelector requires selector/v],
  ])('rejects step: %s', (_label, step, expected) => {
    expect(() => validateFlow({
      startUrl: './fixtures/smoke.html',
      steps: [step],
    })).toThrow(expected);
  });

  // optionalTiming enforces playback speed > 0 and <= 8 (src/flow-schema.ts).
  // Below 0 is nonsensical; above 8x the recording is unwatchable. Locks both
  // bound branches so a refactor that flips the operator or drops the range
  // fails CI.
  test('rejects timing.speed outside (0, 8]', () => {
    expect(() => validateFlow({
      startUrl: './fixtures/smoke.html',
      timing: {speed: 0},
      steps: [{action: 'pause', ms: 1}],
    })).toThrow(/timing\.speed/v);
    expect(() => validateFlow({
      startUrl: './fixtures/smoke.html',
      timing: {speed: 9},
      steps: [{action: 'pause', ms: 1}],
    })).toThrow(/timing\.speed/v);
  });

  // Top-level arktype reject (src/flow-schema.ts). When the input
  // doesn't match the type shape — non-object root, missing startUrl, or
  // missing steps — the validator throws a TypeError prefixed with
  // `Invalid <label>:`. This is the catch-all that runs before any of the
  // per-field validators below; without it a malformed flow would crash
  // deeper code paths with confusing errors. Locks two distinct ways to
  // miss the shape (non-object, missing required field).
  test('rejects non-object inputs at the arktype layer', () => {
    expect(() => validateFlow('not an object')).toThrow(/Invalid flow/v);
    expect(() => validateFlow({steps: [{action: 'pause', ms: 1}]})).toThrow(/Invalid flow/v);
  });

  // optionalCaptions enforces polish.captions.position is "top" or "bottom"
  // (src/flow-schema.ts via assertChoice). The "rejects unsupported
  // cursor styles" test above covers the cursor.style branch of the same
  // assertChoice helper; this covers the captions.position branch.
  test('rejects polish.captions.position outside top|bottom', () => {
    expect(() => validateFlow({
      startUrl: './fixtures/smoke.html',
      polish: {captions: {enabled: true, position: 'middle'}},
      steps: [{action: 'pause', ms: 1}],
    })).toThrow(/captions\.position/v);
  });

  // optionalZoom enforces polish.zoom.defaultScale > 0 and <= 2
  // (src/flow-schema.ts). Below 0 is nonsense; above 2x the
  // viewport's content overflows the visible frame. Same pattern as the
  // speed bound test above.
  test('rejects polish.zoom.defaultScale outside (0, 2]', () => {
    expect(() => validateFlow({
      startUrl: './fixtures/smoke.html',
      polish: {zoom: {defaultScale: 0}},
      steps: [{action: 'pause', ms: 1}],
    })).toThrow(/zoom\.defaultScale/v);
    expect(() => validateFlow({
      startUrl: './fixtures/smoke.html',
      polish: {zoom: {defaultScale: 3}},
      steps: [{action: 'pause', ms: 1}],
    })).toThrow(/zoom\.defaultScale/v);
  });

  // loadFlow() is the file-IO entry point (src/flow-schema.ts). When
  // JSON.parse fails on the file contents, it wraps the cause with a helpful
  // error naming the absolute source path. Mirrors the loadScenario malformed-
  // JSON test from PR #56 — same pattern, complementary coverage. A refactor
  // that swallowed the catch, dropped the path, or stripped the cause would
  // slip past CI.
  test('loadFlow surfaces malformed JSON with the file path in the error message', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ui-demo-flow-malformed-'));
    const path = join(dir, 'broken.demo.json');
    await writeFile(path, '{ "startUrl": "./x.html", steps:');

    await expect(loadFlow(path)).rejects.toThrow(/Invalid JSON in.*broken\.demo\.json/v);
  });

  // Doctrine drift coupling: every *.demo.json shipped in examples/ MUST
  // validate against the production schema. The widget scenarios get the
  // analogous guard in tests/widget.test.ts; this is its flow-side twin.
  // A consumer who edits an example by hand (or a refactor that tightens
  // schema rules without updating the examples) now fails CI loudly.
  test('every shipped examples/**/*.demo.json validates against the production schema', async () => {
    const examplesDir = join(repoRoot, 'examples');
    const candidates: string[] = [];
    for (const entry of await readdir(examplesDir, {withFileTypes: true, recursive: true})) {
      if (entry.isFile() && entry.name.endsWith('.demo.json')) {
        candidates.push(join(entry.parentPath ?? examplesDir, entry.name));
      }
    }

    expect(candidates.length, 'expected at least one *.demo.json under examples/').toBeGreaterThan(0);

    for (const path of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const raw = await readFile(path, 'utf8');
      const flow = JSON.parse(raw) as unknown;
      expect(() => validateFlow(flow, path), `${path} must pass production validation`).not.toThrow();
    }
  });

  // Doctrine drift: README's "## Modes" section enumerates every supported
  // DemoAction as a bulleted ``- `<action>`: …`` list. SUPPORTED_ACTIONS is
  // the source of truth — validators reject anything else, and mock-llm
  // shares the same constant by import. Without this coupling, adding a
  // new action (or removing one) silently desyncs the README until a
  // reader notices the gap.
  test('doctrine drift: README "Modes" bullets enumerate exactly the runtime actions allowlist', async () => {
    const readme = await readFile(resolve(repoRoot, 'README.md'), 'utf8');
    const modesSection = /## Modes\n([\s\S]*?)(?=\n## )/u.exec(readme);
    expect(modesSection, 'README must contain a "## Modes" section').not.toBeNull();

    const bullets = [...modesSection![1]!.matchAll(/^-\s+`([^`]+)`:/gmu)].map(match => match[1]!);
    expect(bullets.length, 'README "## Modes" must list at least one action').toBeGreaterThan(0);

    expect(new Set(bullets), `README Modes lists ${bullets.join(', ')}; schema allows ${[...SUPPORTED_ACTIONS].join(', ')}`)
      .toEqual(new Set(SUPPORTED_ACTIONS));
  });
});
