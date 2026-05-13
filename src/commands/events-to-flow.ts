import type {RecordingEvent, TargetMeta, Viewport} from '../recording/types.js';
import type {DemoFlow, DemoStep} from '../types.js';

export interface EventsToFlowInput {
  events: RecordingEvent[];
  startUrl: string;
  viewport: Viewport;
  flowName?: string;
  prompt?: string;
  model?: string;
}

export function eventsToFlow(input: EventsToFlowInput): DemoFlow {
  const steps: DemoStep[] = [];
  let lastSelectorMissing = false;

  for (const event of input.events) {
    const step = mapEvent(event);
    if (!step) continue;
    if (step.selector === undefined && (step.action === 'click' || step.action === 'fill' || step.action === 'hover' || step.action === 'focus')) {
      step.label = `TODO selector — ${step.label ?? step.action}`;
      lastSelectorMissing = true;
    }
    steps.push(step);
  }

  if (lastSelectorMissing) {
    steps.push({
      action: 'caption',
      text: 'Some steps need a hand-picked selector — see TODO labels.',
      ms: 800,
      label: 'Author note',
    });
  }

  return {
    name: input.flowName ?? 'captured-flow',
    startUrl: input.startUrl,
    viewport: input.viewport,
    record: {enabled: true, size: input.viewport},
    metadata: {
      sourcedBy: 'auto-demo author',
      ...(input.prompt ? {prompt: input.prompt} : {}),
      ...(input.model ? {model: input.model} : {}),
    },
    steps,
  };
}

function mapEvent(event: RecordingEvent): DemoStep | undefined {
  switch (event.type) {
    case 'navigate':
      // The initial navigate is captured implicitly via startUrl; skip duplicates.
      if (event.id === 1) return undefined;
      return event.url
        ? {action: 'goto', url: event.url, label: event.description}
        : undefined;

    case 'click': {
      const selector = selectorFromTarget(event.target_meta);
      return {
        action: 'click',
        ...(selector ? {selector} : {}),
        label: event.description,
      };
    }

    case 'type': {
      const selector = selectorFromTarget(event.target_meta, event.value);
      return {
        action: 'fill',
        ...(selector ? {selector} : {}),
        value: event.value ?? '',
        label: event.description,
      };
    }

    case 'hover': {
      const selector = selectorFromTarget(event.target_meta);
      return {
        action: 'hover',
        ...(selector ? {selector} : {}),
        label: event.description,
      };
    }

    case 'scroll':
      // Agent's scroll doesn't have a stable pixel offset — emit a small default.
      return {
        action: 'scroll',
        y: 200,
        label: event.description,
      };

    case 'press_key':
      return {
        action: 'press',
        key: event.value ?? 'Enter',
        label: event.description,
      };

    case 'wait':
      return {
        action: 'pause',
        ms: 500,
        label: event.description,
      };

    case 'narrate':
      return {
        action: 'caption',
        text: event.description,
        ms: 1200,
        label: 'Narration',
      };

    case 'done':
    case 'select_option':
    default:
      return undefined;
  }
}

/**
 * Map agent target metadata to a Playwright locator string the ui-demo-runner can replay.
 * Priority: explicit selector → role+name → role-only/name-only → undefined.
 * Text fallback is intentionally excluded: the agent's `text` field is ambiguous
 * (sometimes the typed value, sometimes the target label) and produces incorrect selectors.
 */
function selectorFromTarget(meta: TargetMeta | undefined, typedValue?: string): string | undefined {
  if (!meta) return undefined;

  if (meta.selector) return meta.selector;

  if (meta.role && meta.name) {
    return `role=${meta.role}[name=${JSON.stringify(meta.name)}]`;
  }

  if (meta.role) {
    return `role=${meta.role}`;
  }

  if (meta.name && meta.name !== typedValue) {
    return `text=${meta.name}`;
  }

  return undefined;
}
