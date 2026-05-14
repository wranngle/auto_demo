#!/usr/bin/env node
import {resolve} from 'node:path';
import process from 'node:process';
import {Command, Option} from 'commander';
import {loadFlow} from './flow-schema.js';
import {runFlow} from './runner.js';
import {parseLanguages, type CaptionLanguage} from './captions/srt.js';

const program = new Command();

program
  .name('ui-demo-runner')
  .description('Record browser UI demos from deterministic flow files.')
  .version('0.1.0');

program
  .command('run')
  .argument('<flow>', 'Path to a .demo.json flow file')
  .option('-o, --output <dir>', 'Directory for video, screenshots, and manifest', 'output/demo')
  .option('--base-url <url>', 'Base URL for relative flow URLs')
  .option('--headed', 'Show the browser while recording')
  .option('--no-video', 'Disable Playwright video capture')
  .option('--slow-mo <ms>', 'Delay Playwright actions for human-readable demos', parseInteger, 0)
  .option('--speed <factor>', 'Scale demo waits and cursor motion; 1.5 is faster, 0.75 is slower', parseSpeed, 1)
  .option('--captions-lang <codes>', 'Comma-separated SRT export languages (en,es,pt,fr)', parseLanguages)
  .addOption(new Option('--json', 'Print the run result as JSON').default(false))
  .action(async (flowPath: string, options: {
    output: string;
    baseUrl?: string;
    headed?: boolean;
    video: boolean;
    slowMo: number;
    speed: number;
    captionsLang?: CaptionLanguage[];
    json: boolean;
  }) => {
    try {
      const loaded = await loadFlow(flowPath);
      const runOptions = {
        outputDir: resolve(options.output),
        flowDir: loaded.sourceDir,
        headed: options.headed ?? false,
        recordVideo: options.video,
        slowMoMs: options.slowMo,
        speed: options.speed,
        ...(options.captionsLang === undefined ? {} : {captionsLang: options.captionsLang}),
      };

      const result = await runFlow(loaded.flow, options.baseUrl === undefined
        ? runOptions
        : {
          ...runOptions,
          baseUrl: options.baseUrl,
        });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Recorded ${result.flowName}`);
        console.log(`Manifest: ${result.manifestPath}`);
        if (result.videoPath !== undefined) {
          console.log(`Video: ${result.videoPath}`);
        }

        if (result.captionPaths !== undefined) {
          for (const path of result.captionPaths) {
            console.log(`Captions: ${path}`);
          }
        }
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative integer, received ${value}`);
  }

  return parsed;
}

function parseSpeed(value: string): number {
  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 8) {
    throw new Error(`Expected speed > 0 and <= 8, received ${value}`);
  }

  return parsed;
}
