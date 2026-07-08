#!/usr/bin/env node
import {writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import process from 'node:process';
import {Command, Option} from 'commander';
import {loadFlow} from './flow-schema.js';
import {DEFAULT_ELEVENLABS_VOICE_ID, renderNarration} from './modes/narrate.js';
import {renderSplit} from './modes/split.js';
import {FIT_MODES, renderVertical, type FitMode} from './modes/vertical.js';
import {parseQualityPreset, type QualitySpec} from './quality.js';
import {runFlow} from './runner.js';
import {parseLanguages, type CaptionLanguage} from './captions/srt.js';
import {generateScriptFromUrl} from './from-url/index.js';
import {renderNarrationScript} from './from-url/narration-script.js';
import {buildWidgetScenario} from './widget/index.js';
import {watchOnce} from './watch/index.js';
import {writeStoryboard} from './storyboard/index.js';
import {renderAnimatedSvg} from './svg/index.js';

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
  .option('--speed <factor>', 'Scale demo waits and cursor motion; 1.5 is faster, 0.75 is slower. When passed, overrides the flow\'s timing.speed.', parseSpeed)
  .option('--captions-lang <codes>', 'Comma-separated SRT export languages (en,es,pt,fr)', parseLanguages)
  .option('--quality <preset>', 'Video preset: 720p | 1080p | 4k (sets viewport + bitrate)', parseQualityPreset)
  .addOption(new Option('--json', 'Print the run result as JSON').default(false))
  .action(async (flowPath: string, options: {
    output: string;
    baseUrl?: string;
    headed?: boolean;
    video: boolean;
    slowMo: number;
    speed?: number;
    captionsLang?: CaptionLanguage[];
    quality?: QualitySpec;
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
        ...(options.speed === undefined ? {} : {speed: options.speed}),
        ...(options.captionsLang === undefined ? {} : {captionsLang: options.captionsLang}),
        ...(options.quality === undefined ? {} : {quality: options.quality}),
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

program
  .command('narrate')
  .description('Mux AI voice narration onto an existing recording (mock voice by default).')
  .requiredOption('--script <path>', 'Path to a narration script (start|duration|text per line)')
  .requiredOption('--in <video>', 'Input MP4 to add narration to')
  .requiredOption('--out <video>', 'Output MP4 with narration track')
  .option('--voice <id>', 'Voice id: "mock" (deterministic sine) or "elevenlabs"', 'mock')
  .option('--voice-id <elevenLabsVoiceId>', 'ElevenLabs voice to synthesize with (only with --voice elevenlabs)', DEFAULT_ELEVENLABS_VOICE_ID)
  .option('--work-dir <dir>', 'Scratch directory for intermediate WAV files')
  .addOption(new Option('--json', 'Print the result as JSON').default(false))
  .action(async (options: {
    script: string;
    in: string;
    out: string;
    voice: string;
    voiceId: string;
    workDir?: string;
    json: boolean;
  }) => {
    try {
      const result = await renderNarration({
        scriptPath: resolve(options.script),
        inputVideoPath: resolve(options.in),
        outputPath: resolve(options.out),
        voice: options.voice,
        voiceId: options.voiceId,
        ...(options.workDir === undefined ? {} : {workDir: resolve(options.workDir)}),
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Narrated video: ${result.outputPath}`);
        console.log(`Voice: ${result.voice} (${result.lineCount} lines)`);
        console.log(`Streams: ${result.videoStreams} video, ${result.audioStreams} audio`);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('split')
  .description('Render a 1920x1080 split-screen MP4 with the flow on the left and a recording on the right.')
  .argument('<flow>', 'Path to a .demo.json flow file')
  .argument('<recording>', 'Path to the recorded MP4')
  .option('-o, --output <file>', 'Output split.mp4 path', 'split.mp4')
  .option('--work-dir <dir>', 'Scratch directory for intermediate frames')
  .addOption(new Option('--json', 'Print the result as JSON').default(false))
  .action(async (flowPath: string, recordingPath: string, options: {
    output: string;
    workDir?: string;
    json: boolean;
  }) => {
    try {
      const result = await renderSplit({
        flowPath,
        recordingPath,
        outputPath: resolve(options.output),
        ...(options.workDir === undefined ? {} : {workDir: resolve(options.workDir)}),
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Split video: ${result.outputPath}`);
        console.log(`Dimensions: ${result.width}x${result.height}`);
        console.log(`Duration: ${result.durationMs}ms across ${result.stepCount} steps`);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('vertical')
  .description('Crop or pad an existing recording into a 9:16 vertical export (YouTube Shorts / TikTok).')
  .requiredOption('--in <video>', 'Input MP4 to convert')
  .requiredOption('--out <video>', 'Output MP4 path')
  .option('--aspect <ratio>', 'Target aspect ratio (only 9:16 is supported)', '9:16')
  .addOption(new Option('--fit <mode>', 'How to fit the source frame').choices([...FIT_MODES]).default('crop'))
  .addOption(new Option('--json', 'Print the result as JSON').default(false))
  .action(async (options: {
    in: string;
    out: string;
    aspect: string;
    fit: FitMode;
    json: boolean;
  }) => {
    try {
      const result = await renderVertical({
        inputPath: resolve(options.in),
        outputPath: resolve(options.out),
        aspect: options.aspect,
        fit: options.fit,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Vertical export: ${result.outputPath}`);
        console.log(`Dimensions: ${result.width}x${result.height} (${result.aspect}, fit=${result.fit})`);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('from-url')
  .description('Generate a deterministic demo script from a URL + goal using a mock LLM client.')
  .argument('<url>', 'Target URL the script should drive')
  .requiredOption('--goal <text>', 'Plain-English goal, e.g. "show how to add a credit card"')
  .option('-o, --out <path>', 'Write the script JSON to this path instead of stdout')
  .option('--narration-out <path>', 'Also write a narrate-compatible start|duration|text script built from the steps\' narration')
  .action(async (url: string, options: {goal: string; out?: string; narrationOut?: string}) => {
    try {
      const script = await generateScriptFromUrl({url, goal: options.goal});
      const serialized = JSON.stringify(script, null, 2);

      if (options.narrationOut !== undefined) {
        const narrationPath = resolve(options.narrationOut);
        await mkdir(dirname(narrationPath), {recursive: true});
        await writeFile(narrationPath, renderNarrationScript(script), 'utf8');
        console.log(`Wrote narration script to ${narrationPath}`);
      }

      if (options.out === undefined) {
        console.log(serialized);
        return;
      }

      const outPath = resolve(options.out);
      await mkdir(dirname(outPath), {recursive: true});
      await writeFile(outPath, `${serialized}\n`, 'utf8');
      console.log(`Wrote ${script.steps.length} steps to ${outPath}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('widget')
  .description('Compile an ElevenLabs widget chat scenario into a landing page + flow (live real agent or deterministic mock); --run records it.')
  .argument('<scenario>', 'Path to a *.scenario.json widget scenario file')
  .option('-d, --out-dir <dir>', 'Directory for the generated <name>.html + <name>.demo.json', 'output/widget')
  .option('--run', 'Record the scenario immediately after generating it')
  .option('-o, --output <dir>', 'Recording output dir (implies --run; defaults under --out-dir)')
  .option('--speed <factor>', 'Playback speed override for the recording run; when passed, wins over the generated flow\'s pinned timing.speed', parseSpeed)
  .option('--headed', 'Show the browser while recording')
  .addOption(new Option('--json', 'Print the result as JSON').default(false))
  .action(async (scenarioPath: string, options: {
    outDir: string;
    run?: boolean;
    output?: string;
    speed?: number;
    headed?: boolean;
    json: boolean;
  }) => {
    try {
      const result = await buildWidgetScenario({
        scenarioPath: resolve(scenarioPath),
        outDir: options.outDir,
        run: options.run === true || options.output !== undefined,
        headed: options.headed ?? false,
        ...(options.speed === undefined ? {} : {speed: options.speed}),
        ...(options.output === undefined ? {} : {output: resolve(options.output)}),
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`Widget page: ${result.htmlPath} (${result.mode === 'live' ? 'real ElevenLabs agent' : 'deterministic mock'})`);
      console.log(`Demo flow:   ${result.flowPath}`);
      console.log(`Scenario:    ${result.turnCount} turns, ${result.toolCount} tool calls`);
      if (result.recording === undefined) {
        console.log(`Record it:   node dist/cli.js run ${result.flowPath} --output output/${result.name}`);
      } else {
        console.log(`Manifest:    ${result.recording.manifestPath}`);
        if (result.recording.videoPath !== undefined) {
          console.log(`Video:       ${result.recording.videoPath}`);
        }
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('watch')
  .description('Detect UI changes and re-record. Single pass against two fixtures via --once.')
  .option('--once', 'Run a single comparison pass and exit (only mode wired today)')
  .option('--fixture <path>', 'Path to the previous DOM snapshot (HTML)')
  .option('--next <path>', 'Path to the next DOM snapshot (HTML)')
  .addOption(new Option('--json', 'Print the comparison result as JSON (suppresses the text sentinels)').default(false))
  .action(async (options: {once?: boolean; fixture?: string; next?: string; json: boolean}) => {
    if (options.once !== true) {
      console.error('watch: only --once mode is wired in this release; pass --once with --fixture and --next');
      process.exitCode = 2;
      return;
    }

    if (options.fixture === undefined || options.next === undefined) {
      console.error('watch: --fixture and --next are required with --once');
      process.exitCode = 2;
      return;
    }

    try {
      let rerunInvocations = 0;
      const result = await watchOnce({
        fixture: options.fixture,
        next: options.next,
        // JSON mode swallows the human sentinels (CHANGE_DETECTED / NO_CHANGE
        // / RERUN_INVOKED) so stdout stays a single parseable document.
        ...(options.json ? {logger: () => undefined} : {}),
        runner() {
          rerunInvocations += 1;
          if (!options.json) {
            console.log(`RERUN_INVOKED count=${rerunInvocations}`);
          }
        },
      });

      if (result.changed && rerunInvocations !== 1) {
        throw new Error(`watch: expected exactly one re-run invocation, got ${rerunInvocations}`);
      }

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('storyboard')
  .description('Render a markdown storyboard from a recorded run directory.')
  .argument('<runDir>', 'Directory containing manifest.json (e.g. out/run-<id>)')
  .addOption(new Option('--json', 'Print the result as JSON').default(false))
  .action(async (runDir: string, options: {json: boolean}) => {
    try {
      const resolved = resolve(runDir);
      const {path, rowCount} = await writeStoryboard(resolved);
      if (options.json) {
        console.log(JSON.stringify({path, rowCount}, null, 2));
      } else {
        console.log(`Storyboard: ${path} (${rowCount} keyframes)`);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('svg')
  .description('Export an animated SVG preview from an MP4 fixture (README-embed friendly).')
  .requiredOption('--fixture <video>', 'Input MP4 fixture to sample frames from')
  .requiredOption('--out <path>', 'Output SVG path')
  .option('--frames <count>', 'Number of frames to sample', parseInteger, 8)
  .option('--width <px>', 'Target frame width (height is preserved by aspect ratio)', parseInteger, 320)
  .option('--frame-duration-ms <ms>', 'Per-frame display duration in milliseconds', parseInteger, 150)
  .option('--jpeg-quality <q>', 'ffmpeg JPEG quality (2=best, 31=worst)', parseInteger, 6)
  .addOption(new Option('--json', 'Print the result as JSON').default(false))
  .action(async (options: {
    fixture: string;
    out: string;
    frames: number;
    width: number;
    frameDurationMs: number;
    jpegQuality: number;
    json: boolean;
  }) => {
    try {
      const result = await renderAnimatedSvg({
        fixturePath: resolve(options.fixture),
        outputPath: resolve(options.out),
        frameCount: options.frames,
        width: options.width,
        frameDurationMs: options.frameDurationMs,
        jpegQuality: options.jpegQuality,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Animated SVG: ${result.outputPath}`);
        console.log(`Frames: ${result.frameCount} @ ${result.width}x${result.height}`);
        console.log(`Size: ${result.byteSize} bytes / loop ${result.totalDurationMs}ms`);
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
