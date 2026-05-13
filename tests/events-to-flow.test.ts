import {describe, expect, test} from 'vitest';
import {eventsToFlow} from '../src/commands/events-to-flow.js';
import type {RecordingEvent} from '../src/recording/types.js';

const baseViewport = {width: 1280, height: 720};

function event(partial: Partial<RecordingEvent> & {type: RecordingEvent['type']; id: number}): RecordingEvent {
  return {
    id: partial.id,
    timestamp_ms: 0,
    type: partial.type,
    description: partial.description ?? '',
    viewport: baseViewport,
    ...partial,
  };
}

describe('eventsToFlow', () => {
  test('returns an empty flow for an empty event log', () => {
    const flow = eventsToFlow({events: [], startUrl: 'http://x', viewport: baseViewport});
    expect(flow.steps).toEqual([]);
    expect(flow.startUrl).toBe('http://x');
    expect(flow.name).toBe('captured-flow');
  });

  test('skips the implicit initial navigate but keeps later ones', () => {
    const flow = eventsToFlow({
      events: [
        event({id: 1, type: 'navigate', url: 'http://x/start', description: 'first nav'}),
        event({id: 2, type: 'navigate', url: 'http://x/page2', description: 'mid-demo nav'}),
      ],
      startUrl: 'http://x/start',
      viewport: baseViewport,
    });
    expect(flow.steps).toHaveLength(1);
    expect(flow.steps[0]).toMatchObject({
      action: 'goto',
      url: 'http://x/page2',
      label: 'mid-demo nav',
    });
  });

  test('uses an explicit selector when the agent provided one', () => {
    const flow = eventsToFlow({
      events: [
        event({id: 1, type: 'navigate', url: 'http://x', description: ''}),
        event({
          id: 2,
          type: 'click',
          description: 'open nav',
          target_meta: {selector: '#nav-opportunities'},
        }),
      ],
      startUrl: 'http://x',
      viewport: baseViewport,
    });
    expect(flow.steps[0]).toMatchObject({
      action: 'click',
      selector: '#nav-opportunities',
      label: 'open nav',
    });
  });

  test('emits Playwright role= syntax for role+name targets', () => {
    const flow = eventsToFlow({
      events: [
        event({id: 1, type: 'navigate', url: 'http://x', description: ''}),
        event({
          id: 2,
          type: 'click',
          description: 'submit',
          target_meta: {role: 'button', name: 'Save'},
        }),
      ],
      startUrl: 'http://x',
      viewport: baseViewport,
    });
    expect(flow.steps[0]).toMatchObject({
      action: 'click',
      selector: 'role=button[name="Save"]',
    });
  });

  test('marks click without resolvable selector with TODO label', () => {
    const flow = eventsToFlow({
      events: [
        event({id: 1, type: 'navigate', url: 'http://x', description: ''}),
        event({
          id: 2,
          type: 'click',
          description: 'mystery click',
          target_meta: {index: 5},
        }),
      ],
      startUrl: 'http://x',
      viewport: baseViewport,
    });
    expect(flow.steps[0]?.selector).toBeUndefined();
    expect(flow.steps[0]?.label).toMatch(/^TODO selector/);
    // Trailing author note caption when any step is incomplete
    expect(flow.steps.at(-1)).toMatchObject({action: 'caption', label: 'Author note'});
  });

  test('does not use target.name as selector when it matches the typed value', () => {
    // Repro of the bug fixed in events-to-flow: target.name carrying the typed
    // value, not the target label. Should NOT emit text=voice automation.
    const flow = eventsToFlow({
      events: [
        event({id: 1, type: 'navigate', url: 'http://x', description: ''}),
        event({
          id: 2,
          type: 'type',
          description: 'type into search',
          value: 'voice automation',
          target_meta: {name: 'voice automation', index: 2},
        }),
      ],
      startUrl: 'http://x',
      viewport: baseViewport,
    });
    expect(flow.steps[0]?.action).toBe('fill');
    expect(flow.steps[0]?.value).toBe('voice automation');
    expect(flow.steps[0]?.selector).toBeUndefined();
  });

  test('press_key falls back to Enter when no key is recorded', () => {
    const flow = eventsToFlow({
      events: [
        event({id: 1, type: 'navigate', url: 'http://x', description: ''}),
        event({id: 2, type: 'press_key', description: 'submit form'}),
      ],
      startUrl: 'http://x',
      viewport: baseViewport,
    });
    expect(flow.steps[0]).toMatchObject({action: 'press', key: 'Enter'});
  });

  test('drops done and select_option events', () => {
    const flow = eventsToFlow({
      events: [
        event({id: 1, type: 'navigate', url: 'http://x', description: ''}),
        event({id: 2, type: 'select_option', description: ''}),
        event({id: 3, type: 'done', description: 'finished'}),
      ],
      startUrl: 'http://x',
      viewport: baseViewport,
    });
    expect(flow.steps).toEqual([]);
  });

  test('narrate becomes a caption step', () => {
    const flow = eventsToFlow({
      events: [
        event({id: 1, type: 'navigate', url: 'http://x', description: ''}),
        event({id: 2, type: 'narrate', description: 'Here is the dashboard'}),
      ],
      startUrl: 'http://x',
      viewport: baseViewport,
    });
    expect(flow.steps[0]).toMatchObject({
      action: 'caption',
      text: 'Here is the dashboard',
    });
  });

  test('embeds prompt and model into metadata', () => {
    const flow = eventsToFlow({
      events: [],
      startUrl: 'http://x',
      viewport: baseViewport,
      prompt: 'Show the dashboard.',
      model: 'claude-haiku-4-5',
    });
    expect(flow.metadata).toMatchObject({
      sourcedBy: 'auto_demo author',
      prompt: 'Show the dashboard.',
      model: 'claude-haiku-4-5',
    });
  });
});
