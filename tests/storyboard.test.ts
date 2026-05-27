// Unit contract for the storyboard manifest parser. tests/storyboard.bats
// covers the CLI end-to-end against a fixture run directory; this file pins
// the two reject paths in `parseManifest` (src/storyboard/index.ts:73-83):
// the manifest must be an object that carries an `events` array and a
// `flowName` string. Without these guards the downstream renderer would
// crash on `.events.map(...)` or emit a malformed table header.

import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, test} from 'vitest';
import {buildStoryboard} from '../src/storyboard/index.js';

describe('buildStoryboard parseManifest', () => {
  test.each([
    ['missing events array', '{"flowName": "x"}', /missing an "events" array/v],
    ['missing flowName field', '{"events": [], "flowName": 1}', /missing "flowName"/v],
    ['root is an array, not an object', '["not", "a", "manifest"]', /missing an "events" array/v],
  ])('rejects manifest: %s', async (_label, manifestBody, expected) => {
    const dir = await mkdtemp(join(tmpdir(), 'ui-demo-storyboard-bad-'));
    await writeFile(join(dir, 'manifest.json'), manifestBody);

    await expect(buildStoryboard(dir)).rejects.toThrow(expected);
  });
});
