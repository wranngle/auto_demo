import {mkdir, copyFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
  chromium,
  type BrowserContextOptions,
  type Locator,
  type Page,
} from 'playwright';
import {
  clearCaption,
  installOverlay,
  moveCursor,
  pulseCursor,
  resetZoom,
  setActionRail,
  setActiveAction,
  showCaption,
  smoothZoom,
} from './overlay.js';
import type {
  DemoFlow, DemoPolish, DemoStep, DemoTiming, RunOptions, RunResult, StepEvent,
} from './types.js';
import {resolveTarget} from './url-resolver.js';

const defaultViewport = {
  width: 1280,
  height: 720,
};

export async function runFlow(flow: DemoFlow, options: RunOptions): Promise<RunResult> {
  const {outputDir} = options;
  const screenshotDir = join(outputDir, 'screenshots');
  const rawVideoDir = join(outputDir, 'raw-video');
  const events: StepEvent[] = [];
  const recordVideo = options.recordVideo && (flow.record?.enabled ?? true);
  const viewport = flow.viewport ?? defaultViewport;
  const timing = normalizeTiming(flow, options);
  const polish = polishWithTiming(flow.polish, timing);

  await mkdir(screenshotDir, {recursive: true});
  if (recordVideo) {
    await mkdir(rawVideoDir, {recursive: true});
  }

  const browser = await chromium.launch({
    headless: !options.headed,
    slowMo: options.slowMoMs,
  });

  const contextOptions: BrowserContextOptions = {
    viewport,
  };

  if (recordVideo) {
    contextOptions.recordVideo = {
      dir: rawVideoDir,
      size: flow.record?.size ?? viewport,
    };
  }

  const context = await browser.newContext(contextOptions);

  const page = await context.newPage();
  await installOverlay(page, polish);

  let videoPath: string | undefined;

  try {
    await page.goto(resolveTarget(flow.startUrl, options.flowDir, options.baseUrl), {
      waitUntil: 'domcontentloaded',
    });
    await runSteps(page, flow.steps, {
      options,
      screenshotDir,
      events,
      index: 0,
      timing,
      polish,
      railLabels: flow.steps.map(step => stepLabel(step)),
    });
  } finally {
    await clearCaption(page).catch(ignoreCleanupError);
    await resetZoom(page, delay(timing.zoomMs, timing)).catch(ignoreCleanupError);

    const video = page.video();
    await context.close();
    await browser.close();

    if (recordVideo && video !== null) {
      const sourceVideoPath = await video.path();
      videoPath = join(outputDir, 'recording.webm');
      await copyFile(sourceVideoPath, videoPath);
    }
  }

  const manifestPath = join(outputDir, 'manifest.json');
  const result: RunResult = {
    flowName: flow.name ?? 'unnamed-flow',
    outputDir,
    manifestPath,
    events,
  };

  if (videoPath !== undefined) {
    result.videoPath = videoPath;
  }

  await writeFile(manifestPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

type StepsContext = {
  options: RunOptions;
  screenshotDir: string;
  events: StepEvent[];
  index: number;
  timing: RuntimeTiming;
  polish: DemoPolish;
  railLabels: string[];
};

async function runSteps(page: Page, steps: DemoStep[], context: StepsContext): Promise<void> {
  const step = steps[context.index];

  if (step === undefined) {
    return;
  }

  const event = startEvent(context.index, step);
  context.events.push(event);

  try {
    if (context.index > 0) {
      await setActiveAction(page, context.index);
    }

    const artifact = await runStep(page, step, {
      options: context.options,
      screenshotDir: context.screenshotDir,
      index: context.index,
      timing: context.timing,
      polish: context.polish,
    });
    event.status = 'ok';
    if (artifact !== undefined) {
      event.artifact = artifact;
    }

    if (context.index === 0) {
      await setActionRail(page, context.railLabels);
      await setActiveAction(page, context.index);
    }
  } catch (error) {
    event.status = 'failed';
    event.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    event.endedAt = new Date().toISOString();
  }

  await runSteps(page, steps, {
    ...context,
    index: context.index + 1,
  });
}

type StepContext = {
  options: RunOptions;
  screenshotDir: string;
  index: number;
  timing: RuntimeTiming;
  polish: DemoPolish;
};

async function runStep(page: Page, step: DemoStep, context: StepContext): Promise<string | undefined> {
  const timeout = step.timeoutMs ?? 10_000;
  const {options, screenshotDir, index, timing, polish} = context;

  switch (step.action) {
    case 'goto': {
      await page.goto(resolveTarget(required(step.url, 'goto.url'), options.flowDir, options.baseUrl), {
        timeout,
        waitUntil: 'domcontentloaded',
      });
      return undefined;
    }

    case 'caption': {
      await showCaption(page, required(step.text, 'caption.text'));
      await page.waitForTimeout(delay(step.ms ?? 1200, timing));
      return undefined;
    }

    case 'waitForText': {
      await page.getByText(required(step.text, 'waitForText.text'), {exact: false}).first().waitFor({
        timeout,
        state: 'visible',
      });
      return undefined;
    }

    case 'waitForSelector': {
      await page.locator(required(step.selector, 'waitForSelector.selector')).first().waitFor({
        timeout,
        state: 'visible',
      });
      return undefined;
    }

    case 'hover': {
      const locator = page.locator(required(step.selector, 'hover.selector')).first();
      await moveToLocator(page, locator, false, timing);
      await locator.hover({timeout});
      return undefined;
    }

    case 'click': {
      const locator = page.locator(required(step.selector, 'click.selector')).first();
      await moveToLocator(page, locator, true, timing);
      await locator.click({timeout});
      await page.waitForTimeout(delay(timing.clickPauseMs, timing));
      return undefined;
    }

    case 'fill': {
      const locator = page.locator(required(step.selector, 'fill.selector')).first();
      await moveToLocator(page, locator, false, timing);
      await locator.fill(required(step.value, 'fill.value'), {timeout});
      await page.waitForTimeout(delay(timing.fillPauseMs, timing));
      return undefined;
    }

    case 'focus': {
      const locator = page.locator(required(step.selector, 'focus.selector')).first();
      const point = await moveToLocator(page, locator, false, timing);
      const scale = step.scale ?? polish.zoom?.defaultScale ?? 1.08;
      const durationMs = delay(step.durationMs ?? polish.zoom?.durationMs ?? timing.zoomMs, timing);
      await smoothZoom(page, {
        x: point?.x ?? Math.round((page.viewportSize()?.width ?? defaultViewport.width) / 2),
        y: point?.y ?? Math.round((page.viewportSize()?.height ?? defaultViewport.height) / 2),
        scale,
        durationMs,
      });
      await page.waitForTimeout(durationMs + delay(step.holdMs ?? 650, timing));
      return undefined;
    }

    case 'press': {
      await (step.selector === undefined ? page.keyboard.press(required(step.key, 'press.key')) : page.locator(step.selector).first().press(required(step.key, 'press.key'), {timeout}));

      await page.waitForTimeout(delay(timing.pressPauseMs, timing));
      return undefined;
    }

    case 'resetZoom': {
      const durationMs = delay(step.durationMs ?? polish.zoom?.resetMs ?? timing.zoomMs, timing);
      await resetZoom(page, durationMs);
      await page.waitForTimeout(durationMs);
      return undefined;
    }

    case 'scroll': {
      await page.mouse.wheel(step.x ?? 0, step.y ?? 560);
      await page.waitForTimeout(delay(timing.scrollPauseMs, timing));
      return undefined;
    }

    case 'pause': {
      await page.waitForTimeout(delay(requiredNumber(step.ms, 'pause.ms'), timing));
      return undefined;
    }

    case 'zoom': {
      const viewportSize = page.viewportSize() ?? defaultViewport;
      const durationMs = delay(step.durationMs ?? polish.zoom?.durationMs ?? timing.zoomMs, timing);
      await smoothZoom(page, {
        x: step.x ?? Math.round(viewportSize.width / 2),
        y: step.y ?? Math.round(viewportSize.height / 2),
        scale: requiredNumber(step.scale, 'zoom.scale'),
        durationMs,
      });
      await page.waitForTimeout(durationMs);
      return undefined;
    }

    case 'screenshot': {
      const name = slug(step.name ?? step.label ?? `step-${index + 1}`);
      const path = join(screenshotDir, `${name}.png`);
      await page.screenshot({
        path,
        fullPage: step.fullPage ?? false,
      });
      return path;
    }
  }
}

type CursorPoint = {
  x: number;
  y: number;
};

async function moveToLocator(page: Page, locator: Locator, click: boolean, timing: RuntimeTiming): Promise<CursorPoint | undefined> {
  await locator.waitFor({
    state: 'visible',
    timeout: 10_000,
  });

  const box = await locator.boundingBox();

  if (box === null) {
    return undefined;
  }

  const x = Math.round(box.x + (box.width / 2));
  const y = Math.round(box.y + (box.height / 2));
  await moveCursor(page, x, y);
  await page.waitForTimeout(delay(timing.moveMs, timing));

  if (click) {
    await pulseCursor(page, x, y);
  }

  return {x, y};
}

function startEvent(index: number, step: DemoStep): StepEvent {
  const event: StepEvent = {
    index,
    action: step.action,
    startedAt: new Date().toISOString(),
    status: 'ok',
  };

  if (step.label !== undefined) {
    event.label = step.label;
  }

  return event;
}

function required(value: string | undefined, label: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`${label} is required`);
  }

  return value;
}

function requiredNumber(value: number | undefined, label: string): number {
  if (value === undefined) {
    throw new Error(`${label} is required`);
  }

  return value;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z\d]+/gv, '-')
    .replaceAll(/^-|-$/gv, '')
    .slice(0, 80) || 'screenshot';
}

type RuntimeTiming = Required<DemoTiming>;

function normalizeTiming(flow: DemoFlow, options: RunOptions): RuntimeTiming {
  const speed = clamp(flow.timing?.speed ?? options.speed, 0.25, 8);

  return {
    speed,
    moveMs: flow.timing?.moveMs ?? flow.polish?.cursor?.moveMs ?? 220,
    clickPauseMs: flow.timing?.clickPauseMs ?? 190,
    fillPauseMs: flow.timing?.fillPauseMs ?? 120,
    pressPauseMs: flow.timing?.pressPauseMs ?? 120,
    scrollPauseMs: flow.timing?.scrollPauseMs ?? 220,
    zoomMs: flow.timing?.zoomMs ?? flow.polish?.zoom?.durationMs ?? 420,
  };
}

function polishWithTiming(polish: DemoPolish | undefined, timing: RuntimeTiming): DemoPolish {
  const cursor = {
    ...polish?.cursor,
    moveMs: delay(timing.moveMs, timing),
  };

  return {
    ...polish,
    cursor,
  };
}

function delay(ms: number, timing: RuntimeTiming): number {
  return Math.max(0, Math.round(ms / timing.speed));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stepLabel(step: DemoStep): string {
  return step.label ?? step.text ?? step.selector ?? step.action;
}

function ignoreCleanupError(): void {
  return undefined;
}
