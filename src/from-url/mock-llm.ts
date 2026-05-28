import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SUPPORTED_ACTIONS} from '../flow-schema.js';
import type {DemoAction} from '../types.js';
import type {FromUrlStep, LlmClient} from './types.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const defaultFixturePath = resolve(here, '../../fixtures/from-url-mock-response.json');

// Reuse the schema allowlist (src/flow-schema.ts) — adding an action there
// makes it instantly legal in from-url scripts too. Eliminates the previous
// duplicate literal list that drifted silently when actions were added.
const actionSet: ReadonlySet<DemoAction> = new Set<DemoAction>(SUPPORTED_ACTIONS);

export type MockLlmOptions = {
  fixturePath?: string;
};

export function createMockLlmClient(options: MockLlmOptions = {}): LlmClient {
  const fixturePath = options.fixturePath ?? defaultFixturePath;

  return {
    async generateScript(_input) {
      const raw = await readFile(fixturePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return parseFixture(parsed, fixturePath);
    },
  };
}

function parseFixture(value: unknown, source: string): {name?: string; steps: FromUrlStep[]} {
  if (!isRecord(value)) {
    throw new TypeError(`mock LLM fixture ${source}: expected object`);
  }

  const rawSteps = value.steps;
  if (!Array.isArray(rawSteps)) {
    throw new TypeError(`mock LLM fixture ${source}: steps must be an array`);
  }

  const steps: FromUrlStep[] = rawSteps.map((step, index) => parseStep(step, `${source} steps[${index}]`));
  const name = typeof value.name === 'string' ? value.name : undefined;

  return name === undefined ? {steps} : {name, steps};
}

function parseStep(value: unknown, label: string): FromUrlStep {
  if (!isRecord(value)) {
    throw new TypeError(`${label}: expected object`);
  }

  const {selector, action, narration, value: stepValue} = value;

  if (typeof selector !== 'string' || selector.length === 0) {
    throw new TypeError(`${label}: selector must be a non-empty string`);
  }

  if (typeof action !== 'string' || !isDemoAction(action)) {
    throw new TypeError(`${label}: action must be a DemoAction`);
  }

  if (typeof narration !== 'string' || narration.length === 0) {
    throw new TypeError(`${label}: narration must be a non-empty string`);
  }

  const step: FromUrlStep = {
    selector,
    action,
    narration,
  };

  if (typeof stepValue === 'string') {
    step.value = stepValue;
  }

  return step;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDemoAction(value: string): value is DemoAction {
  return (actionSet as ReadonlySet<string>).has(value);
}
