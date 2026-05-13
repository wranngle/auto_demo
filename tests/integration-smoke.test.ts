// End-to-end smoke: load + run the bundled local-smoke flow and verify the
// outputs are real artifacts. No mocks. If this passes, the deterministic
// `run` path is genuinely functional.
import {describe, expect, test} from 'vitest';
import {existsSync, readFileSync, mkdtempSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {loadFlow} from '../src/flow-schema.js';
import {runFlow} from '../src/runner.js';

const repoRoot = resolve(__dirname, '..');

describe('integration smoke', () => {
  test('auto_demo run examples/local-smoke.demo.json produces a real recording', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'auto_demo-smoke-'));
    const loaded = await loadFlow(resolve(repoRoot, 'examples', 'local-smoke.demo.json'));

    const result = await runFlow(loaded.flow, {
      outputDir,
      flowDir: loaded.sourceDir,
      headed: false,
      recordVideo: true,
      slowMoMs: 0,
      speed: 1,
    });

    expect(result.flowName).toBe('local-smoke');
    expect(existsSync(result.manifestPath)).toBe(true);
    expect(result.videoPath).toBeDefined();
    expect(existsSync(result.videoPath!)).toBe(true);

    const videoSize = statSync(result.videoPath!).size;
    expect(videoSize).toBeGreaterThan(50 * 1024);

    // Magic bytes for WebM (EBML header)
    const head = readFileSync(result.videoPath!).slice(0, 4).toString('hex');
    expect(head).toBe('1a45dfa3');

    // Manifest contract: every flow step appears as an event with start + end.
    const manifest = JSON.parse(readFileSync(result.manifestPath, 'utf8')) as {events: any[]};
    expect(manifest.events.length).toBe(loaded.flow.steps.length);
    for (const event of manifest.events) {
      expect(event.startedAt).toBeTypeOf('string');
      expect(event.endedAt).toBeTypeOf('string');
      expect(['ok', 'failed']).toContain(event.status);
    }
    // The smoke flow doesn't have selectors that should be missing — assert all green.
    const failed = manifest.events.filter((e: any) => e.status === 'failed');
    expect(failed).toEqual([]);

    // Screenshot step in the flow → file on disk.
    const shot = join(outputDir, 'screenshots', 'opportunity-review.png');
    expect(existsSync(shot)).toBe(true);
    expect(statSync(shot).size).toBeGreaterThan(10 * 1024);
  }, 60_000);
});
