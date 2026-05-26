import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {describe, expect, test} from 'vitest';
import {validateFlow} from '../src/flow-schema.js';
import {
  buildDemoFlow,
  countTools,
  lastSay,
  renderWidgetPage,
  validateScenario,
  WIDGET_SELECTORS,
} from '../src/widget/index.js';
import {loadScenario} from '../src/widget/scenario.js';
import type {WidgetScenario} from '../src/widget/types.js';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

function scenario(overrides: Partial<WidgetScenario> = {}): WidgetScenario {
  return validateScenario({
    name: 'acme-co',
    business: {name: 'Acme Co.', tagline: 'We ship on time', accent: '#ff5f00', vertical: 'ecommerce'},
    agent: {name: 'Ada', greeting: 'Hi, I can help.'},
    intro: 'Watch the agent work.',
    outro: 'All handled.',
    turns: [
      {
        caption: 'First the lookup.',
        user: 'Where is order 42?',
        reply: [
          {say: 'Let me check order 42.'},
          {tool: 'lookup_order', args: {order: 42}, result: 'In transit'},
          {say: 'It is in transit, arriving tomorrow.'},
          {do: {type: 'summary', text: 'Order 42 · arriving tomorrow'}},
        ],
      },
      {
        user: 'Refund it.',
        reply: [
          {say: 'Issuing your refund now.'},
          {tool: 'issue_refund', args: {amount: '$10'}, result: 'Refund approved'},
          {say: 'Refunded $10 to your card.'},
          {do: {type: 'toast', text: 'Refund issued'}},
        ],
      },
    ],
    ...overrides,
  });
}

describe('widget scenario → page + flow (central promise)', () => {
  test('renders a self-contained page mounting the real <elevenlabs-convai> selectors', () => {
    const html = renderWidgetPage(scenario());

    expect(html).toContain('<elevenlabs-convai');
    expect(html).toContain('customElements.define(\'elevenlabs-convai\'');
    expect(html).toContain('aria-label="Text message input"');
    expect(html).toContain('aria-label="Send"');
    // The whole scripted conversation must ship inside the page (offline, no network).
    expect(html).toContain('id="convai-scenario"');
    expect(html).toContain('lookup_order');
    expect(html).toContain('issue_refund');
  });

  test('embedded scenario JSON parses back and is script-tag safe', () => {
    const withBreakout = scenario();
    withBreakout.turns[0]!.reply.unshift({say: 'Edge </script> case <b>.'});
    const html = renderWidgetPage(withBreakout);
    const match = /<script type="application\/json" id="convai-scenario">(.*?)<\/script>/s.exec(html);

    expect(match).not.toBeNull();
    const raw = match![1]!;
    expect(raw).not.toContain('</script>');
    expect(() => JSON.parse(raw) as unknown).not.toThrow();
    expect((JSON.parse(raw) as WidgetScenario).agent.greeting).toBe('Hi, I can help.');
  });

  test('flow drives every turn: fill → send → waitForText, plus a poster screenshot', () => {
    const flow = buildDemoFlow(scenario(), 'acme-co.html');
    const fills = flow.steps.filter(step => step.action === 'fill');
    const sends = flow.steps.filter(step => step.action === 'click' && step.selector?.endsWith(WIDGET_SELECTORS.send));
    const replies = flow.steps.filter(step => step.action === 'waitForText' && step.label?.startsWith('Agent reply'));

    expect(fills).toHaveLength(2);
    expect(fills.map(step => step.value)).toEqual(['Where is order 42?', 'Refund it.']);
    expect(sends).toHaveLength(2);
    expect(replies).toHaveLength(2);
    // Each turn syncs on its final spoken line, not a fixed sleep.
    expect(replies[0]!.text).toBe('It is in transit, arriving tomorrow.');
    expect(replies[1]!.text).toBe('Refunded $10 to your card.');
    expect(flow.steps.at(-1)).toMatchObject({action: 'screenshot', name: 'acme-co'});
  });

  test('generated flow validates against the production flow schema', () => {
    const flow = buildDemoFlow(scenario(), 'acme-co.html');
    expect(() => validateFlow(flow, 'generated')).not.toThrow();
  });

  test('intro, per-turn, and outro captions all become caption steps', () => {
    const captions = buildDemoFlow(scenario(), 'acme-co.html').steps
      .filter(step => step.action === 'caption')
      .map(step => step.text);

    expect(captions).toContain('Watch the agent work.');
    expect(captions).toContain('First the lookup.');
    expect(captions).toContain('All handled.');
  });

  test('counts tool calls and resolves the last spoken line per turn', () => {
    const built = scenario();
    expect(countTools(built)).toBe(2);
    expect(lastSay(built.turns[0]!)).toBe('It is in transit, arriving tomorrow.');
  });

  test('page render and flow build are deterministic', () => {
    expect(renderWidgetPage(scenario())).toBe(renderWidgetPage(scenario()));
    expect(JSON.stringify(buildDemoFlow(scenario(), 'x.html')))
      .toBe(JSON.stringify(buildDemoFlow(scenario(), 'x.html')));
  });
});

describe('scenario validation', () => {
  const base = {
    name: 'n',
    business: {name: 'B', tagline: 't', accent: '#112233'},
    agent: {name: 'A', greeting: 'g'},
    turns: [{user: 'u', reply: [{say: 's'}]}],
  };

  test('rejects an empty turns array', () => {
    expect(() => validateScenario({...base, turns: []})).toThrow(/at least one turn/v);
  });

  test('rejects a reply with no {say} beat (recorder cannot sync)', () => {
    expect(() => validateScenario({...base, turns: [{user: 'u', reply: [{tool: 't', result: 'r'}]}]}))
      .toThrow(/say.*beat is required/v);
  });

  test('rejects a beat that is none of say/tool/do', () => {
    expect(() => validateScenario({...base, turns: [{user: 'u', reply: [{say: 'ok'}, {foo: 1}]}]}))
      .toThrow(/"say", "tool", or "do"/v);
  });

  test('rejects a non-hex accent', () => {
    expect(() => validateScenario({...base, business: {...base.business, accent: 'orange'}}))
      .toThrow(/hex color/v);
  });

  test('rejects an unknown action type', () => {
    expect(() => validateScenario({...base, turns: [{user: 'u', reply: [{say: 's'}, {do: {type: 'explode', text: 'x'}}]}]}))
      .toThrow(/expected one of toast, summary/v);
  });

  test('rejects a live block without agentId', () => {
    expect(() => validateScenario({...base, live: {orb1: '#ffffff'}})).toThrow(/live.agentId/v);
  });

  test('rejects a negative live.replyWaitMs', () => {
    expect(() => validateScenario({...base, live: {agentId: 'agent_x', replyWaitMs: -5}})).toThrow(/replyWaitMs/v);
  });

  test('rejects a live client tool without a canned result', () => {
    expect(() => validateScenario({...base, live: {agentId: 'agent_x', clientTools: [{name: 't', description: 'd'}]}}))
      .toThrow(/result/v);
  });

  test('accepts a live block with branding, linkHosts, and client tools', () => {
    const parsed = validateScenario({...base, live: {
      agentId: 'agent_x',
      branding: {mainLabel: 'Acme', startCall: 'Talk to Ada'},
      linkHosts: ['acme.example.com'],
      clientTools: [{name: 'lookup', description: 'look up', params: [{name: 'id', description: 'the id', required: true}], result: {ok: true}}],
    }});
    expect(parsed.live?.clientTools?.[0]?.name).toBe('lookup');
    expect(parsed.live?.branding?.mainLabel).toBe('Acme');
  });

  test('accepts workspaceToolIds (existing-tool attachment, e.g. cal.com book_demo)', () => {
    const parsed = validateScenario({...base, live: {agentId: 'agent_x', workspaceToolIds: ['tool_abc123', 'tool_def456']}});
    expect(parsed.live?.workspaceToolIds).toEqual(['tool_abc123', 'tool_def456']);
  });

  test('rejects an empty string in workspaceToolIds', () => {
    expect(() => validateScenario({...base, live: {agentId: 'agent_x', workspaceToolIds: ['tool_a', '']}}))
      .toThrow(/workspaceToolIds/v);
  });
});

// Drift coupling: the mock must expose the EXACT text-mode selectors of the real
// @elevenlabs/convai-widget-embed. The shipped hero flow-specs under
// docs/wranngle-hero-demo/flow-specs/ are gitignored (contain real agent IDs +
// candid feedback), so this drift check only runs when those private fixtures
// exist on the local filesystem. CI environments will skip it; the WIDGET_SELECTORS
// literal-assertion at the bottom still pins the contract for everyone.
describe('mock ↔ real-widget selector contract', () => {
  test('WIDGET_SELECTORS match the literals the live flow-specs target', async () => {
    const specPath = resolve(repoRoot, 'docs/wranngle-hero-demo/flow-specs/rich/trattoria.demo.json');
    if (!existsSync(specPath)) return; // private flow-spec absent (CI / fresh clone) — skip the drift check
    const liveSpec = JSON.parse(await readFile(specPath, 'utf8')) as {steps: Array<{selector?: string}>};
    const selectors = liveSpec.steps.map(step => step.selector ?? '');

    expect(selectors.some(selector => selector.includes(WIDGET_SELECTORS.input))).toBe(true);
    expect(selectors.some(selector => selector.includes(WIDGET_SELECTORS.send))).toBe(true);
    expect(WIDGET_SELECTORS.input).toBe('textarea[aria-label="Text message input"]');
    expect(WIDGET_SELECTORS.send).toBe('button[aria-label="Send"]');
  });
});

describe('shipped example scenarios (live + dual-mode)', () => {
  const examples = [
    'restaurant-trattoria',
    'dental-emergency',
    'salon-recovery',
    'ecommerce-returns',
    'medspa-consult',
    'hvac-dispatch',
  ];

  test.each(examples)('%s renders the real widget live and the deterministic widget when mocked', async name => {
    const {scenario: loaded} = await loadScenario(resolve(repoRoot, `examples/widget/${name}.scenario.json`));
    expect(loaded.turns.length).toBeGreaterThanOrEqual(2);
    expect(countTools(loaded)).toBeGreaterThanOrEqual(2);
    expect(loaded.live?.agentId).toMatch(/^agent_/v);

    // Live render embeds the real pinned CDN widget bound to the agent — no mock runtime.
    const liveHtml = renderWidgetPage(loaded);
    expect(liveHtml).toContain('@elevenlabs/convai-widget-embed@0.12.2');
    expect(liveHtml).toContain(`data-agent-id="${loaded.live!.agentId}"`);
    expect(liveHtml).not.toContain('id="convai-scenario"');
    // Per-widget branding + canned client tools are stamped for the runtime.
    expect(liveHtml).toContain('data-text-contents=');
    const toolNames = (loaded.live!.clientTools ?? []).map(tool => tool.name);
    expect(toolNames.length).toBeGreaterThanOrEqual(1);
    expect(liveHtml).toContain('data-client-tools=');
    for (const toolName of toolNames) {
      expect(liveHtml).toContain(toolName);
    }

    const flow = buildDemoFlow(loaded, `${name}.html`);
    expect(() => validateFlow(flow, name)).not.toThrow();
    expect(flow.metadata?.mode).toBe('live');
    expect(flow.metadata?.agentId).toBe(loaded.live!.agentId);
    // Live replies are non-deterministic → each turn is held by a pause, never waitForText.
    const replySteps = flow.steps.filter(step => step.label?.includes('reply'));
    expect(replySteps).toHaveLength(loaded.turns.length);
    expect(replySteps.every(step => step.action === 'pause')).toBe(true);

    // The SAME scenario in mock mode (live stripped) is fully deterministic.
    const mock: WidgetScenario = {...loaded};
    delete mock.live;
    expect(renderWidgetPage(mock)).toContain('id="convai-scenario"');
    const mockFlow = buildDemoFlow(mock, `${name}.html`);
    expect(mockFlow.steps.some(step => step.action === 'waitForText' && step.label?.startsWith('Agent reply'))).toBe(true);
    const replyTexts = loaded.turns.map(turn => lastSay(turn));
    expect(new Set(replyTexts).size).toBe(replyTexts.length);
  });

  test('agents.json snapshot covers seven distinct real agents (six verticals + wranngle scheduling)', async () => {
    const agents = JSON.parse(await readFile(resolve(repoRoot, 'examples/widget/agents.json'), 'utf8')) as Array<{id: string; agentId: string}>;
    expect(agents).toHaveLength(7);
    expect(new Set(agents.map(a => a.agentId)).size).toBe(7);
    expect(agents.every(a => a.agentId.startsWith('agent_'))).toBe(true);
    expect(agents.map(a => a.id)).toContain('wranngle');
  });

  // Drift coupling: two scenarios in the suite are the documented Cal.com
  // demonstration hosts — losing the real `book_demo` workspace tool id from
  // either silently breaks the integration story. The wranngle-scheduling
  // scenario is the DEDICATED real-booking demo (its persona Sage exists for
  // exactly this); medspa carries it as a secondary demonstration.
  test.each([
    ['medspa-consult.scenario.json'],
    ['wranngle-scheduling.scenario.json'],
  ])('%s attaches the real Cal.com book_demo workspace tool', async file => {
    const {scenario: loaded} = await loadScenario(resolve(repoRoot, `examples/widget/${file}`));
    expect(loaded.live?.workspaceToolIds ?? []).toContain('tool_4001kqxjgwp4ft2rwq21ze8fdpkp');
  });
});
