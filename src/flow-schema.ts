import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {type} from 'arktype';
import type {
  DemoAction, DemoFlow, DemoStep, LoadedFlow, ViewportSize,
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
  [optionalKey('metadata')]: 'object',
  steps: 'object[]',
});

const actions = [
  'goto',
  'click',
  'fill',
  'hover',
  'press',
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
  assertOptionalNumber(input.timeoutMs, `${label}.timeoutMs`);

  if ((action === 'click' || action === 'fill' || action === 'hover' || action === 'waitForSelector') && typeof input.selector !== 'string') {
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

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new TypeError(`Invalid ${label}: expected boolean`);
  }

  return value;
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

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
