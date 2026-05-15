import type {CaptionLanguage} from './captions/srt.js';

export type DemoAction
  = | 'goto'
    | 'click'
    | 'caption'
    | 'fill'
    | 'focus'
    | 'hover'
    | 'press'
    | 'resetZoom'
    | 'screenshot'
    | 'scroll'
    | 'pause'
    | 'zoom'
    | 'waitForSelector'
    | 'waitForText';

export type ViewportSize = {
  width: number;
  height: number;
};

export type DemoStep = {
  action: DemoAction;
  label?: string;
  selector?: string;
  text?: string;
  value?: string;
  url?: string;
  key?: string;
  name?: string;
  ms?: number;
  x?: number;
  y?: number;
  scale?: number;
  durationMs?: number;
  holdMs?: number;
  timeoutMs?: number;
  fullPage?: boolean;
};

export type DemoTiming = {
  speed?: number;
  moveMs?: number;
  clickPauseMs?: number;
  fillPauseMs?: number;
  pressPauseMs?: number;
  scrollPauseMs?: number;
  zoomMs?: number;
};

export type DemoPolish = {
  cursor?: {
    style?: 'modern' | 'classic' | 'none';
    accentColor?: string;
    moveMs?: number;
    pulseMs?: number;
  };
  actionRail?: {
    enabled?: boolean;
  };
  captions?: {
    enabled?: boolean;
    position?: 'top' | 'bottom';
  };
  zoom?: {
    defaultScale?: number;
    durationMs?: number;
    resetMs?: number;
  };
};

export type DemoFlow = {
  name?: string;
  startUrl: string;
  viewport?: ViewportSize;
  record?: {
    enabled?: boolean;
    size?: ViewportSize;
  };
  timing?: DemoTiming;
  polish?: DemoPolish;
  metadata?: Record<string, unknown>;
  steps: DemoStep[];
};

export type LoadedFlow = {
  flow: DemoFlow;
  sourcePath: string;
  sourceDir: string;
};

export type RunOptions = {
  outputDir: string;
  flowDir: string;
  baseUrl?: string;
  headed: boolean;
  recordVideo: boolean;
  slowMoMs: number;
  speed: number;
  captionsLang?: readonly CaptionLanguage[];
};

export type StepEvent = {
  index: number;
  action: DemoAction;
  label?: string;
  startedAt: string;
  endedAt?: string;
  status: 'ok' | 'failed';
  error?: string;
  artifact?: string;
};

export type RunResult = {
  flowName: string;
  outputDir: string;
  manifestPath: string;
  videoPath?: string;
  captionPaths?: string[];
  events: StepEvent[];
};
