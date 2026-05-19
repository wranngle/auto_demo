import {readFile, writeFile} from 'node:fs/promises';
import {basename, isAbsolute, join, relative} from 'node:path';
import type {RunResult, StepEvent} from '../types.js';

export type StoryboardRow = {
  imagePath: string;
  imageRelative: string;
  timestamp: string;
  narration: string;
};

export type Storyboard = {
  flowName: string;
  runDir: string;
  rows: StoryboardRow[];
};

export async function buildStoryboard(runDir: string): Promise<Storyboard> {
  const manifestPath = join(runDir, 'manifest.json');
  const raw = await readFile(manifestPath, 'utf8');
  const manifest = parseManifest(raw, manifestPath);
  const rows = manifest.events
    .filter(event => typeof event.artifact === 'string' && event.artifact.length > 0)
    .map((event): StoryboardRow => {
      const imagePath = event.artifact as string;
      const imageRelative = isAbsolute(imagePath)
        ? relative(runDir, imagePath) || basename(imagePath)
        : imagePath;
      return {
        imagePath,
        imageRelative,
        timestamp: event.startedAt,
        narration: narrationFor(event),
      };
    });

  return {
    flowName: manifest.flowName,
    runDir,
    rows,
  };
}

export function renderStoryboardMarkdown(storyboard: Storyboard): string {
  const header = `# Storyboard — ${storyboard.flowName}\n\n`;
  if (storyboard.rows.length === 0) {
    return `${header}_No keyframe screenshots were captured in this run._\n`;
  }

  const table = [
    '| # | Keyframe | Timestamp | Narration |',
    '| - | -------- | --------- | --------- |',
    ...storyboard.rows.map((row, index) => {
      const altText = escapePipes(row.narration || `Keyframe ${index + 1}`);
      const image = `![${altText}](${row.imageRelative})`;
      return `| ${index + 1} | ${image} | ${escapePipes(row.timestamp)} | ${escapePipes(row.narration)} |`;
    }),
  ].join('\n');

  return `${header}${table}\n`;
}

export async function writeStoryboard(runDir: string): Promise<{path: string; rowCount: number}> {
  const storyboard = await buildStoryboard(runDir);
  const markdown = renderStoryboardMarkdown(storyboard);
  const outputPath = join(runDir, 'storyboard.md');
  await writeFile(outputPath, markdown);
  return {path: outputPath, rowCount: storyboard.rows.length};
}

function parseManifest(raw: string, manifestPath: string): RunResult {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as RunResult).events)) {
    throw new Error(`Manifest at ${manifestPath} is missing an "events" array`);
  }

  const candidate = parsed as RunResult;
  if (typeof candidate.flowName !== 'string') {
    throw new Error(`Manifest at ${manifestPath} is missing "flowName"`);
  }

  return candidate;
}

function narrationFor(event: StepEvent): string {
  if (typeof event.label === 'string' && event.label.length > 0) {
    return event.label;
  }

  return `${event.action} (step ${event.index + 1})`;
}

function escapePipes(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}
