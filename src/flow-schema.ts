import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {type} from 'arktype';
import type {
  DemoAction, DemoFlow, DemoPolish, DemoStep, DemoTiming, LoadedFlow, ViewportSize,
} from './types.js';

type UnknownRecord = Record<string, unknown>;

const optionalKey = (key: string): string => `${key}?`;

const flowShape = type({
  [optionalKey('name')]: 'string',
  startUrl: 'string',
  [optionalKey('viewport')]: {
    width: 'number',
    height: 'number',
  },
  [optionalKey('record')]: {
    [optionalKey('enabled')]: 'boolean',
    [optionalKey('size')]: {
      width: 'number',
      height: 'number',
    },
  },
  [optionalKey('timing')]: 'object',
  [optionalKey('polish')]: 'object',
  [optionalKey('metadata')]: 'object',
  steps: 'object[]',
});

const actions = [
  'goto',
  'click',
  'caption',
  'fill',
  'focus',
  'hover',
  'press',
  'resetZoom',
  'screenshot',
  'scroll',
  'pause',
  'zoom',
  'waitForSelector',
  'waitForText',
] as const satisfies readonly DemoAction[];

const actionSet: ReadonlySet<string> = new Set(actions);

export async function loadFlow(flowPath: string): Promise<LoadedFlow> {
  const sourcePath = resolve(flowPath);
  const raw = await readFile(sourcePath, 'utf8');
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${sourcePath}: ${formatError(error)}`, {
      cause: error,
    });
  }

  return {
    flow: validateFlow(parsed, sourcePath),
    sourcePath,
    sourceDir: dirname(sourcePath),
  };
}

export function validateFlow(input: unknown, label = 'flow'): DemoFlow {
  const checked = flowShape(input);

  if (checked instanceof type.errors) {
    throw new TypeError(`Invalid ${label}: ${checked.summary}`);
  }

  const checkedRecord = requireRecord(checked, label);
  const startUrl = requireString(checkedRecord.startUrl, `${label}.startUrl`);
  const viewport = optionalViewport(checkedRecord.viewport, `${label}.viewport`);
  const record = optionalRecordSettings(checkedRecord.record, `${label}.record`);
  const timing = optionalTiming(checkedRecord.timing, `${label}.timing`);
  const polish = optionalPolish(checkedRecord.polish, `${label}.polish`);
  const metadata = optionalMetadata(checkedRecord.metadata, `${label}.metadata`);
  const rawSteps = requireRecordArray(checkedRecord.steps, `${label}.steps`);

  assertViewport(viewport, `${label}.viewport`);
  assertViewport(record?.size, `${label}.record.size`);

  if (rawSteps.length === 0) {
    throw new Error(`Invalid ${label}: steps must contain at least one action`);
  }

  const steps: DemoStep[] = [];

  for (const [index, step] of rawSteps.entries()) {
    validateStep(step, `${label}.steps[${index}]`);
    steps.push(step);
  }

  const flow: DemoFlow = {
    startUrl,
    steps,
  };

  const name = optionalString(checkedRecord.name, `${label}.name`);
  if (name !== undefined) {
    flow.name = name;
  }

  if (viewport !== undefined) {
    flow.viewport = viewport;
  }

  if (record !== undefined) {
    flow.record = record;
  }

  if (timing !== undefined) {
    flow.timing = timing;
  }

  if (polish !== undefined) {
    flow.polish = polish;
  }

  if (metadata !== undefined) {
    flow.metadata = metadata;
  }

  return flow;
}

function validateStep(input: Record<string, unknown>, label: string): asserts input is DemoStep {
  const {action} = input;

  if (typeof action !== 'string' || !isDemoAction(action)) {
    throw new Error(`Invalid ${label}: action must be one of ${actions.join(', ')}`);
  }

  assertOptionalString(input.label, `${label}.label`);
  assertOptionalString(input.selector, `${label}.selector`);
  assertOptionalString(input.text, `${label}.text`);
  assertOptionalString(input.value, `${label}.value`);
  assertOptionalString(input.url, `${label}.url`);
  assertOptionalString(input.key, `${label}.key`);
  assertOptionalString(input.name, `${label}.name`);
  assertOptionalBoolean(input.fullPage, `${label}.fullPage`);
  assertOptionalNumber(input.ms, `${label}.ms`);
  assertOptionalNumber(input.x, `${label}.x`);
  assertOptionalNumber(input.y, `${label}.y`);
  assertOptionalNumber(input.scale, `${label}.scale`);
  assertOptionalNumber(input.durationMs, `${label}.durationMs`);
  assertOptionalNumber(input.holdMs, `${label}.holdMs`);
  assertOptionalNumber(input.timeoutMs, `${label}.timeoutMs`);

  if ((action === 'click' || action === 'fill' || action === 'focus' || action === 'hover' || action === 'waitForSelector') && typeof input.selector !== 'string') {
    throw new Error(`Invalid ${label}: ${action} requires selector`);
  }

  if (action === 'fill' && typeof input.value !== 'string') {
    throw new Error(`Invalid ${label}: fill requires value`);
  }

  if (action === 'goto' && typeof input.url !== 'string') {
    throw new Error(`Invalid ${label}: goto requires url`);
  }

  if (action === 'press' && typeof input.key !== 'string') {
    throw new Error(`Invalid ${label}: press requires key`);
  }

  if (action === 'waitForText' && typeof input.text !== 'string') {
    throw new Error(`Invalid ${label}: waitForText requires text`);
  }

  if (action === 'caption' && typeof input.text !== 'string') {
    throw new Error(`Invalid ${label}: caption requires text`);
  }

  if (action === 'pause' && typeof input.ms !== 'number') {
    throw new Error(`Invalid ${label}: pause requires ms`);
  }

  if (action === 'zoom' && typeof input.scale !== 'number') {
    throw new Error(`Invalid ${label}: zoom requires scale`);
  }
}

function isDemoAction(value: string): value is DemoAction {
  return actionSet.has(value);
}

function requireRecord(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) {
    throw new TypeError(`Invalid ${label}: expected object`);
  }

  return value;
}

function optionalMetadata(value: unknown, label: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requireRecord(value, label);
}

function requireRecordArray(value: unknown, label: string): UnknownRecord[] {
  if (!Array.isArray(value) || !value.every(item => isRecord(item))) {
    throw new TypeError(`Invalid ${label}: expected object[]`);
  }

  return value;
}

function optionalViewport(value: unknown, label: string): ViewportSize | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = requireRecord(value, label);
  return {
    width: requireNumber(record.width, `${label}.width`),
    height: requireNumber(record.height, `${label}.height`),
  };
}

function optionalRecordSettings(value: unknown, label: string): DemoFlow['record'] {
  if (value === undefined) {
    return undefined;
  }

  const record = requireRecord(value, label);
  const settings: NonNullable<DemoFlow['record']> = {};
  const enabled = optionalBoolean(record.enabled, `${label}.enabled`);
  const size = optionalViewport(record.size, `${label}.size`);

  if (enabled !== undefined) {
    settings.enabled = enabled;
  }

  if (size !== undefined) {
    settings.size = size;
  }

  return settings;
}

function optionalTiming(value: unknown, label: string): DemoTiming | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = requireRecord(value, label);
  const timing: DemoTiming = {};
  const speed = optionalNumber(record.speed, `${label}.speed`);
  const moveMs = optionalNonNegativeNumber(record.moveMs, `${label}.moveMs`);
  const clickPauseMs = optionalNonNegativeNumber(record.clickPauseMs, `${label}.clickPauseMs`);
  const fillPauseMs = optionalNonNegativeNumber(record.fillPauseMs, `${label}.fillPauseMs`);
  const pressPauseMs = optionalNonNegativeNumber(record.pressPauseMs, `${label}.pressPauseMs`);
  const scrollPauseMs = optionalNonNegativeNumber(record.scrollPauseMs, `${label}.scrollPauseMs`);
  const zoomMs = optionalNonNegativeNumber(record.zoomMs, `${label}.zoomMs`);

  if (speed !== undefined) {
    if (speed <= 0 || speed > 8) {
      throw new Error(`Invalid ${label}.speed: expected number > 0 and <= 8`);
    }

    timing.speed = speed;
  }

  if (moveMs !== undefined) {
    timing.moveMs = moveMs;
  }

  if (clickPauseMs !== undefined) {
    timing.clickPauseMs = clickPauseMs;
  }

  if (fillPauseMs !== undefined) {
    timing.fillPauseMs = fillPauseMs;
  }

  if (pressPauseMs !== undefined) {
    timing.pressPauseMs = pressPauseMs;
  }

  if (scrollPauseMs !== undefined) {
    timing.scrollPauseMs = scrollPauseMs;
  }

  if (zoomMs !== undefined) {
    timing.zoomMs = zoomMs;
  }

  return timing;
}

function optionalPolish(value: unknown, label: string): DemoPolish | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = requireRecord(value, label);
  const polish: DemoPolish = {};

  const cursor = optionalRecord(record.cursor, `${label}.cursor`);
  if (cursor !== undefined) {
    polish.cursor = optionalCursor(cursor, `${label}.cursor`);
  }

  const actionRail = optionalRecord(record.actionRail, `${label}.actionRail`);
  if (actionRail !== undefined) {
    const enabled = optionalBoolean(actionRail.enabled, `${label}.actionRail.enabled`);
    polish.actionRail = enabled === undefined ? {} : {enabled};
  }

  const captions = optionalRecord(record.captions, `${label}.captions`);
  if (captions !== undefined) {
    polish.captions = optionalCaptions(captions, `${label}.captions`);
  }

  const zoom = optionalRecord(record.zoom, `${label}.zoom`);
  if (zoom !== undefined) {
    polish.zoom = optionalZoom(zoom, `${label}.zoom`);
  }

  return polish;
}

function optionalCursor(record: UnknownRecord, label: string): NonNullable<DemoPolish['cursor']> {
  const cursor: NonNullable<DemoPolish['cursor']> = {};
  const style = optionalString(record.style, `${label}.style`);
  const accentColor = optionalString(record.accentColor, `${label}.accentColor`);
  const moveMs = optionalNonNegativeNumber(record.moveMs, `${label}.moveMs`);
  const pulseMs = optionalNonNegativeNumber(record.pulseMs, `${label}.pulseMs`);

  if (style !== undefined) {
    assertChoice(style, ['modern', 'classic', 'none'], `${label}.style`);
    cursor.style = style;
  }

  if (accentColor !== undefined) {
    cursor.accentColor = accentColor;
  }

  if (moveMs !== undefined) {
    cursor.moveMs = moveMs;
  }

  if (pulseMs !== undefined) {
    cursor.pulseMs = pulseMs;
  }

  return cursor;
}

function optionalCaptions(record: UnknownRecord, label: string): NonNullable<DemoPolish['captions']> {
  const captions: NonNullable<DemoPolish['captions']> = {};
  const enabled = optionalBoolean(record.enabled, `${label}.enabled`);
  const position = optionalString(record.position, `${label}.position`);

  if (enabled !== undefined) {
    captions.enabled = enabled;
  }

  if (position !== undefined) {
    assertChoice(position, ['top', 'bottom'], `${label}.position`);
    captions.position = position;
  }

  return captions;
}

function optionalZoom(record: UnknownRecord, label: string): NonNullable<DemoPolish['zoom']> {
  const zoom: NonNullable<DemoPolish['zoom']> = {};
  const defaultScale = optionalNumber(record.defaultScale, `${label}.defaultScale`);
  const durationMs = optionalNonNegativeNumber(record.durationMs, `${label}.durationMs`);
  const resetMs = optionalNonNegativeNumber(record.resetMs, `${label}.resetMs`);

  if (defaultScale !== undefined) {
    if (defaultScale <= 0 || defaultScale > 2) {
      throw new Error(`Invalid ${label}.defaultScale: expected number > 0 and <= 2`);
    }

    zoom.defaultScale = defaultScale;
  }

  if (durationMs !== undefined) {
    zoom.durationMs = durationMs;
  }

  if (resetMs !== undefined) {
    zoom.resetMs = resetMs;
  }

  return zoom;
}

function assertViewport(viewport: ViewportSize | undefined, label: string): void {
  if (viewport === undefined) {
    return;
  }

  if (!Number.isInteger(viewport.width) || viewport.width < 320) {
    throw new Error(`Invalid ${label}.width: expected integer >= 320`);
  }

  if (!Number.isInteger(viewport.height) || viewport.height < 240) {
    throw new Error(`Invalid ${label}.height: expected integer >= 240`);
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`Invalid ${label}: expected string`);
  }

  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requireString(value, label);
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Invalid ${label}: expected finite number`);
  }

  return value;
}

function optionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requireNumber(value, label);
}

function optionalNonNegativeNumber(value: unknown, label: string): number | undefined {
  const number = optionalNumber(value, label);
  if (number !== undefined && number < 0) {
    throw new Error(`Invalid ${label}: expected number >= 0`);
  }

  return number;
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new TypeError(`Invalid ${label}: expected boolean`);
  }

  return value;
}

function optionalRecord(value: unknown, label: string): UnknownRecord | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requireRecord(value, label);
}

function assertOptionalString(value: unknown, label: string): void {
  if (value !== undefined && typeof value !== 'string') {
    throw new Error(`Invalid ${label}: expected string`);
  }
}

function assertOptionalBoolean(value: unknown, label: string): void {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new Error(`Invalid ${label}: expected boolean`);
  }
}

function assertOptionalNumber(value: unknown, label: string): void {
  if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error(`Invalid ${label}: expected finite number`);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertChoice<T extends string>(value: string, choices: readonly T[], label: string): asserts value is T {
  if (!(choices as readonly string[]).includes(value)) {
    throw new Error(`Invalid ${label}: expected one of ${choices.join(', ')}`);
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Re-export for test introspection (README ↔ schema doctrine-drift coupling).
export const __test__ = {actions};
