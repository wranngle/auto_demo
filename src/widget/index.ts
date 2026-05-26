import {mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {createServer, type Server} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {
  extname, join, normalize, resolve,
} from 'node:path';
import {runFlow} from '../runner.js';
import type {RunResult} from '../types.js';
import {loadScenario} from './scenario.js';
import {buildDemoFlow, countTools, renderWidgetPage} from './render.js';
import type {WidgetBuildResult} from './types.js';

const execFileAsync = promisify(execFile);

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

      if (runResult.videoPath !== undefined) {
        await retimeToRealTime(runResult.videoPath, runResult.events);
      }

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

// Playwright captures ~75 fps of real frames over the session but tags the webm
// stream as 25 fps, so players stretch playback ~3x — every action looks slow.
// Re-time the video so its duration matches the real wall-clock of the run
// (first step start → last step end), using ffmpeg setpts. No-op if ffmpeg is
// missing or the ratio is already ~1 (nothing to correct).
async function retimeToRealTime(videoPath: string, events: RunResult['events']): Promise<void> {
  if (events.length < 2) {
    return;
  }

  const start = Date.parse(events[0]!.startedAt);
  const endStamp = events.at(-1)!.endedAt ?? events.at(-1)!.startedAt;
  const wallClockSec = (Date.parse(endStamp) - start) / 1000;
  if (!Number.isFinite(wallClockSec) || wallClockSec <= 0) {
    return;
  }

  const containerSec = await probeDurationSec(videoPath);
  if (containerSec === undefined || containerSec <= 0) {
    return;
  }

  const ratio = wallClockSec / containerSec;
  if (ratio > 0.9) {
    return; // already ~real-time; nothing to correct
  }

  const tmp = `${videoPath}.retime.webm`;
  try {
    await execFileAsync('ffmpeg', [
      '-y', '-i', videoPath,
      '-filter:v', `setpts=${ratio.toFixed(6)}*PTS`,
      '-an', tmp,
    ]);
    await rename(tmp, videoPath);
  } catch {
    await rm(tmp, {force: true}).catch(() => undefined);
  }
}

async function probeDurationSec(videoPath: string): Promise<number | undefined> {
  try {
    const {stdout} = await execFileAsync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoPath,
    ]);
    const value = Number.parseFloat(stdout.trim());
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

async function serveDir(root: string): Promise<{port: number; close: () => void}> {
  const server: Server = createServer(async (request, response) => {
    try {
      const rel = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
      const relPath = normalize(rel.endsWith('/') ? `${rel}index.html` : rel);
      if (relPath.includes('..')) {
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
