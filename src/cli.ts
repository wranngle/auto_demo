#!/usr/bin/env node
import {resolve} from 'node:path';
import process from 'node:process';
import {Command, Option} from 'commander';
import {loadFlow} from './flow-schema.js';
import {runFlow} from './runner.js';
import {captureCommand, BACKGROUND_PRESETS, EXPLORE_DEFAULT_PROMPT} from './commands/capture.js';
import {authorCommand} from './commands/author.js';
import {buildEmbedSnippet} from './commands/embed.js';
import {OUTPUT_FORMATS, ASPECT_RATIOS, parseFormatList, parseAspectList} from './video/format.js';
import {parseInteger, parseSpeed, parseViewport} from './cli-parsers.js';
import {stitchVideos} from './commands/stitch.js';
import {watchCommand} from './commands/watch.js';
import {judgeRecording} from './commands/judge.js';
import {runRegression} from './commands/regress.js';

const program = new Command();

program
  .name('auto_demo')
  .description('Record browser UI demos: deterministic JSON flows or AI-driven capture.')
  .version('0.3.0');

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

function addCaptureOptions<T extends Command>(cmd: T): T {
  return cmd
    .option('-p, --prompt <text>', `Instructions for the AI agent (default: --explore tour prompt)`)
    .option('--explore', 'Use the default "tour this UI" prompt — skip writing one')
    .option('-o, --output <dir>', 'Directory for video, events, and metadata', '.work/auto_demo-capture')
    .option('--viewport <WxH>', 'Viewport size', '1280x720')
    .option('-m, --model <model>', 'Claude model', 'claude-haiku-4-5-20251001')
    .option('--max-steps <n>', 'Max agent iterations', parseInteger, 24)
    .option('--slow-mo <ms>', 'Extra delay between actions', parseInteger, 150)
    .option('--headed', 'Show the browser window')
    .addOption(new Option('--background <name>', 'Composed-video background').choices(['none', ...BACKGROUND_PRESETS]).default('ember'))
    .option('--padding <percent>', 'Background padding percentage', parseInteger, 8)
    .option('--corner-radius <px>', 'Video corner radius', parseInteger, 12)
    .option('--no-shadow', 'Disable drop shadow on composed video')
    .option('--format <name[,name...]>', `Output format(s) — single or comma-separated. Allowed: ${OUTPUT_FORMATS.join(', ')}`)
    .option('--aspect <ratio[,ratio...]>', `Aspect ratio(s) — single or comma-separated. Allowed: ${ASPECT_RATIOS.join(', ')}`)
    .option('--logo <path>', 'Path to a logo PNG to overlay (bottom-right)')
    .option('--auth-state <path>', 'Playwright storageState JSON for protected apps')
    .option('--skip-preflight', 'Skip the HTTP reachability probe before launching the browser')
    .addOption(new Option('--tts <provider>', 'Synthesize voiceover from narrate events').choices(['none', 'flite', 'elevenlabs', 'openai']).default('none'))
    .option('-v, --verbose', 'Verbose logging') as T;
}

function resolveFormats(input: string | undefined) {
  return parseFormatList(input);
}

function resolveAspects(input: string | undefined) {
  return parseAspectList(input);
}

function resolvePrompt(opts: {prompt?: string; explore?: boolean}): string {
  if (opts.prompt) return opts.prompt;
  if (opts.explore) return EXPLORE_DEFAULT_PROMPT;
  return EXPLORE_DEFAULT_PROMPT;
}

addCaptureOptions(
  program
    .command('capture')
    .description('Drive the page with an AI agent and produce a polished video. Uses ~/.claude OAuth bearer when available. Omit --prompt to run an exploratory tour.')
    .argument('<url>', 'Starting URL'),
)
  .action(async (url: string, options: any) => {
    try {
      const formats = resolveFormats(options.format);
      const aspects = resolveAspects(options.aspect);
      await captureCommand({
        url,
        prompt: resolvePrompt(options),
        output: options.output,
        viewport: parseViewport(options.viewport),
        model: options.model,
        maxSteps: options.maxSteps,
        slowMoMs: options.slowMo,
        headless: !options.headed,
        background: options.background,
        padding: options.padding,
        cornerRadius: options.cornerRadius,
        shadow: options.shadow,
        verbose: options.verbose ?? false,
        formats,
        aspects,
        logoPath: options.logo,
        authStatePath: options.authState,
        skipPreflight: options.skipPreflight ?? false,
        tts: options.tts,
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

addCaptureOptions(
  program
    .command('author')
    .description('Capture a demo with the agent and emit a deterministic .demo.json. Omit --prompt to run an exploratory tour.')
    .argument('<url>', 'Starting URL')
    .option('--flow-out <path>', 'Explicit path for the emitted flow.demo.json')
    .option('--flow-name <name>', 'Name to embed in the emitted flow'),
)
  .action(async (url: string, options: any) => {
    try {
      const formats = resolveFormats(options.format);
      const aspects = resolveAspects(options.aspect);
      await authorCommand({
        url,
        prompt: resolvePrompt(options),
        output: options.output,
        flowOut: options.flowOut,
        flowName: options.flowName,
        viewport: parseViewport(options.viewport),
        model: options.model,
        maxSteps: options.maxSteps,
        slowMoMs: options.slowMo,
        headless: !options.headed,
        background: options.background,
        padding: options.padding,
        cornerRadius: options.cornerRadius,
        shadow: options.shadow,
        verbose: options.verbose ?? false,
        formats,
        aspects,
        logoPath: options.logo,
        authStatePath: options.authState,
        skipPreflight: options.skipPreflight ?? false,
        tts: options.tts,
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('stitch')
  .description('Concatenate two or more recordings into a single video.')
  .argument('<inputs...>', 'Recording directories (each must contain a composed.mp4 / composed.webm / recording.webm)')
  .option('-o, --output <path>', 'Output mp4 path', '.work/auto_demo-stitched.mp4')
  .option('--fade <seconds>', 'Cross-fade duration between clips (0 = hard cut)', parseSpeed, 0)
  .option('--reencode', 'Force re-encode (concat-demuxer copy is the default)')
  .action(async (inputs: string[], options: {output: string; fade: number; reencode?: boolean}) => {
    try {
      const result = await stitchVideos({
        inputs,
        output: resolve(options.output),
        fadeS: options.fade,
        reencode: options.reencode ?? false,
      });
      console.log(`stitched: ${result.output}`);
      for (const seg of result.segments) console.log(`  + ${seg.video} (${seg.duration_s.toFixed(1)}s)`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('watch')
  .description('Re-run a flow whenever its file changes. Reports selector regressions between runs.')
  .argument('<flow>', 'Path to a .demo.json flow file')
  .option('-o, --output <dir>', 'Base output directory for re-runs', '.work/auto_demo-watch')
  .option('--base-url <url>', 'Base URL for relative flow URLs')
  .option('--headed', 'Show the browser window')
  .option('--debounce <ms>', 'Debounce window for file events', parseInteger, 500)
  .option('--once', 'Run once and exit (used by tests)')
  .action(async (flow: string, options: {output: string; baseUrl?: string; headed?: boolean; debounce: number; once?: boolean}) => {
    try {
      const result = await watchCommand({
        flowPath: flow,
        outputBase: resolve(options.output),
        ...(options.baseUrl ? {baseUrl: options.baseUrl} : {}),
        headed: options.headed ?? false,
        debounceMs: options.debounce,
        once: options.once ?? false,
      });
      console.log(`watch: ${result.runs} run(s) completed.`);
      if (result.lastReport && result.lastReport.totalRegressions > 0) {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('judge')
  .description('Score a finished recording (covers_prompt + aesthetic) via Claude vision.')
  .argument('<recordingDir>', 'A recording directory written by capture/author')
  .option('-m, --model <model>', 'Claude model', 'claude-haiku-4-5-20251001')
  .action(async (recordingDir: string, options: {model: string}) => {
    try {
      const score = await judgeRecording({recordingDir, model: options.model});
      console.log(JSON.stringify(score, null, 2));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('regress')
  .description('Re-run a list of flows; report selector quality and pass rate (CI guardrail).')
  .argument('<flows...>', 'flow.demo.json files to regress-test')
  .option('--threshold <ratio>', 'Selector-quality threshold (0..1)', parseSpeed, 0.75)
  .option('--score-only', 'Skip running flows — score selectors only')
  .option('--report <path>', 'Write a JSON report to this path')
  .option('--base-url <url>', 'Base URL applied to relative flow URLs')
  .action(async (flows: string[], options: {threshold: number; scoreOnly?: boolean; report?: string; baseUrl?: string}) => {
    try {
      const report = await runRegression({
        flows,
        threshold: options.threshold,
        scoreOnly: options.scoreOnly ?? false,
        ...(options.report ? {outputPath: resolve(options.report)} : {}),
        ...(options.baseUrl ? {baseUrl: options.baseUrl} : {}),
      });
      console.log(JSON.stringify(report, null, 2));
      if (!report.passed) process.exitCode = 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('embed')
  .description('Print README-ready markdown + HTML snippets to embed a recording.')
  .argument('<recordingDir>', 'A recording directory written by capture/author/run')
  .option('--relative-to <dir>', 'Make video/poster paths relative to this directory (e.g. the repo root)')
  .option('--title <text>', 'Override the embed title')
  .action((recordingDir: string, options: {relativeTo?: string; title?: string}) => {
    try {
      const result = buildEmbedSnippet({
        recordingDir,
        ...(options.relativeTo ? {relativeTo: options.relativeTo} : {}),
        ...(options.title ? {title: options.title} : {}),
      });
      console.log('## Markdown');
      console.log(result.markdown);
      console.log('');
      console.log('## HTML');
      console.log(result.htmlFallback);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);
