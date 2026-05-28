import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createServer, type Server} from 'node:http';
import {
  extname, join, normalize, resolve,
} from 'node:path';
import {runFlow} from '../runner.js';
import {loadScenario} from './scenario.js';
import {buildDemoFlow, countTools, renderWidgetPage} from './render.js';
import type {WidgetBuildResult} from './types.js';

const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
};

export type BuildWidgetOptions = {
  scenarioPath: string;
  outDir: string;
  run?: boolean;
  output?: string;
  speed?: number;
  headed?: boolean;
};

export async function buildWidgetScenario(options: BuildWidgetOptions): Promise<WidgetBuildResult> {
  const {scenario} = await loadScenario(options.scenarioPath);
  const outDir = resolve(options.outDir);
  await mkdir(outDir, {recursive: true});

  const slug = slugify(scenario.name);
  const htmlFileName = `${slug}.html`;
  const flowFileName = `${slug}.demo.json`;
  const htmlPath = join(outDir, htmlFileName);
  const flowPath = join(outDir, flowFileName);
  const flow = buildDemoFlow(scenario, htmlFileName);

  await writeFile(htmlPath, renderWidgetPage(scenario), 'utf8');
  await writeFile(flowPath, `${JSON.stringify(flow, null, 2)}\n`, 'utf8');

  const isLive = scenario.live !== undefined;
  const result: WidgetBuildResult = {
    name: scenario.name,
    mode: isLive ? 'live' : 'mock',
    htmlPath,
    flowPath,
    turnCount: scenario.turns.length,
    toolCount: countTools(scenario),
  };

  if (options.run === true) {
    const recordingDir = resolve(options.output ?? join(outDir, `${slug}-recording`));
    // The real widget loads from a CDN and connects to ElevenLabs from the page
    // origin, so live mode must be served over HTTP (a file:// origin is rejected).
    // Mock mode is fully self-contained and runs straight off the filesystem.
    const server = isLive ? await serveDir(outDir) : undefined;
    try {
      const runResult = await runFlow(flow, {
        outputDir: recordingDir,
        flowDir: outDir,
        headed: options.headed ?? false,
        recordVideo: true,
        slowMoMs: 0,
        speed: options.speed ?? 1,
        ...(server === undefined ? {} : {baseUrl: `http://127.0.0.1:${server.port}/`}),
      });

      // Real-time playback correction is now done inside runFlow itself
      // (src/retime.ts) so the generic `run` CLI gets it too — no widget-side
      // duplication.

      result.recording = {
        manifestPath: runResult.manifestPath,
        ...(runResult.videoPath === undefined ? {} : {videoPath: runResult.videoPath}),
      };
    } finally {
      server?.close();
    }
  }

  return result;
}

// Pure resolver split out of serveDir so the path-traversal boundary can be
// unit-tested without standing up an HTTP server. Returns the normalized
// relative path the server would read, plus a `safe` flag — false means
// the request must be rejected with 403 because the URL would resolve
// outside the served root (e.g. `/../etc/passwd`, `/%2e%2e/foo`).
export function resolveServePath(rawUrl: string | undefined): {relPath: string; safe: boolean} {
  const rel = decodeURIComponent((rawUrl ?? '/').split('?')[0] ?? '/');
  const relPath = normalize(rel.endsWith('/') ? `${rel}index.html` : rel);
  return {relPath, safe: !relPath.includes('..')};
}

async function serveDir(root: string): Promise<{port: number; close: () => void}> {
  const server: Server = createServer(async (request, response) => {
    try {
      const {relPath, safe} = resolveServePath(request.url);
      if (!safe) {
        response.writeHead(403);
        response.end('forbidden');
        return;
      }

      const body = await readFile(join(root, relPath));
      response.writeHead(200, {'content-type': mimeTypes[extname(relPath)] ?? 'application/octet-stream'});
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('not found');
    }
  });

  return new Promise(resolvePromise => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      resolvePromise({port, close: () => server.close()});
    });
  });
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z\d]+/gv, '-')
    .replaceAll(/^-|-$/gv, '')
    .slice(0, 80) || 'widget-scenario';
}

export {
  buildDemoFlow, renderWidgetPage, countTools, lastSay,
} from './render.js';
export {loadScenario, validateScenario} from './scenario.js';
export {WIDGET_SELECTORS} from './selectors.js';
export type {WidgetScenario, WidgetBuildResult} from './types.js';
