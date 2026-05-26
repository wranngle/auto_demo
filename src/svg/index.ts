import {execFile} from 'node:child_process';
import {existsSync} from 'node:fs';
import {
  mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

export type SvgOptions = {
  fixturePath: string;
  outputPath: string;
  frameCount?: number;
  width?: number;
  frameDurationMs?: number;
  jpegQuality?: number;
};

export type SvgResult = {
  outputPath: string;
  frameCount: number;
  width: number;
  height: number;
  byteSize: number;
  totalDurationMs: number;
};

const MAX_BYTES = 200 * 1024;

export async function renderAnimatedSvg(options: SvgOptions): Promise<SvgResult> {
  const fixturePath = resolve(options.fixturePath);
  const outputPath = resolve(options.outputPath);

  if (!existsSync(fixturePath)) {
    throw new Error(`Fixture video not found: ${fixturePath}`);
  }

  const frameCount = options.frameCount ?? 8;
  const width = options.width ?? 320;
  const frameDurationMs = options.frameDurationMs ?? 150;
  const jpegQuality = options.jpegQuality ?? 6;

  if (!Number.isInteger(frameCount) || frameCount < 2 || frameCount > 60) {
    throw new Error(`frameCount must be an integer in [2, 60], received ${frameCount}`);
  }

  await mkdir(dirname(outputPath), {recursive: true});
  const workDir = await mkdtemp(join(tmpdir(), 'ui-demo-svg-'));
  const durationSeconds = await probeDurationSeconds(fixturePath);
  const sampleFps = Math.max(0.1, frameCount / Math.max(0.25, durationSeconds));

  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      fixturePath,
      '-vf',
      `fps=${sampleFps.toFixed(4)},scale=${width}:-2`,
      '-frames:v',
      String(frameCount),
      '-q:v',
      String(jpegQuality),
      join(workDir, 'frame-%03d.jpg'),
    ]);

    const frameFiles = (await readdir(workDir))
      .filter(name => name.startsWith('frame-') && name.endsWith('.jpg'))
      .sort()
      .slice(0, frameCount);

    if (frameFiles.length < 2) {
      throw new Error(`ffmpeg produced ${frameFiles.length} frames; need at least 2 to animate`);
    }

    const frames = await Promise.all(frameFiles.map(async name => (await readFile(join(workDir, name))).toString('base64')));

    const {height} = await probeFirstFrameDimensions(join(workDir, frameFiles[0]!));
    const totalDurationMs = frameDurationMs * frames.length;
    const svg = buildSvg({
      frames, width, height, frameDurationMs, totalDurationMs,
    });

    await writeFile(outputPath, svg, 'utf8');
    const byteSize = (await stat(outputPath)).size;

    if (byteSize > MAX_BYTES) {
      throw new Error(`Animated SVG is ${byteSize} bytes; budget is ${MAX_BYTES}. Reduce --frames, --width, or --jpeg-quality.`);
    }

    return {
      outputPath,
      frameCount: frames.length,
      width,
      height,
      byteSize,
      totalDurationMs,
    };
  } finally {
    await rm(workDir, {recursive: true, force: true});
  }
}

type BuildSvgInput = {
  frames: string[];
  width: number;
  height: number;
  frameDurationMs: number;
  totalDurationMs: number;
};

function buildSvg({frames, width, height, frameDurationMs, totalDurationMs}: BuildSvgInput): string {
  const totalSeconds = (totalDurationMs / 1000).toFixed(3);
  const slice = 1 / frames.length;
  const layers = frames.map((data, index) => {
    const keyTimes = [0, index * slice, (index + 1) * slice, 1]
      .map(value => value.toFixed(4))
      .join(';');
    const values = index === 0
      ? '1;1;0;0'
      : (index === frames.length - 1
        ? '0;0;1;1'
        : '0;1;0;0');
    return [
      `  <image x="0" y="0" width="${width}" height="${height}" opacity="${index === 0 ? 1 : 0}" `,
      `href="data:image/jpeg;base64,${data}">`,
      `<animate attributeName="opacity" values="${values}" keyTimes="${keyTimes}" `,
      `dur="${totalSeconds}s" repeatCount="indefinite" calcMode="discrete" /></image>`,
    ].join('');
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" `,
    `width="${width}" height="${height}" role="img" aria-label="ui-demo-runner animated preview" `,
    `data-frame-duration-ms="${frameDurationMs}">`,
    layers,
    '</svg>',
    '',
  ].join('\n');
}

async function probeDurationSeconds(mediaPath: string): Promise<number> {
  const {stdout} = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    mediaPath,
  ]);
  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`ffprobe could not determine duration of ${mediaPath}`);
  }

  return seconds;
}

async function probeFirstFrameDimensions(framePath: string): Promise<{width: number; height: number}> {
  const {stdout} = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0',
    framePath,
  ]);
  const [widthRaw, heightRaw] = stdout.trim().split(',');
  const width = Number.parseInt(widthRaw ?? '', 10);
  const height = Number.parseInt(heightRaw ?? '', 10);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`ffprobe could not read dimensions of ${framePath}`);
  }

  return {width, height};
}

export const __test__ = {buildSvg, MAX_BYTES};
