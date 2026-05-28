import {existsSync} from 'node:fs';
import {mkdtemp, readdir, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {join, resolve} from 'node:path';
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

  // Brand-rename drift coupling (PR #18 swept auto_demo → ui-demo-runner
  // across user-visible surfaces, including metadata.source on every widget
  // flow). The render.ts:305-307 strings ship in every generated
  // .demo.json file — a regression here would publish auto_demo-tagged
  // flows to consumers. svg.test.ts has the parallel guard on the
  // animated-SVG aria-label.
  test('metadata.source carries the ui-demo-runner brand per mode (mock + live)', () => {
    const mockFlow = buildDemoFlow(scenario(), 'x.html');
    expect(mockFlow.metadata?.source).toBe('ui-demo-runner widget (deterministic ElevenLabs mock)');

    const liveFlow = buildDemoFlow(scenario({live: {agentId: 'agent_test'}}), 'x.html');
    expect(liveFlow.metadata?.source).toBe('ui-demo-runner widget (real ElevenLabs agent)');
  });

  // src/widget/render.ts:310-312 conditionally spreads `capability` and
  // `vertical` into metadata: present in the scenario → field included,
  // absent → field omitted (not just `undefined`). A refactor that flips
  // to unconditional spread or `null`-filling would change the wire shape
  // for consumers parsing the metadata; lock both branches.
  test('metadata.capability and metadata.vertical follow the conditional-spread contract', () => {
    // Has vertical (from scenario fixture), no capability.
    const baseFlow = buildDemoFlow(scenario(), 'x.html');
    expect(baseFlow.metadata).not.toHaveProperty('capability');
    expect(baseFlow.metadata?.vertical).toBe('ecommerce');

    // Both present.
    const fullFlow = buildDemoFlow(scenario({
      capability: 'booking + reschedule',
      business: {name: 'B', tagline: 't', accent: '#aa3344', vertical: 'salon'},
    }), 'x.html');
    expect(fullFlow.metadata?.capability).toBe('booking + reschedule');
    expect(fullFlow.metadata?.vertical).toBe('salon');

    // Both absent (business has no vertical, scenario has no capability).
    const bareFlow = buildDemoFlow(scenario({business: {name: 'B', tagline: 't', accent: '#aa3344'}}), 'x.html');
    expect(bareFlow.metadata).not.toHaveProperty('capability');
    expect(bareFlow.metadata).not.toHaveProperty('vertical');
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

  // scenario.ts:186 enforces a non-empty reply array — both forms (omitted and
  // empty []) hit the same throw. A turn with no beats would produce a flow
  // with a Send step but no waitForText, freezing the recorder; lock the error
  // path so a refactor that loosens the check fails CI before publishing a
  // broken scenario contract.
  test('rejects a turn with an empty reply array', () => {
    expect(() => validateScenario({...base, turns: [{user: 'u', reply: []}]}))
      .toThrow(/reply.*non-empty array of beats/v);
  });

  test('rejects a turn that omits the reply field entirely', () => {
    expect(() => validateScenario({...base, turns: [{user: 'u'}]}))
      .toThrow(/reply.*non-empty array of beats/v);
  });

  // scenario.ts:205-206: a {say: ''} beat passes the string-type check but
  // fails the `nonEmpty` guard. Authors who paste an unfilled template (empty
  // string placeholder) get a clear error instead of a silent zero-length
  // waitForText that would hang the recorder.
  test('rejects a say beat whose text is empty / whitespace', () => {
    expect(() => validateScenario({...base, turns: [{user: 'u', reply: [{say: ''}]}]}))
      .toThrow(/say.*non-empty string/v);
    expect(() => validateScenario({...base, turns: [{user: 'u', reply: [{say: '   '}]}]}))
      .toThrow(/say.*non-empty string/v);
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

  // The linkHosts validator (scenario.ts:113-119) has two reject branches:
  // (a) value is not an array, (b) value is an array but some element is not
  // a string. linkHosts is a documented user-facing field — see
  // examples/widget/README.md — so locking the validator keeps the
  // markdown-link-allowed-hosts contract honest.
  test('rejects linkHosts when not an array (string instead)', () => {
    expect(() => validateScenario({...base, live: {agentId: 'agent_x', linkHosts: 'acme.example.com'}}))
      .toThrow(/linkHosts.*string\[\]/v);
  });

  test('rejects linkHosts when an element is not a string', () => {
    expect(() => validateScenario({...base, live: {agentId: 'agent_x', linkHosts: ['acme.example.com', 42]}}))
      .toThrow(/linkHosts.*string\[\]/v);
  });

  // optionalViewport enforces width >= 320 and height >= 240 — a sane lower
  // bound for recordings (anything smaller and the cursor overlay + caption
  // strip stop being readable). Locks those thresholds so a refactor that
  // drops the bound or flips it to a non-integer check fails CI.
  test('rejects a viewport narrower than 320px', () => {
    expect(() => validateScenario({...base, viewport: {width: 100, height: 240}}))
      .toThrow(/viewport\.width/v);
  });

  test('rejects a viewport shorter than 240px', () => {
    expect(() => validateScenario({...base, viewport: {width: 320, height: 100}}))
      .toThrow(/viewport\.height/v);
  });

  // loadScenario() is the file-IO entry point (scenario.ts:27-39) and wraps a
  // JSON.parse failure with a helpful error: "Invalid JSON in <abs-path>: ...".
  // This was the only file-IO throw left untested — a refactor that swallowed
  // the catch or stripped the cause would slip past CI.
  test('loadScenario surfaces malformed JSON with the file path in the error message', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ui-demo-scenario-malformed-'));
    const path = join(dir, 'broken.scenario.json');
    await writeFile(path, '{ not really json ,,,');

    await expect(loadScenario(path)).rejects.toThrow(/Invalid JSON in.*broken\.scenario\.json/v);
  });
});

// The live runtime registers each client tool as `() => canned[name]`
// (widget-asset.ts), so the page's `data-client-tools` payload MUST be a map of
// tool name → that tool's exact canned `result`. If render.ts ever emitted the
// whole tool object (or keyed it wrong), the real agent would invoke the tool
// and receive garbage back. This pins the name→result contract.
describe('live data-client-tools payload shape', () => {
  function clientToolsPayload(html: string): Record<string, unknown> {
    const match = /data-client-tools="([^"]*)"/v.exec(html);
    expect(match).not.toBeNull();
    // Decode &amp; LAST so an escaped entity like \`&amp;lt;\` (the encoding of
    // literal text "&lt;") survives as "&lt;" rather than collapsing to "<".
    const decoded = match![1]!.replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
    return JSON.parse(decoded) as Record<string, unknown>;
  }

  test('maps each tool name to its exact canned result, with no metadata leakage', () => {
    const scenario = validateScenario({
      name: 'acme', business: {name: 'Acme', tagline: 'On time', accent: '#ff5f00'},
      agent: {name: 'Ada', greeting: 'hi'},
      live: {
        agentId: 'agent_x',
        clientTools: [
          {name: 'lookup_order', description: 'look up an order', params: [{name: 'id', description: 'order id', required: true}], result: {status: 'shipped', eta: 'tomorrow'}},
          {name: 'issue_refund', description: 'refund it', result: {refund_id: 'RMA-1', amount: '$10'}},
        ],
      },
      turns: [{user: 'where is my order?', reply: [{say: 'let me check'}]}],
    });

    const payload = clientToolsPayload(renderWidgetPage(scenario));
    expect(Object.keys(payload).sort()).toEqual(['issue_refund', 'lookup_order']);
    expect(payload.lookup_order).toEqual({status: 'shipped', eta: 'tomorrow'});
    expect(payload.issue_refund).toEqual({refund_id: 'RMA-1', amount: '$10'});
    // The result is the WHOLE payload for that tool — no description/params/name leaked in.
    expect(payload.lookup_order).not.toHaveProperty('description');
    expect(payload.lookup_order).not.toHaveProperty('params');
    expect(payload.lookup_order).not.toHaveProperty('name');
  });

  test('omits data-client-tools entirely when a live scenario declares none', () => {
    const scenario = validateScenario({
      name: 'acme', business: {name: 'Acme', tagline: 'On time', accent: '#ff5f00'},
      agent: {name: 'Ada', greeting: 'hi'},
      live: {agentId: 'agent_x'},
      turns: [{user: 'hi', reply: [{say: 'hello'}]}],
    });
    expect(renderWidgetPage(scenario)).not.toContain('data-client-tools=');
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

  // Drift coupling: every scenario file's `live.agentId` must be a real entry in
  // agents.json. Catches the silent regression where someone adds a scenario
  // pointing at a bogus/typo'd agent id, or removes an agent from the snapshot
  // without removing the scenario that referenced it. The snapshot is the
  // source of truth (provision-agents.mjs writes it from the live ElevenLabs
  // account); scenarios are downstream.
  test('every scenario.live.agentId is present in agents.json', async () => {
    const agents = JSON.parse(await readFile(resolve(repoRoot, 'examples/widget/agents.json'), 'utf8')) as Array<{agentId: string}>;
    const known = new Set(agents.map(a => a.agentId));
    const dir = resolve(repoRoot, 'examples/widget');
    const files = (await readdir(dir)).filter((name: string) => name.endsWith('.scenario.json'));
    expect(files.length).toBeGreaterThanOrEqual(7);
    for (const name of files) {
      // eslint-disable-next-line no-await-in-loop
      const {scenario} = await loadScenario(resolve(dir, name));
      if (scenario.live?.agentId !== undefined) {
        expect(known, `${name} references agent ${scenario.live.agentId} which is not in agents.json`).toContain(scenario.live.agentId);
      }
    }
  });

  // Reverse direction of the test above: every agents.json entry must be
  // referenced by exactly one scenario. Catches the silent regression where
  // someone deletes a *.scenario.json but forgets to remove the agent from the
  // snapshot, leaving a ghost agent that consumes ElevenLabs quota and confuses
  // future readers.
  test('agents.json has no orphans: every entry is referenced by some scenario.live.agentId', async () => {
    const agents = JSON.parse(await readFile(resolve(repoRoot, 'examples/widget/agents.json'), 'utf8')) as Array<{agentId: string}>;
    const dir = resolve(repoRoot, 'examples/widget');
    const files = (await readdir(dir)).filter((name: string) => name.endsWith('.scenario.json'));
    const referenced = new Set<string>();
    for (const name of files) {
      // eslint-disable-next-line no-await-in-loop
      const {scenario} = await loadScenario(resolve(dir, name));
      if (scenario.live?.agentId !== undefined) {
        referenced.add(scenario.live.agentId);
      }
    }

    const orphans = agents.filter(a => !referenced.has(a.agentId));
    expect(orphans, `agents.json carries ${orphans.length} unreferenced entries: ${orphans.map(a => a.agentId).join(', ')}`).toEqual([]);
  });

  // Drift coupling: wranngle-scheduling is the SINGLE canonical Cal.com
  // demonstration host (persona Sage exists for exactly this). The other six
  // scenarios stay on canned client tools so their recordings never create
  // real bookings — that boundary is part of the demo contract. Losing the
  // real workspace tool id from wranngle silently breaks the integration story.
  test('wranngle-scheduling attaches the real Cal.com book_demo workspace tool', async () => {
    const {scenario: loaded} = await loadScenario(resolve(repoRoot, 'examples/widget/wranngle-scheduling.scenario.json'));
    expect(loaded.live?.workspaceToolIds ?? []).toContain('tool_4001kqxjgwp4ft2rwq21ze8fdpkp');
  });

  // Internal-consistency drift inside wranngle-scheduling: the user-supplied
  // booking time, the tool args.start, and the confirmation reply must all
  // name the same day-of-week. The pre-fix scenario had user="Wednesday May
  // 28th" with tool/reply="Tuesday" — a silent UX regression in the recording
  // because the confirmation contradicts the user's request. Lock the
  // coupling so a future copy-edit that touches one without the others fails.
  test('wranngle-scheduling: user, tool args.start, and confirmation reply all reference the same day-of-week', async () => {
    const {scenario: loaded} = await loadScenario(resolve(repoRoot, 'examples/widget/wranngle-scheduling.scenario.json'));
    const dayPattern = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/v;
    const bookingTurn = loaded.turns.find(turn => turn.reply.some(beat => 'tool' in beat && beat.tool === 'book_demo'));
    expect(bookingTurn, 'expected a turn with a book_demo tool call').toBeDefined();

    const userDay = dayPattern.exec(bookingTurn!.user)?.[1];
    const toolBeat = bookingTurn!.reply.find(beat => 'tool' in beat && beat.tool === 'book_demo') as {args?: {start?: string}};
    const toolDay = dayPattern.exec(String(toolBeat?.args?.start ?? ''))?.[1];
    const confirmBeat = [...bookingTurn!.reply].reverse().find(beat => 'say' in beat) as {say: string};
    const confirmDay = dayPattern.exec(confirmBeat.say)?.[1];

    expect(userDay, 'user message must name a day-of-week').toBeDefined();
    expect(toolDay, `book_demo args.start must name the same day as the user (${userDay})`).toBe(userDay);
    expect(confirmDay, `confirmation reply must name the same day as the user (${userDay})`).toBe(userDay);
  });

  // wranngle-scheduling is structurally distinct from the six vertical demos
  // (real workspace tool, no canned clientTools, fewer turns), so it can't ride
  // the vertical test.each above. This guards its own load/render/flow contract
  // so a malformed edit to the dedicated Cal.com scenario fails loudly.
  test('wranngle-scheduling loads, renders a valid live widget, and yields a schema-valid flow', async () => {
    const {scenario: loaded} = await loadScenario(resolve(repoRoot, 'examples/widget/wranngle-scheduling.scenario.json'));
    expect(loaded.live?.agentId).toMatch(/^agent_/v);

    const liveHtml = renderWidgetPage(loaded);
    expect(liveHtml).toContain('@elevenlabs/convai-widget-embed@0.12.2');
    expect(liveHtml).toContain(`data-agent-id="${loaded.live!.agentId}"`);
    // Real-backend scenario: it uses workspaceToolIds, NOT canned clientTools,
    // so the page must NOT stamp a data-client-tools payload.
    expect(loaded.live?.clientTools ?? []).toHaveLength(0);
    expect(liveHtml).not.toContain('data-client-tools=');

    const flow = buildDemoFlow(loaded, 'wranngle-scheduling.html');
    expect(() => validateFlow(flow, 'wranngle-scheduling')).not.toThrow();
    expect(flow.metadata?.mode).toBe('live');
    expect(flow.metadata?.agentId).toBe(loaded.live!.agentId);
  });

  // Doctrine drift: every shipped scenario's `business.vertical` MUST map to a
  // non-default branch in render.ts's heroCopy + featureCards switches.
  // Pre-fix, medspa / home-services / saas all fell through to the generic
  // "A conversational AI front desk that books, looks things up…" copy —
  // the recordings for those three businesses showed landing pages that
  // didn't match what the agent does. This test locks the coupling so any
  // new vertical added to a scenario fails CI until render.ts is extended.
  test('doctrine drift: every shipped scenario vertical renders tailored hero copy (no fall-through to default)', async () => {
    const defaultHero = 'A conversational AI front desk that books, looks things up, and gets work done on your behalf.';
    const defaultFeatures = ['Answers instantly', 'Uses your tools', 'Hands off cleanly'];
    const dir = resolve(repoRoot, 'examples/widget');
    const files = (await readdir(dir)).filter((name: string) => name.endsWith('.scenario.json'));
    for (const name of files) {
      // eslint-disable-next-line no-await-in-loop
      const {scenario: loaded} = await loadScenario(resolve(dir, name));
      if (loaded.business.vertical === undefined) continue;
      const html = renderWidgetPage(loaded);
      expect(html, `${name} (vertical=${loaded.business.vertical}) falls through to the generic hero copy`).not.toContain(defaultHero);
      for (const phrase of defaultFeatures) {
        expect(html, `${name} (vertical=${loaded.business.vertical}) renders generic feature card "${phrase}"`).not.toContain(`<h3>${phrase}</h3>`);
      }
    }
  });

  test('the six vertical demos carry NO workspace tool ids (real-action boundary)', async () => {
    const verticals = ['restaurant-trattoria', 'dental-emergency', 'salon-recovery', 'ecommerce-returns', 'medspa-consult', 'hvac-dispatch'];
    for (const name of verticals) {
      // eslint-disable-next-line no-await-in-loop
      const {scenario: loaded} = await loadScenario(resolve(repoRoot, `examples/widget/${name}.scenario.json`));
      expect(loaded.live?.workspaceToolIds ?? [], `${name} must not attach a workspace tool`).toEqual([]);
    }
  });

  // Doctrine drift: the scenario count lives in three places — *.scenario.json
  // files on disk, agents.json, and digit-count phrases in README.md. PR #38
  // had to fix "6 demo agents" / "all 6" after a 7th was added; this couples
  // them so the next renumber fails CI instead of shipping stale prose.
  test('doctrine drift: README digit-counts and agents.json mirror the on-disk scenario count', async () => {
    const dir = resolve(repoRoot, 'examples/widget');
    const scenarios = (await readdir(dir)).filter((name: string) => name.endsWith('.scenario.json'));
    const agents = JSON.parse(await readFile(resolve(dir, 'agents.json'), 'utf8')) as unknown[];
    const count = scenarios.length;

    expect(agents, 'agents.json must mirror the scenarios-on-disk count').toHaveLength(count);

    const readme = await readFile(resolve(repoRoot, 'README.md'), 'utf8');
    const patterns = [/(\d+)\s+demo agents/g, /record all\s+(\d+)/g];
    for (const pattern of patterns) {
      for (const match of readme.matchAll(pattern)) {
        expect(Number(match[1]), `README phrase "${match[0]}" must match scenario count ${count}`).toBe(count);
      }
    }
  });

  // Doctrine drift: the CHANGELOG advertises the bats suite shape — "Bats
  // shell-integration suite (N cases across M files)". Both numbers drift the
  // moment someone adds/removes a .bats file or a @test inside one. Couple the
  // claim to the on-disk reality so a future PR that adds a 34th bats case fails
  // CI until the CHANGELOG number catches up.
  test('doctrine drift: CHANGELOG bats-suite count phrase matches tests/*.bats on disk', async () => {
    const batsFiles = (await readdir(resolve(repoRoot, 'tests'))).filter((name: string) => name.endsWith('.bats')).sort();
    let cases = 0;
    for (const f of batsFiles) {
      // eslint-disable-next-line no-await-in-loop
      const raw = await readFile(resolve(repoRoot, 'tests', f), 'utf8');
      cases += (raw.match(/^@test /gmu) ?? []).length;
    }

    const changelog = await readFile(resolve(repoRoot, 'CHANGELOG.md'), 'utf8');
    const match = /Bats shell-integration suite \((\d+)\s+cases across\s+(\d+)\s+files/u.exec(changelog);
    expect(match, 'CHANGELOG must contain the "Bats shell-integration suite (N cases across M files)" phrase').not.toBeNull();
    expect(Number(match![1]), `CHANGELOG claims ${match![1]} bats cases; tests/*.bats has ${cases}`).toBe(cases);
    expect(Number(match![2]), `CHANGELOG claims ${match![2]} bats files; tests/*.bats has ${batsFiles.length}`).toBe(batsFiles.length);
  });
});
