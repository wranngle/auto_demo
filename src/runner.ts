import {mkdir, copyFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
  chromium,
  type BrowserContextOptions,
  type Locator,
  type Page,
} from 'playwright';
import {installOverlay, moveCursor, pulseCursor} from './overlay.js';
import type {
  DemoFlow, DemoStep, RunOptions, RunResult, StepEvent,
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
  await installOverlay(page);

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
    });
  } finally {
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
};

async function runSteps(page: Page, steps: DemoStep[], context: StepsContext): Promise<void> {
  const step = steps[context.index];

  if (step === undefined) {
    return;
  }

  const event = startEvent(context.index, step);
  context.events.push(event);

  try {
    const artifact = await runStep(page, step, {
      options: context.options,
      screenshotDir: context.screenshotDir,
      index: context.index,
    });
    event.status = 'ok';
    if (artifact !== undefined) {
      event.artifact = artifact;
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
};

async function runStep(page: Page, step: DemoStep, context: StepContext): Promise<string | undefined> {
  const timeout = step.timeoutMs ?? 10_000;
  const {options, screenshotDir, index} = context;

  switch (step.action) {
    case 'goto': {
      await page.goto(resolveTarget(required(step.url, 'goto.url'), options.flowDir, options.baseUrl), {
        timeout,
        waitUntil: 'domcontentloaded',
      });
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
      await moveToLocator(page, locator, false);
      await locator.hover({timeout});
      return undefined;
    }

    case 'click': {
      const locator = page.locator(required(step.selector, 'click.selector')).first();
      await moveToLocator(page, locator, true);
      await locator.click({timeout});
      await page.waitForTimeout(250);
      return undefined;
    }

    case 'fill': {
      const locator = page.locator(required(step.selector, 'fill.selector')).first();
      await moveToLocator(page, locator, false);
      await locator.fill(required(step.value, 'fill.value'), {timeout});
      await page.waitForTimeout(150);
      return undefined;
    }

    case 'press': {
      await (step.selector === undefined ? page.keyboard.press(required(step.key, 'press.key')) : page.locator(step.selector).first().press(required(step.key, 'press.key'), {timeout}));

      await page.waitForTimeout(150);
      return undefined;
    }

    case 'scroll': {
      await page.mouse.wheel(step.x ?? 0, step.y ?? 560);
      await page.waitForTimeout(250);
      return undefined;
    }

    case 'pause': {
      await page.waitForTimeout(requiredNumber(step.ms, 'pause.ms'));
      return undefined;
    }

    case 'zoom': {
      await page.evaluate(scale => {
        document.documentElement.style.zoom = String(scale);
      }, requiredNumber(step.scale, 'zoom.scale'));
      await page.waitForTimeout(150);
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

async function moveToLocator(page: Page, locator: Locator, click: boolean): Promise<void> {
  await locator.waitFor({
    state: 'visible',
    timeout: 10_000,
  });

  const box = await locator.boundingBox();

  if (box === null) {
    return;
  }

  const x = Math.round(box.x + (box.width / 2));
  const y = Math.round(box.y + (box.height / 2));
  await moveCursor(page, x, y);
  await page.waitForTimeout(120);

  if (click) {
    await pulseCursor(page, x, y);
  }
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
