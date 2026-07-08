import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  afterAll, beforeAll, describe, expect, test,
} from 'vitest';
import {execFileAsync} from '../src/exec-file.js';
import {renderSplit} from '../src/modes/split.js';

const FIXTURE_DURATION_SEC = 3;
const FIXTURE_DURATION_MS = FIXTURE_DURATION_SEC * 1000;
const DURATION_TOLERANCE_MS = 200;

async function hasFfmpeg(): Promise<boolean> {
  try {
    await execFileAsync('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

const ffmpegAvailable = await hasFfmpeg();
const describeIfFfmpeg = ffmpegAvailable ? describe : describe.skip;

let workRoot = '';
let flowPath = '';
let recordingPath = '';

beforeAll(async () => {
  if (!ffmpegAvailable) {
    return;
  }

  workRoot = await mkdtemp(join(tmpdir(), 'ui-demo-split-test-'));
  flowPath = join(workRoot, 'flow.demo.json');
  recordingPath = join(workRoot, 'recording.mp4');

  const flow = {
    name: 'split-screen-fixture',
    startUrl: './fixtures/smoke.html',
    steps: [
      {action: 'goto', url: 'https://example.com', label: 'Open landing'},
      {action: 'click', selector: '#cta', label: 'Click CTA'},
      {
        action: 'fill', selector: '#email', value: 'demo@example.com', label: 'Fill email',
      },
      {action: 'caption', text: 'Confirmation appears'},
    ],
  };
  await writeFile(flowPath, JSON.stringify(flow, null, 2), 'utf8');

  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc=duration=${FIXTURE_DURATION_SEC}:size=1280x720:rate=30`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    recordingPath,
  ]);
}, 60_000);

afterAll(async () => {
  if (workRoot !== '') {
    await rm(workRoot, {recursive: true, force: true});
  }
});

describeIfFfmpeg('renderSplit', () => {
  test('produces a 1920x1080 split.mp4 with duration close to the input recording', async () => {
    const outputPath = join(workRoot, 'split.mp4');
    const result = await renderSplit({
      flowPath,
      recordingPath,
      outputPath,
      workDir: join(workRoot, 'work'),
    });

    expect(existsSync(outputPath)).toBe(true);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(Math.abs(result.durationMs - FIXTURE_DURATION_MS)).toBeLessThanOrEqual(DURATION_TOLERANCE_MS);
    expect(result.stepCount).toBe(4);

    const {stdout} = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-of',
      'csv=p=0',
      outputPath,
    ]);
    expect(stdout.trim()).toBe('1920,1080');
  }, 60_000);

  test('rejects missing recording paths early', async () => {
    await expect(renderSplit({
      flowPath,
      recordingPath: join(workRoot, 'does-not-exist.mp4'),
      outputPath: join(workRoot, 'never.mp4'),
    })).rejects.toThrow(/Recording not found/v);
  });
});
