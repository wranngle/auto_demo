#!/usr/bin/env node
import {resolve} from 'node:path';
import process from 'node:process';
import {Command, Option} from 'commander';
import {loadFlow} from './flow-schema.js';
import {runFlow} from './runner.js';
import {captureCommand, BACKGROUND_PRESETS} from './commands/capture.js';
import {authorCommand} from './commands/author.js';

const program = new Command();

program
  .name('auto-demo')
  .description('Record browser UI demos: deterministic JSON flows or AI-driven capture.')
  .version('0.2.0');

program
  .command('run')
  .description('Replay a deterministic .demo.json flow.')
  .argument('<flow>', 'Path to a .demo.json flow file')
  .option('-o, --output <dir>', 'Directory for video, screenshots, and manifest', 'output/demo')
  .option('--base-url <url>', 'Base URL for relative flow URLs')
  .option('--headed', 'Show the browser while recording')
  .option('--no-video', 'Disable Playwright video capture')
  .option('--slow-mo <ms>', 'Delay Playwright actions for human-readable demos', parseInteger, 0)
  .option('--speed <factor>', 'Scale demo waits and cursor motion; 1.5 is faster, 0.75 is slower', parseSpeed, 1)
  .addOption(new Option('--json', 'Print the run result as JSON').default(false))
  .action(async (flowPath: string, options: {
    output: string;
    baseUrl?: string;
    headed?: boolean;
    video: boolean;
    slowMo: number;
    speed: number;
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
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('capture')
  .description('Drive the page with an AI agent and produce a polished video. Uses ~/.claude OAuth bearer when available.')
  .argument('<url>', 'Starting URL')
  .requiredOption('-p, --prompt <text>', 'Instructions for the AI agent')
  .option('-o, --output <dir>', 'Directory for video, events, and metadata', '.work/auto-demo-capture')
  .option('--viewport <WxH>', 'Viewport size', '1280x720')
  .option('-m, --model <model>', 'Claude model', 'claude-haiku-4-5-20251001')
  .option('--max-steps <n>', 'Max agent iterations', parseInteger, 24)
  .option('--slow-mo <ms>', 'Extra delay between actions', parseInteger, 150)
  .option('--headed', 'Show the browser window')
  .addOption(new Option('--background <name>', 'Composed-video background').choices(['none', ...BACKGROUND_PRESETS]).default('ember'))
  .option('--padding <percent>', 'Background padding percentage', parseInteger, 8)
  .option('--corner-radius <px>', 'Video corner radius', parseInteger, 12)
  .option('--no-shadow', 'Disable drop shadow on composed video')
  .option('-v, --verbose', 'Verbose logging')
  .action(async (url: string, options: {
    prompt: string;
    output: string;
    viewport: string;
    model: string;
    maxSteps: number;
    slowMo: number;
    headed?: boolean;
    background: string;
    padding: number;
    cornerRadius: number;
    shadow: boolean;
    verbose?: boolean;
  }) => {
    try {
      await captureCommand({
        url,
        prompt: options.prompt,
        output: options.output,
        viewport: parseViewport(options.viewport),
        model: options.model,
        maxSteps: options.maxSteps,
        slowMoMs: options.slowMo,
        headless: !options.headed,
        background: options.background as any,
        padding: options.padding,
        cornerRadius: options.cornerRadius,
        shadow: options.shadow,
        verbose: options.verbose ?? false,
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('author')
  .description('Capture a demo with the agent and emit a deterministic .demo.json that can be replayed for free.')
  .argument('<url>', 'Starting URL')
  .requiredOption('-p, --prompt <text>', 'Instructions for the AI agent')
  .option('-o, --output <dir>', 'Directory for video, events, and flow', '.work/auto-demo-author')
  .option('--flow-out <path>', 'Explicit path for the emitted flow.demo.json')
  .option('--flow-name <name>', 'Name to embed in the emitted flow')
  .option('--viewport <WxH>', 'Viewport size', '1280x720')
  .option('-m, --model <model>', 'Claude model', 'claude-haiku-4-5-20251001')
  .option('--max-steps <n>', 'Max agent iterations', parseInteger, 24)
  .option('--slow-mo <ms>', 'Extra delay between actions', parseInteger, 150)
  .option('--headed', 'Show the browser window')
  .addOption(new Option('--background <name>', 'Composed-video background').choices(['none', ...BACKGROUND_PRESETS]).default('ember'))
  .option('--padding <percent>', 'Background padding percentage', parseInteger, 8)
  .option('--corner-radius <px>', 'Video corner radius', parseInteger, 12)
  .option('--no-shadow', 'Disable drop shadow on composed video')
  .option('-v, --verbose', 'Verbose logging')
  .action(async (url: string, options: {
    prompt: string;
    output: string;
    flowOut?: string;
    flowName?: string;
    viewport: string;
    model: string;
    maxSteps: number;
    slowMo: number;
    headed?: boolean;
    background: string;
    padding: number;
    cornerRadius: number;
    shadow: boolean;
    verbose?: boolean;
  }) => {
    try {
      await authorCommand({
        url,
        prompt: options.prompt,
        output: options.output,
        flowOut: options.flowOut,
        flowName: options.flowName,
        viewport: parseViewport(options.viewport),
        model: options.model,
        maxSteps: options.maxSteps,
        slowMoMs: options.slowMo,
        headless: !options.headed,
        background: options.background as any,
        padding: options.padding,
        cornerRadius: options.cornerRadius,
        shadow: options.shadow,
        verbose: options.verbose ?? false,
      });
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

function parseViewport(value: string): {width: number; height: number} {
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) {
    throw new Error(`Invalid viewport "${value}" — expected format WxH e.g. 1280x720`);
  }
  return {width: Number.parseInt(match[1]!, 10), height: Number.parseInt(match[2]!, 10)};
}
