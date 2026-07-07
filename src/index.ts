// Public library surface (package.json "exports"). The CLI (cli.ts) stays
// bin-only; `import {...} from 'ui-demo-runner'` for programmatic use.
// Everything here is re-exported deliberately — additions are API surface.

export {runFlow, formatEventNdjson} from './runner.js';
export {loadFlow, validateFlow, SUPPORTED_ACTIONS} from './flow-schema.js';
export {
  renderNarration,
  parseNarrationScript,
  SUPPORTED_VOICES,
  DEFAULT_ELEVENLABS_VOICE_ID,
} from './modes/narrate.js';
export type {NarrateOptions, NarrateResult, NarrationLine} from './modes/narrate.js';
export {renderSplit} from './modes/split.js';
export {renderVertical, FIT_MODES} from './modes/vertical.js';
export type {FitMode, VerticalOptions, VerticalResult} from './modes/vertical.js';
export {
  buildRegressReport,
  renderRegressMarkdown,
  writeRegressArtifacts,
} from './modes/regress.js';
export type {
  RegressFlowResult,
  RegressReport,
  WriteRegressArtifactsOptions,
  WriteRegressArtifactsResult,
} from './modes/regress.js';
export {generateScriptFromUrl, createMockLlmClient} from './from-url/index.js';
export type {FromUrlScript, FromUrlStep, LlmClient} from './from-url/index.js';
export {renderNarrationScript} from './from-url/narration-script.js';
export {watchOnce} from './watch/index.js';
export type {WatchOnceOptions, WatchOnceResult, WatchRunner} from './watch/index.js';
export {buildStoryboard, renderStoryboardMarkdown, writeStoryboard} from './storyboard/index.js';
export {renderAnimatedSvg} from './svg/index.js';
export type {SvgOptions, SvgResult} from './svg/index.js';
export {buildWidgetScenario} from './widget/index.js';
export {computeRetimeRatio, retimeRecordingToRealTime, buildRetimeArgs} from './retime.js';
export type {RetimeOutcome} from './retime.js';
export {QUALITY_PRESETS, parseQualityPreset} from './quality.js';
export type {QualityPreset, QualitySpec} from './quality.js';
export {parseLanguages, supportedLanguages, buildCaptionCues} from './captions/srt.js';
export type {CaptionLanguage} from './captions/srt.js';
export type {
  DemoAction,
  DemoFlow,
  DemoStep,
  DemoTiming,
  DemoPolish,
  LoadedFlow,
  RunOptions,
  RunResult,
  StepEvent,
  ViewportSize,
} from './types.js';
