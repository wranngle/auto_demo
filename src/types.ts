export type DemoAction
  = | 'goto'
    | 'click'
    | 'fill'
    | 'hover'
    | 'press'
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
  timeoutMs?: number;
  fullPage?: boolean;
};

export type DemoFlow = {
  name?: string;
  startUrl: string;
  viewport?: ViewportSize;
  record?: {
    enabled?: boolean;
    size?: ViewportSize;
  };
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
  events: StepEvent[];
};
