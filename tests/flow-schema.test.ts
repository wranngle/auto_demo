import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, test} from 'vitest';
import {loadFlow, validateFlow} from '../src/flow-schema.js';

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

  // The action-enum guard (src/flow-schema.ts:137-139) catches the most
  // common authoring typo class — a misspelled action name. The error names
  // every valid action so the user knows what to pick. Locks the enum so
  // adding a new action without updating isDemoAction fails CI.
  test('rejects a step with an unknown action name', () => {
    expect(() => validateFlow({
      startUrl: './fixtures/smoke.html',
      steps: [{action: 'klick', selector: '#nav'}],
    })).toThrow(/action must be one of/v);
  });

  // Per-action required-field guards (src/flow-schema.ts:157-186). Each
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

  // loadFlow() is the file-IO entry point (src/flow-schema.ts:51-69). When
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
});
