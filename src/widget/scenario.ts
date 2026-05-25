import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {type} from 'arktype';
import type {ViewportSize} from '../types.js';
import type {
  ActionBeat, ReplyBeat, ScenarioClientTool, ScenarioLiveWidget, ScenarioTurn, ToolBeat, WidgetScenario,
} from './types.js';

type UnknownRecord = Record<string, unknown>;

const optionalKey = (key: string): string => `${key}?`;

const scenarioShape = type({
  name: 'string',
  business: 'object',
  agent: 'object',
  [optionalKey('capability')]: 'string',
  [optionalKey('intro')]: 'string',
  [optionalKey('outro')]: 'string',
  [optionalKey('viewport')]: 'object',
  [optionalKey('live')]: 'object',
  turns: 'object[]',
});

const actionTypes = ['toast', 'summary'] as const;

export async function loadScenario(scenarioPath: string): Promise<{scenario: WidgetScenario; sourcePath: string}> {
  const sourcePath = resolve(scenarioPath);
  const raw = await readFile(sourcePath, 'utf8');
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${sourcePath}: ${error instanceof Error ? error.message : String(error)}`, {cause: error});
  }

  return {scenario: validateScenario(parsed, sourcePath), sourcePath};
}

export function validateScenario(input: unknown, label = 'scenario'): WidgetScenario {
  const checked = scenarioShape(input);

  if (checked instanceof type.errors) {
    throw new TypeError(`Invalid ${label}: ${checked.summary}`);
  }

  const record = requireRecord(checked, label);
  const business = parseBusiness(record.business, `${label}.business`);
  const agent = parseAgent(record.agent, `${label}.agent`);
  const rawTurns = requireRecordArray(record.turns, `${label}.turns`);

  if (rawTurns.length === 0) {
    throw new Error(`Invalid ${label}: turns must contain at least one turn`);
  }

  const turns = rawTurns.map((turn, index) => parseTurn(turn, `${label}.turns[${index}]`));

  const scenario: WidgetScenario = {
    name: requireString(record.name, `${label}.name`),
    business,
    agent,
    turns,
  };

  assignOptionalString(scenario, 'capability', record.capability, `${label}.capability`);
  assignOptionalString(scenario, 'intro', record.intro, `${label}.intro`);
  assignOptionalString(scenario, 'outro', record.outro, `${label}.outro`);

  const viewport = optionalViewport(record.viewport, `${label}.viewport`);
  if (viewport !== undefined) {
    scenario.viewport = viewport;
  }

  const live = optionalLive(record.live, `${label}.live`);
  if (live !== undefined) {
    scenario.live = live;
  }

  return scenario;
}

function optionalLive(value: unknown, label: string): ScenarioLiveWidget | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = requireRecord(value, label);
  const live: ScenarioLiveWidget = {
    agentId: nonEmpty(requireString(record.agentId, `${label}.agentId`), `${label}.agentId`),
  };

  assignOptionalString(live, 'orb1', record.orb1, `${label}.orb1`);
  assignOptionalString(live, 'orb2', record.orb2, `${label}.orb2`);

  if (record.replyWaitMs !== undefined) {
    const ms = requireNumber(record.replyWaitMs, `${label}.replyWaitMs`);
    if (ms < 0) {
      throw new Error(`Invalid ${label}.replyWaitMs: expected number >= 0`);
    }

    live.replyWaitMs = ms;
  }

  if (record.branding !== undefined) {
    const branding = requireRecord(record.branding, `${label}.branding`);
    const parsed: NonNullable<ScenarioLiveWidget['branding']> = {};
    assignOptionalString(parsed, 'mainLabel', branding.mainLabel, `${label}.branding.mainLabel`);
    assignOptionalString(parsed, 'startCall', branding.startCall, `${label}.branding.startCall`);
    live.branding = parsed;
  }

  if (record.linkHosts !== undefined) {
    if (!Array.isArray(record.linkHosts) || !record.linkHosts.every(host => typeof host === 'string')) {
      throw new TypeError(`Invalid ${label}.linkHosts: expected string[]`);
    }

    live.linkHosts = record.linkHosts;
  }

  if (record.clientTools !== undefined) {
    live.clientTools = requireRecordArray(record.clientTools, `${label}.clientTools`)
      .map((tool, index) => parseClientTool(tool, `${label}.clientTools[${index}]`));
  }

  if (record.workspaceToolIds !== undefined) {
    if (!Array.isArray(record.workspaceToolIds) || !record.workspaceToolIds.every(id => typeof id === 'string' && id.length > 0)) {
      throw new TypeError(`Invalid ${label}.workspaceToolIds: expected non-empty string[]`);
    }

    live.workspaceToolIds = record.workspaceToolIds;
  }

  return live;
}

function parseClientTool(value: UnknownRecord, label: string): ScenarioClientTool {
  const tool: ScenarioClientTool = {
    name: nonEmpty(requireString(value.name, `${label}.name`), `${label}.name`),
    description: nonEmpty(requireString(value.description, `${label}.description`), `${label}.description`),
    result: value.result,
  };

  if (value.result === undefined) {
    throw new Error(`Invalid ${label}.result: a canned result is required`);
  }

  if (value.params !== undefined) {
    tool.params = requireRecordArray(value.params, `${label}.params`).map((param, index) => {
      const name = nonEmpty(requireString(param.name, `${label}.params[${index}].name`), `${label}.params[${index}].name`);
      const description = nonEmpty(requireString(param.description, `${label}.params[${index}].description`), `${label}.params[${index}].description`);
      return param.required === undefined ? {name, description} : {name, description, required: Boolean(param.required)};
    });
  }

  return tool;
}

function parseBusiness(value: unknown, label: string): WidgetScenario['business'] {
  const record = requireRecord(value, label);
  const business: WidgetScenario['business'] = {
    name: requireString(record.name, `${label}.name`),
    tagline: requireString(record.tagline, `${label}.tagline`),
    accent: requireAccent(record.accent, `${label}.accent`),
  };

  assignOptionalString(business, 'vertical', record.vertical, `${label}.vertical`);
  return business;
}

function parseAgent(value: unknown, label: string): WidgetScenario['agent'] {
  const record = requireRecord(value, label);
  const agent: WidgetScenario['agent'] = {
    name: requireString(record.name, `${label}.name`),
    greeting: requireString(record.greeting, `${label}.greeting`),
  };

  assignOptionalString(agent, 'subtitle', record.subtitle, `${label}.subtitle`);
  return agent;
}

function parseTurn(value: UnknownRecord, label: string): ScenarioTurn {
  const user = requireString(value.user, `${label}.user`);
  const rawReply = value.reply;

  if (!Array.isArray(rawReply) || rawReply.length === 0) {
    throw new Error(`Invalid ${label}.reply: expected a non-empty array of beats`);
  }

  const reply = rawReply.map((beat, index) => parseBeat(beat, `${label}.reply[${index}]`));
  const sayCount = reply.filter(beat => Object.hasOwn(beat, 'say')).length;

  if (sayCount === 0) {
    throw new Error(`Invalid ${label}.reply: at least one {say} beat is required so the recorder can sync on agent text`);
  }

  const turn: ScenarioTurn = {user, reply};
  assignOptionalString(turn, 'caption', value.caption, `${label}.caption`);
  return turn;
}

function parseBeat(value: unknown, label: string): ReplyBeat {
  const record = requireRecord(value, label);

  if (typeof record.say === 'string') {
    return {say: nonEmpty(record.say, `${label}.say`)};
  }

  if (typeof record.tool === 'string') {
    const beat: ToolBeat = {
      tool: nonEmpty(record.tool, `${label}.tool`),
      result: requireString(record.result, `${label}.result`),
    };

    if (record.args !== undefined) {
      beat.args = requireRecord(record.args, `${label}.args`);
    }

    return beat;
  }

  if (record.do !== undefined) {
    return {do: parseAction(record.do, `${label}.do`)};
  }

  throw new Error(`Invalid ${label}: each beat must have one of "say", "tool", or "do"`);
}

function parseAction(value: unknown, label: string): ActionBeat {
  const record = requireRecord(value, label);
  const actionType = requireString(record.type, `${label}.type`);

  if (!(actionTypes as readonly string[]).includes(actionType)) {
    throw new Error(`Invalid ${label}.type: expected one of ${actionTypes.join(', ')}`);
  }

  return {
    type: actionType as ActionBeat['type'],
    text: nonEmpty(requireString(record.text, `${label}.text`), `${label}.text`),
  };
}

function optionalViewport(value: unknown, label: string): ViewportSize | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = requireRecord(value, label);
  const width = requireNumber(record.width, `${label}.width`);
  const height = requireNumber(record.height, `${label}.height`);

  if (!Number.isInteger(width) || width < 320) {
    throw new Error(`Invalid ${label}.width: expected integer >= 320`);
  }

  if (!Number.isInteger(height) || height < 240) {
    throw new Error(`Invalid ${label}.height: expected integer >= 240`);
  }

  return {width, height};
}

function requireRecord(value: unknown, label: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Invalid ${label}: expected object`);
  }

  return value as UnknownRecord;
}

function requireRecordArray(value: unknown, label: string): UnknownRecord[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'object' && item !== null && !Array.isArray(item))) {
    throw new TypeError(`Invalid ${label}: expected object[]`);
  }

  return value as UnknownRecord[];
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`Invalid ${label}: expected string`);
  }

  return value;
}

function nonEmpty(value: string, label: string): string {
  if (value.trim().length === 0) {
    throw new Error(`Invalid ${label}: expected a non-empty string`);
  }

  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Invalid ${label}: expected finite number`);
  }

  return value;
}

function requireAccent(value: unknown, label: string): string {
  const accent = requireString(value, label);
  if (!/^#[\da-f]{6}$/iv.test(accent)) {
    throw new Error(`Invalid ${label}: expected a #rrggbb hex color`);
  }

  return accent;
}

function assignOptionalString<T extends object>(target: T, key: keyof T, value: unknown, label: string): void {
  if (value === undefined) {
    return;
  }

  (target[key] as string) = nonEmpty(requireString(value, label), label);
}
