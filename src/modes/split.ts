import {execFile} from 'node:child_process';
import {mkdir, writeFile, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {promisify} from 'node:util';
import {loadFlow} from '../flow-schema.js';
import type {DemoStep} from '../types.js';

const execFileAsync = promisify(execFile);

const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;
const PANEL_WIDTH = OUTPUT_WIDTH / 2;
const PANEL_HEIGHT = OUTPUT_HEIGHT;
const FRAME_RATE = 30;

export type SplitOptions = {
  flowPath: string;
  recordingPath: string;
  outputPath: string;
  workDir?: string;
};

export type SplitResult = {
  outputPath: string;
  width: number;
  height: number;
  durationMs: number;
  stepCount: number;
};

export async function renderSplit(options: SplitOptions): Promise<SplitResult> {
  const flowPath = resolve(options.flowPath);
  const recordingPath = resolve(options.recordingPath);
  const outputPath = resolve(options.outputPath);

  if (!existsSync(recordingPath)) {
    throw new Error(`Recording not found: ${recordingPath}`);
  }

  const {flow} = await loadFlow(flowPath);
  const recordingDurationMs = await probeDurationMs(recordingPath);

  const workDir = resolve(options.workDir ?? join(dirname(outputPath), '.ui-demo-runner-split'));
  await rm(workDir, {recursive: true, force: true});
  await mkdir(workDir, {recursive: true});

  const stepCount = flow.steps.length;
  const recordingDurationSec = recordingDurationMs / 1000;
  const stepDurationSec = recordingDurationSec / stepCount;
  const concatLines: string[] = [];
  const framePaths: string[] = [];

  for (let i = 0; i < stepCount; i++) {
    const svg = renderPanelSvg(flow.steps, i, flow.name ?? 'Demo');
    const svgPath = join(workDir, `panel-${String(i).padStart(4, '0')}.svg`);
    await writeFile(svgPath, svg, 'utf8');
    framePaths.push(svgPath);
    concatLines.push(`file '${svgPath}'`, `duration ${stepDurationSec.toFixed(4)}`);
  }

  if (framePaths.length > 0) {
    concatLines.push(`file '${framePaths[framePaths.length - 1]}'`);
  }

  const concatPath = join(workDir, 'concat.txt');
  await writeFile(concatPath, concatLines.join('\n'), 'utf8');

  const panelVideoPath = join(workDir, 'panel.mp4');
  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatPath,
    '-t', recordingDurationSec.toFixed(4),
    '-r', String(FRAME_RATE),
    '-vf', `scale=${PANEL_WIDTH}:${PANEL_HEIGHT}:flags=lanczos,format=yuv420p`,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    panelVideoPath,
  ]);

  await execFileAsync('ffmpeg', [
    '-y',
    '-i', panelVideoPath,
    '-i', recordingPath,
    '-filter_complex',
    `[1:v]scale=${PANEL_WIDTH}:${PANEL_HEIGHT}:force_original_aspect_ratio=decrease,pad=${PANEL_WIDTH}:${PANEL_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=0x0b0d12,setsar=1[right];` +
    `[0:v]setsar=1[left];` +
    `[left][right]hstack=inputs=2[v]`,
    '-map', '[v]',
    '-r', String(FRAME_RATE),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', '20',
    '-preset', 'veryfast',
    '-movflags', '+faststart',
    outputPath,
  ]);

  const finalDurationMs = await probeDurationMs(outputPath);
  const {width, height} = await probeDimensions(outputPath);

  return {
    outputPath,
    width,
    height,
    durationMs: finalDurationMs,
    stepCount,
  };
}

function renderPanelSvg(steps: DemoStep[], activeIndex: number, title: string): string {
  const headerHeight = 80;
  const rowHeight = 56;
  const rowGap = 6;
  const padX = 56;
  const escape = (raw: string): string => raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const rows = steps.map((step, index) => {
    const y = headerHeight + 40 + index * (rowHeight + rowGap);
    const isActive = index === activeIndex;
    const isPast = index < activeIndex;
    const bg = isActive ? '#ff5f00' : (isPast ? '#1a2238' : '#11141c');
    const stroke = isActive ? '#ffb066' : '#2a3247';
    const textColor = isActive ? '#0b0d12' : (isPast ? '#7d8aa8' : '#e6ecff');
    const label = describeStep(step, index);
    return `  <g transform="translate(${padX} ${y})">
    <rect width="${PANEL_WIDTH - padX * 2}" height="${rowHeight}" rx="10" ry="10" fill="${bg}" stroke="${stroke}" stroke-width="1.5"/>
    <text x="22" y="36" font-family="DejaVu Sans Mono, monospace" font-size="22" fill="${textColor}">${escape(label)}</text>
  </g>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PANEL_WIDTH}" height="${PANEL_HEIGHT}" viewBox="0 0 ${PANEL_WIDTH} ${PANEL_HEIGHT}">
  <rect width="${PANEL_WIDTH}" height="${PANEL_HEIGHT}" fill="#0b0d12"/>
  <text x="${padX}" y="64" font-family="DejaVu Sans, sans-serif" font-size="32" font-weight="700" fill="#ffffff">${escape(title)}</text>
  <text x="${padX}" y="98" font-family="DejaVu Sans Mono, monospace" font-size="18" fill="#7d8aa8">Step ${activeIndex + 1} of ${steps.length}</text>
${rows}
</svg>`;
}

function describeStep(step: DemoStep, index: number): string {
  const n = String(index + 1).padStart(2, '0');
  const tag = step.label ?? step.action;
  const detail = step.selector ?? step.url ?? step.text ?? step.value ?? step.key ?? '';
  const detailShort = detail.length > 48 ? detail.slice(0, 45) + '...' : detail;
  return detailShort.length === 0 ? `${n}. ${tag}` : `${n}. ${tag} — ${detailShort}`;
}

async function probeDurationMs(mediaPath: string): Promise<number> {
  const {stdout} = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    mediaPath,
  ]);
  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`Unable to probe duration for ${mediaPath}`);
  }

  return Math.round(seconds * 1000);
}

async function probeDimensions(mediaPath: string): Promise<{width: number; height: number}> {
  const {stdout} = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0',
    mediaPath,
  ]);
  const [widthStr, heightStr] = stdout.trim().split(',');
  const width = Number.parseInt(widthStr ?? '', 10);
  const height = Number.parseInt(heightStr ?? '', 10);
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error(`Unable to probe dimensions for ${mediaPath}`);
  }

  return {width, height};
}
