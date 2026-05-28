import {execFile} from 'node:child_process';
import {stat, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

export type AspectRatio = '9:16';

const ASPECT_PRESETS: Record<AspectRatio, {width: number; height: number; ratio: number}> = {
  '9:16': {width: 1080, height: 1920, ratio: 9 / 16},
};

const KNOWN_ASPECTS = new Set<string>(Object.keys(ASPECT_PRESETS));

// Supported --fit modes. Imported by src/cli.ts as the choices() list so
// the runtime allowlist and the TS type union are driven by one source.
// Adding a mode here makes it instantly legal everywhere; README +
// CHANGELOG enumeration is locked by tests/vertical.test.ts.
export const FIT_MODES = ['crop', 'pad'] as const;
export type FitMode = (typeof FIT_MODES)[number];

export type VerticalOptions = {
  inputPath: string;
  outputPath: string;
  aspect: string;
  fit?: FitMode;
};

export type VerticalResult = {
  outputPath: string;
  aspect: AspectRatio;
  width: number;
  height: number;
  ratio: number;
  fit: FitMode;
  byteSize: number;
};

export async function renderVertical(options: VerticalOptions): Promise<VerticalResult> {
  if (!KNOWN_ASPECTS.has(options.aspect)) {
    throw new Error(`Unknown aspect "${options.aspect}". Valid: ${[...KNOWN_ASPECTS].join(', ')}`);
  }

  const aspect = options.aspect as AspectRatio;
  const preset = ASPECT_PRESETS[aspect];
  const inputPath = resolve(options.inputPath);
  const outputPath = resolve(options.outputPath);

  if (!existsSync(inputPath)) {
    throw new Error(`Input video not found: ${inputPath}`);
  }

  const fit = options.fit ?? 'crop';
  await mkdir(dirname(outputPath), {recursive: true});

  const filter = FILTER_BUILDERS[fit](preset.width, preset.height);

  await execFileAsync('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-vf', filter,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-movflags', '+faststart',
    '-an',
    outputPath,
  ]);

  const {width, height} = await probeDimensions(outputPath);
  const byteSize = (await stat(outputPath)).size;

  return {
    outputPath,
    aspect,
    width,
    height,
    ratio: width / height,
    fit,
    byteSize,
  };
}

function buildCropFilter(targetWidth: number, targetHeight: number): string {
  // Scale to cover the 9:16 target frame, then center-crop to exact dimensions.
  return [
    `scale=w='if(gt(a,${targetWidth}/${targetHeight}),-2,${targetWidth})':h='if(gt(a,${targetWidth}/${targetHeight}),${targetHeight},-2)'`,
    `crop=${targetWidth}:${targetHeight}`,
  ].join(',');
}

function buildPadFilter(targetWidth: number, targetHeight: number): string {
  // Scale to fit inside 9:16, then pad with black bars.
  return [
    `scale=w='if(gt(a,${targetWidth}/${targetHeight}),${targetWidth},-2)':h='if(gt(a,${targetWidth}/${targetHeight}),-2,${targetHeight})'`,
    `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black`,
  ].join(',');
}

// Eliminates the previous fit === 'crop' ? ... : ... ternary, which silently
// fell through to buildPadFilter for any non-crop mode. The Record<FitMode,
// ...> constraint forces TypeScript to error if FIT_MODES gains an entry
// without a matching builder.
type FilterBuilder = (targetWidth: number, targetHeight: number) => string;
const FILTER_BUILDERS: Record<FitMode, FilterBuilder> = {
  crop: buildCropFilter,
  pad: buildPadFilter,
};

async function probeDimensions(mediaPath: string): Promise<{width: number; height: number}> {
  const {stdout} = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0',
    mediaPath,
  ]);
  const [widthRaw, heightRaw] = stdout.trim().split(',');
  const width = Number.parseInt(widthRaw ?? '', 10);
  const height = Number.parseInt(heightRaw ?? '', 10);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`ffprobe could not determine dimensions for ${mediaPath}`);
  }

  return {width, height};
}

export const __test__ = {buildCropFilter, buildPadFilter, ASPECT_PRESETS, FILTER_BUILDERS};
