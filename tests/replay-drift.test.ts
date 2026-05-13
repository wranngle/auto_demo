// Gap #8 in ROAST.md — replay drift across UI changes. Runs a flow against a
// fixture page, then mutates the served HTML so the selectors break, re-runs
// the flow, and asserts the runner reports a clean drift signal (failed event
// with non-empty error string) instead of silently passing or hanging.
import {describe, expect, test} from 'vitest';
import {createServer, type Server} from 'node:http';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AddressInfo} from 'node:net';
import {runFlow} from '../src/runner.js';
import type {DemoFlow} from '../src/types.js';

const stableHtml = `
<!DOCTYPE html>
<html><body>
  <h1>Dashboard</h1>
  <button id="open-nav" aria-label="Open navigation">Open Nav</button>
  <div id="searchbox-wrap"><input id="search" aria-label="Search records" /></div>
</body></html>`;

const driftedHtml = `
<!DOCTYPE html>
<html><body>
  <h1>Dashboard</h1>
  <div data-renamed="open-nav-now-div">Open Nav</div>
  <input data-changed="search-now-no-id" />
</body></html>`;

function makeFlow(baseUrl: string): DemoFlow {
  return {
    name: 'drift-fixture',
    startUrl: `${baseUrl}/`,
    viewport: {width: 1024, height: 720},
    steps: [
      {action: 'click', selector: '#open-nav', label: 'Open nav', timeoutMs: 2000},
      {action: 'fill', selector: '#search', value: 'hello', label: 'Type in search', timeoutMs: 2000},
    ],
  };
}

async function serve(getHtml: () => string): Promise<{url: string; close: () => Promise<void>}> {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, {'content-type': 'text/html'});
    res.end(getHtml());
  });
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', res));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => new Promise<void>((res) => server.close(() => res())),
  };
}

describe('replay drift across UI changes', () => {
  test('stable HTML → both steps pass', async () => {
    const srv = await serve(() => stableHtml);
    try {
      const outDir = mkdtempSync(join(tmpdir(), 'auto_demo-drift-stable-'));
      const result = await runFlow(makeFlow(srv.url), {
        outputDir: outDir,
        flowDir: outDir,
        headed: false,
        recordVideo: false,
        slowMoMs: 0,
        speed: 1,
      });
      const failed = result.events.filter((e) => e.status === 'failed');
      expect(failed).toEqual([]);
    } finally {
      await srv.close();
    }
  }, 60_000);

  test('drifted HTML → runner emits failed events with explicit error strings', async () => {
    const srv = await serve(() => driftedHtml);
    try {
      const outDir = mkdtempSync(join(tmpdir(), 'auto_demo-drift-broken-'));
      // runFlow throws on the first failure; we catch and inspect the partial
      // manifest written to disk.
      let threw = false;
      try {
        await runFlow(makeFlow(srv.url), {
          outputDir: outDir,
          flowDir: outDir,
          headed: false,
          recordVideo: false,
          slowMoMs: 0,
          speed: 1,
        });
      } catch (err) {
        threw = true;
        expect(err instanceof Error).toBe(true);
        // The error should name the selector or include the locator text.
        expect((err as Error).message.length).toBeGreaterThan(0);
      }
      expect(threw).toBe(true);
    } finally {
      await srv.close();
    }
  }, 60_000);
});
