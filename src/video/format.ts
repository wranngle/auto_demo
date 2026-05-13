// Output-format conversions for capture/author: GIF, multiple aspect ratios,
// optional logo overlay. Built on the composed.mp4 the existing pipeline
// produces — adds nothing to the agent loop, just re-encodes.
import {basename, dirname, join} from 'node:path';
import {runFFmpeg} from './ffmpeg.js';

export type OutputFormat = 'mp4' | 'webm' | 'gif';
export type AspectRatio = '16:9' | '1:1' | '9:16';

const ASPECT_DIMENSIONS: Record<AspectRatio, {width: number; height: number}> = {
  '16:9': {width: 1280, height: 720},
  '1:1': {width: 720, height: 720},
  '9:16': {width: 720, height: 1280},
};

export interface ConvertOptions {
  input: string;
  format: OutputFormat;
  aspect?: AspectRatio;
  logoPath?: string;
}

export async function convertVideo(opts: ConvertOptions): Promise<string> {
  const dir = dirname(opts.input);
  const stem = basename(opts.input).replace(/\.[^.]+$/, '');
  const target = opts.aspect ? ASPECT_DIMENSIONS[opts.aspect] : undefined;

  // Build a single filter graph: [aspect-crop] → [logo-overlay] → format-specific.
  const filters: string[] = [];
  let chain = '[0:v]';

  if (target) {
    // Scale to fit + center-crop to exact target. Preserves the most content.
    filters.push(
      `${chain}scale=${target.width}:${target.height}:force_original_aspect_ratio=increase,crop=${target.width}:${target.height}[aspect]`,
    );
    chain = '[aspect]';
  }

  let extraInputs: string[] | undefined;
  if (opts.logoPath) {
    extraInputs = [opts.logoPath];
    // Resize logo to ~12% of width, position in bottom-right with 24px inset.
    filters.push(`[1:v]scale=iw*0.5:-1[logo_scaled]`);
    filters.push(`${chain}[logo_scaled]overlay=W-w-24:H-h-24[branded]`);
    chain = '[branded]';
  }

  if (opts.format === 'gif') {
    // GIF needs a two-stage palette generation embedded as a chained filter.
    filters.push(`${chain}split[gif_a][gif_b];[gif_a]palettegen=stats_mode=diff[pal];[gif_b][pal]paletteuse=dither=sierra2_4a[out]`);
    const output = join(dir, `${stem}.gif`);
    await runFFmpeg({
      input: opts.input,
      ...(extraInputs ? {extraInputs} : {}),
      output,
      filterComplex: filters.join(';'),
      outputArgs: ['-map', '[out]', '-loop', '0'],
    });
    return output;
  }

  // For mp4/webm: if no transforms requested, just copy.
  if (filters.length === 0) {
    const output = join(dir, `${stem}.${opts.format}`);
    if (output === opts.input) return output;
    await runFFmpeg({
      input: opts.input,
      output,
      outputArgs: opts.format === 'webm'
        ? ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32']
        : ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p'],
    });
    return output;
  }

  // Filters present — wrap final tag.
  const lastSemi = filters[filters.length - 1]!.lastIndexOf('[');
  const lastTag = filters[filters.length - 1]!.slice(lastSemi);
  const mapTag = lastTag.startsWith('[') ? lastTag : chain;
  const ext = opts.format;
  const output = join(dir, `${stem}.${ext}`);
  await runFFmpeg({
    input: opts.input,
    ...(extraInputs ? {extraInputs} : {}),
    output,
    filterComplex: filters.join(';'),
    outputArgs: [
      '-map', mapTag,
      ...(ext === 'webm'
        ? ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32']
        : ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p']),
    ],
  });
  return output;
}

export const OUTPUT_FORMATS: OutputFormat[] = ['mp4', 'webm', 'gif'];
export const ASPECT_RATIOS: AspectRatio[] = ['16:9', '1:1', '9:16'];

/**
 * Parse a comma-separated `--format` or `--aspect` value into a list, validating
 * each entry against the known set. Empty input → empty array.
 */
export function parseFormatList(input: string | undefined): OutputFormat[] {
  if (input === undefined || input.trim() === '') return [];
  const parts = input.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  for (const p of parts) {
    if (!OUTPUT_FORMATS.includes(p as OutputFormat)) {
      throw new Error(`Invalid --format value "${p}". Allowed: ${OUTPUT_FORMATS.join(', ')}`);
    }
  }
  return [...new Set(parts as OutputFormat[])];
}

export function parseAspectList(input: string | undefined): AspectRatio[] {
  if (input === undefined || input.trim() === '') return [];
  const parts = input.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  for (const p of parts) {
    if (!ASPECT_RATIOS.includes(p as AspectRatio)) {
      throw new Error(`Invalid --aspect value "${p}". Allowed: ${ASPECT_RATIOS.join(', ')}`);
    }
  }
  return [...new Set(parts as AspectRatio[])];
}

export interface MatrixConvertOptions {
  input: string;
  formats: OutputFormat[];
  aspects: AspectRatio[];
  logoPath?: string;
}

/**
 * Run convertVideo for every (format × aspect) combination. Returns the full
 * list of written paths in stable order. When `aspects` is empty, runs once per
 * format with no aspect crop.
 */
export async function convertMatrix(opts: MatrixConvertOptions): Promise<string[]> {
  const aspects: (AspectRatio | undefined)[] = opts.aspects.length > 0 ? opts.aspects : [undefined];
  const formats: OutputFormat[] = opts.formats.length > 0 ? opts.formats : ['mp4'];
  const written: string[] = [];
  for (const format of formats) {
    for (const aspect of aspects) {
      const out = await convertVideo({
        input: opts.input,
        format,
        ...(aspect ? {aspect} : {}),
        ...(opts.logoPath ? {logoPath: opts.logoPath} : {}),
      });
      written.push(out);
    }
  }
  return written;
}
