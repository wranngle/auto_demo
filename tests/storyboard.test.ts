// Unit contract for the storyboard manifest parser. tests/storyboard.bats
// covers the CLI end-to-end against a fixture run directory; this file pins
// the two reject paths in `parseManifest` (src/storyboard/index.ts):
// the manifest must be an object that carries an `events` array and a
// `flowName` string. Without these guards the downstream renderer would
// crash on `.events.map(...)` or emit a malformed table header.

import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, test} from 'vitest';
import {buildStoryboard, renderStoryboardMarkdown} from '../src/storyboard/index.js';

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

// RenderStoryboardMarkdown is a pure function (Storyboard → markdown string).
// storyboard.bats exercises the populated-table branch end-to-end against a
// fixture run directory; this block locks the empty-rows branch (the
// user-facing "no keyframes" message) and pipe-escaping behavior. Both are
// currently untested outside the integration path.
describe('renderStoryboardMarkdown', () => {
  test('empty rows produce a "no keyframes" message (not a malformed empty table)', () => {
    const md = renderStoryboardMarkdown({flowName: 'console-overview', runDir: '/tmp/x', rows: []});
    expect(md.startsWith('# Storyboard — console-overview\n')).toBe(true);
    expect(md).toContain('_No keyframe screenshots were captured in this run._');
    expect(md).not.toContain('|'); // No table header / separator row
  });

  test('non-empty rows render a 3-column table with one data row per keyframe', () => {
    const md = renderStoryboardMarkdown({
      flowName: 'demo',
      runDir: '/tmp/demo',
      rows: [
        {
          imagePath: '/tmp/demo/screenshots/a.png', imageRelative: 'screenshots/a.png', timestamp: '2026-05-14T00:00:00Z', narration: 'opener',
        },
        {
          imagePath: '/tmp/demo/screenshots/b.png', imageRelative: 'screenshots/b.png', timestamp: '2026-05-14T00:00:01Z', narration: 'close',
        },
      ],
    });
    expect(md).toContain('| # | Keyframe | Timestamp | Narration |');
    expect(md).toContain('| - | -------- | --------- | --------- |');
    expect(md).toContain('![opener](screenshots/a.png)');
    expect(md).toContain('![close](screenshots/b.png)');
    expect(md).toContain('| 1 |');
    expect(md).toContain('| 2 |');
  });

  test('pipe characters in narration / timestamp are escaped so the table stays parseable', () => {
    const md = renderStoryboardMarkdown({
      flowName: 'pipes',
      runDir: '/tmp/pipes',
      rows: [
        {
          imagePath: '/tmp/pipes/screenshots/a.png', imageRelative: 'screenshots/a.png', timestamp: '2026-05-14T00:00:00Z', narration: 'has | pipe',
        },
      ],
    });
    // Literal `|` inside narration must be escaped (markdown table cells can't contain `|`).
    expect(md).toContain(String.raw`has \| pipe`);
    expect(md).not.toContain(' has | pipe '); // Unescaped form should not appear in the data row
  });
});
