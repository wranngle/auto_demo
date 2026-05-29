import type {DemoFlow, DemoStep} from '../types.js';
import {LIVE_WIDGET_RUNTIME, WIDGET_RUNTIME, WIDGET_STYLE} from './widget-asset.js';
import {WIDGET_SELECTORS, widgetSelector} from './selectors.js';
import {isSayBeat, type ScenarioTurn, type WidgetScenario} from './types.js';

const defaultViewport = {width: 1280, height: 800};
const defaultReplyWaitMs = 6500;

export function renderWidgetPage(scenario: WidgetScenario): string {
  const {business, agent, live} = scenario;
  const features = featureCards(business.vertical);
  const styleBlock = live === undefined ? WIDGET_STYLE : '';
  const bodyAttrs = live === undefined ? '' : liveBodyAttrs(scenario, live);
  const widgetBlock = live === undefined ? mockWidgetBlock(scenario) : `<script>${LIVE_WIDGET_RUNTIME}</script>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(business.name)}</title>
<style>
:root { color-scheme: light; --accent: ${business.accent}; }
* { box-sizing: border-box; }
body {
  margin: 0; color: #0b1220; background: #fbfcfe;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.site-nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 48px; border-bottom: 1px solid rgba(8, 15, 35, .07);
}
.brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 18px; letter-spacing: -.01em; }
.brand .mark { width: 24px; height: 24px; border-radius: 7px; background: linear-gradient(135deg, var(--accent), #0b1220); }
.nav-links { display: flex; gap: 26px; color: #44506b; font-size: 14px; font-weight: 500; }
.hero {
  display: grid; grid-template-columns: 1.1fr .9fr; gap: 40px; align-items: center;
  padding: 72px 48px; max-width: 1180px; margin: 0 auto;
}
.eyebrow { text-transform: uppercase; letter-spacing: .12em; font-size: 12px; font-weight: 700; color: var(--accent); }
.hero h1 { font-size: 52px; line-height: 1.04; letter-spacing: -.02em; margin: 14px 0 18px; }
.hero p { font-size: 18px; line-height: 1.6; color: #44506b; margin: 0 0 28px; max-width: 30em; }
.cta {
  display: inline-flex; align-items: center; gap: 8px; background: var(--accent); color: #0b1220;
  font-weight: 700; font-size: 15px; padding: 14px 22px; border-radius: 12px; text-decoration: none;
}
.hero-card {
  border-radius: 22px; min-height: 320px; padding: 28px;
  background: linear-gradient(150deg, color-mix(in srgb, var(--accent) 22%, #fff), #fff 70%);
  border: 1px solid rgba(8, 15, 35, .08); box-shadow: 0 30px 60px rgba(8, 15, 35, .1);
  display: flex; flex-direction: column; justify-content: flex-end;
}
.hero-card .tag { font-size: 13px; color: #44506b; }
.hero-card .big { font-size: 30px; font-weight: 800; letter-spacing: -.01em; margin-top: 6px; }
.features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; max-width: 1180px; margin: 0 auto; padding: 12px 48px 90px; }
.feature { background: #fff; border: 1px solid rgba(8, 15, 35, .08); border-radius: 16px; padding: 22px; }
.feature .dot { width: 30px; height: 30px; border-radius: 9px; background: color-mix(in srgb, var(--accent) 18%, #fff); margin-bottom: 12px; }
.feature h3 { margin: 0 0 6px; font-size: 16px; }
.feature p { margin: 0; font-size: 14px; color: #5a6680; line-height: 1.5; }
${styleBlock}
</style>
</head>
<body${bodyAttrs}>
<nav class="site-nav">
  <div class="brand"><span class="mark"></span>${esc(business.name)}</div>
  <div class="nav-links"><span>Home</span><span>Services</span><span>About</span><span>Contact</span></div>
</nav>
<header class="hero">
  <div>
    <div class="eyebrow">${esc(business.vertical ?? 'Now booking')}</div>
    <h1>${esc(business.tagline)}</h1>
    <p>${esc(heroCopy(business.vertical))}</p>
    <a class="cta" href="#">Get started →</a>
  </div>
  <div class="hero-card">
    <div class="tag">Talk to ${esc(agent.name)}, our front desk —</div>
    <div class="big">open 24/7.</div>
  </div>
</header>
<section class="features">
${features.map(card => `  <div class="feature"><div class="dot"></div><h3>${esc(card.title)}</h3><p>${esc(card.body)}</p></div>`).join('\n')}
</section>

${widgetBlock}
</body>
</html>
`;
}

function mockWidgetBlock(scenario: WidgetScenario): string {
  const scenarioJson = JSON.stringify(scenario).replaceAll('<', String.raw`\u003c`);
  return `<elevenlabs-convai agent-id="mock-${esc(scenario.name)}"></elevenlabs-convai>
<script type="application/json" id="convai-scenario">${scenarioJson}</script>
<script>${WIDGET_RUNTIME}</script>`;
}

// Per-widget branding + canned client tools, stamped as <body data-*> attributes
// the live runtime reads. text-contents brands the widget's on-screen labels;
// link-hosts allowlists markdown links so the agent's formatted replies are
// clickable; client-tools supplies the canned results for tools the agent calls.
function liveBodyAttrs(scenario: WidgetScenario, live: NonNullable<WidgetScenario['live']>): string {
  const {business, agent} = scenario;
  const textContents = {
    main_label: live.branding?.mainLabel ?? business.name,
    start_call: live.branding?.startCall ?? `Talk to ${agent.name}`,
    chatting_status: `Chatting with ${agent.name}`,
    listening_status: 'Listening…',
    speaking_status: `${agent.name} is replying…`,
  };
  const linkHosts = (live.linkHosts ?? [`${hostSlug(business.name)}.example.com`]).join(',');

  const attrs = [
    `data-agent-id="${esc(live.agentId)}"`,
    live.orb1 === undefined ? '' : `data-orb-1="${esc(live.orb1)}"`,
    live.orb2 === undefined ? '' : `data-orb-2="${esc(live.orb2)}"`,
    `data-text-contents="${esc(JSON.stringify(textContents))}"`,
    `data-link-hosts="${esc(linkHosts)}"`,
  ];

  if (live.clientTools !== undefined && live.clientTools.length > 0) {
    const canned: Record<string, unknown> = {};
    for (const tool of live.clientTools) {
      canned[tool.name] = tool.result;
    }

    attrs.push(`data-client-tools="${esc(JSON.stringify(canned))}"`);
  }

  return ` ${attrs.filter(Boolean).join(' ')}`;
}

function hostSlug(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z\d]+/gv, '') || 'demo';
}

export function buildDemoFlow(scenario: WidgetScenario, htmlFileName: string): DemoFlow {
  return scenario.live === undefined
    ? buildMockFlow(scenario, htmlFileName)
    : buildLiveFlow(scenario, htmlFileName, scenario.live);
}

// Cinematic shaping for the post-reply hold: bias toward longer holds on the
// first turn (orient the viewer) and the last turn (resolve the climax), plus
// a small bonus when the reply is rich (markdown reply >2 pieces OR the final
// `say` is long). Without this every turn holds the same window and the eye
// stops tracking after the first reply. Pure function — exported for the test
// contract that locks the shape; the runtime always sees clamped values.
export function replyHoldBonus(reply: WidgetScenario['turns'][number]['reply'], isFirst: boolean, isLast: boolean): number {
  let bonus = 0;
  if (isFirst) bonus += 400;
  if (isLast) bonus += 600;
  const richReply = reply.length > 2 || reply.some(piece =>
    typeof piece === 'object' && piece !== null && 'say' in piece && typeof piece.say === 'string' && piece.say.length > 80,
  );
  if (richReply) bonus += 500;
  return bonus;
}

// The widget is fixed bottom-right; zoom must anchor at its bottom-right corner
// (transform-origin = this point) so the panel scales up-and-left into the page
// and never clips off-frame. Centre-anchored zoom pushes the chat off the edges.
function widgetZoom(scenario: WidgetScenario, scale: number, durationMs: number, label: string): DemoStep {
  const viewport = scenario.viewport ?? defaultViewport;
  return {
    action: 'zoom',
    x: viewport.width - 40,
    y: viewport.height - 50,
    scale,
    durationMs,
    label,
  };
}

// Mock = scripted + deterministic: each turn syncs precisely on its final spoken
// line, so we can punch the camera in right after the reply lands.
function buildMockFlow(scenario: WidgetScenario, htmlFileName: string): DemoFlow {
  const input = widgetSelector('input');
  const send = widgetSelector('send');
  const steps: DemoStep[] = [
    {action: 'waitForText', text: scenario.business.tagline, label: 'Landing page ready'},
    {
      action: 'waitForSelector', selector: input, timeoutMs: 15_000, label: 'Widget mounted (text mode)',
    },
  ];

  if (scenario.intro !== undefined) {
    steps.push({
      action: 'caption', text: scenario.intro, ms: 1400, label: 'Intro beat',
    });
  }

  steps.push({action: 'pause', ms: 900, label: 'Agent greeting renders'});

  for (const [index, turn] of scenario.turns.entries()) {
    const n = index + 1;
    if (turn.caption !== undefined) {
      steps.push({
        action: 'caption', text: turn.caption, ms: 1300, label: `Turn ${n} caption`,
      });
    }

    steps.push(
      {action: 'click', selector: input, label: `Focus chat (turn ${n})`},
      {
        action: 'fill', selector: input, value: turn.user, label: `Type turn ${n}`,
      },
      {action: 'click', selector: send, label: `Send turn ${n}`},
      {
        action: 'waitForText', text: lastSay(turn), timeoutMs: 22_000, label: `Agent reply ${n}`,
      },
      widgetZoom(scenario, 1.18, 280, `Zoom to answer ${n}`),
      {action: 'pause', ms: 650, label: `Hold on answer ${n}`},
      {action: 'resetZoom', label: `Pull back ${n}`},
    );
  }

  appendOutro(steps, scenario);
  // Mock is deterministic and syncs on waitForText, so global speed-up is free.
  return baseFlow(scenario, htmlFileName, {mode: 'mock', speed: 1.35, steps});
}

// Live = the real ElevenLabs agent: replies are non-deterministic, so each turn
// holds a fixed window (live.replyWaitMs). We fill that window with motion — a
// zoom punch-in held while the answer streams, then a pull-back — so the wait
// reads as "watch the agent work," never a frozen frame. The CDN widget also
// needs longer to mount.
function buildLiveFlow(scenario: WidgetScenario, htmlFileName: string, live: NonNullable<WidgetScenario['live']>): DemoFlow {
  const input = widgetSelector('input');
  const send = widgetSelector('send');
  const replyWaitMs = live.replyWaitMs ?? defaultReplyWaitMs;
  const leadMs = 1500;
  const watchHoldMs = Math.max(1600, replyWaitMs - leadMs - 300);
  const steps: DemoStep[] = [
    {action: 'waitForText', text: scenario.business.tagline, label: 'Landing page ready'},
    {
      action: 'waitForSelector', selector: input, timeoutMs: 25_000, label: 'Widget mounted (text mode)',
    },
  ];

  if (scenario.intro !== undefined) {
    steps.push({
      action: 'caption', text: scenario.intro, ms: 1500, label: 'Intro beat',
    });
  }

  // The ElevenLabs widget in text-only mode lazy-connects: it does NOT render
  // the agent's first_message as visible transcript on mount — the WebSocket
  // opens when the first user message is sent, so the header reads "Connecting…"
  // during turn 1 and that is expected, not a bug. (An earlier attempt to gate
  // on greeting text always timed out and broke recording.) Hold a brief beat
  // so the widget finishes mounting before we type.
  steps.push({action: 'pause', ms: 1800, label: 'Widget settles before first turn'});

  const turnCount = scenario.turns.length;
  for (const [index, turn] of scenario.turns.entries()) {
    const n = index + 1;
    const isFirst = index === 0;
    const isLast = index === turnCount - 1;
    // Per-turn pacing — uniform beats read as a metronome. First turn gets
    // an extra orient pause + slower caption (viewer registers the
    // business + question); last turn gets a longer post-reply hold so
    // the climax resolves; middle turns ride the established rhythm.
    const captionMs = isFirst ? 1500 : 1300;
    const composeBreathMs = isLast ? 500 : 350; // Anticipation before hitting Send
    const holdBonusMs = replyHoldBonus(turn.reply, isFirst, isLast);

    if (turn.caption !== undefined) {
      steps.push({
        action: 'caption', text: turn.caption, ms: captionMs, label: `Turn ${n} caption`,
      });
    }

    steps.push(
      {action: 'click', selector: input, label: `Focus chat (turn ${n})`},
      {
        action: 'fill', selector: input, value: turn.user, label: `Type turn ${n}`,
      },
      // Compose breath: a person finishes typing and hesitates before sending.
      // Without it, type→send is robotic — this single beat is what reads as
      // "deliberate," especially on the final turn where commitment matters.
      {action: 'pause', ms: composeBreathMs, label: `Compose breath (turn ${n})`},
      {action: 'click', selector: send, label: `Send turn ${n}`},
      {action: 'pause', ms: leadMs, label: `Live agent reply ${n}`},
      widgetZoom(scenario, 1.18, 300, `Zoom to answer ${n}`),
      {action: 'pause', ms: watchHoldMs + holdBonusMs, label: `Hold on answer ${n}`},
      {action: 'resetZoom', label: `Pull back ${n}`},
    );
  }

  appendOutro(steps, scenario);
  // Live runs at real-time speed (1.0): the runner divides every wait by speed,
  // and the reply windows must stay wall-clock so the real agent can answer.
  // Snappiness comes from short caption/cursor times + the zoom motion, not speed.
  return baseFlow(scenario, htmlFileName, {
    mode: 'live', agentId: live.agentId, speed: 1, steps,
  });
}

function appendOutro(steps: DemoStep[], scenario: WidgetScenario): void {
  if (scenario.outro !== undefined) {
    steps.push({
      action: 'caption', text: scenario.outro, ms: 1800, label: 'Outro beat',
    });
  }

  steps.push(
    {action: 'resetZoom', label: 'Pull back to full frame'},
    {action: 'pause', ms: 1100, label: 'Hold final frame'},
    {action: 'screenshot', name: scenario.name, label: 'Poster frame'},
  );
}

type FlowBuild = {
  mode: 'mock' | 'live';
  speed: number;
  agentId?: string;
  steps: DemoStep[];
};

function baseFlow(scenario: WidgetScenario, htmlFileName: string, build: FlowBuild): DemoFlow {
  const viewport = scenario.viewport ?? defaultViewport;
  return {
    name: scenario.name,
    startUrl: `./${htmlFileName}`,
    viewport,
    record: {enabled: true, size: viewport},
    timing: {
      speed: build.speed, moveMs: 170, clickPauseMs: 150, fillPauseMs: 25, zoomMs: 320,
    },
    polish: {
      cursor: {style: 'modern', accentColor: scenario.business.accent},
      actionRail: {enabled: false},
      captions: {enabled: true, position: 'bottom'},
      zoom: {defaultScale: 1.16, durationMs: 320, resetMs: 280},
    },
    metadata: {
      source: build.mode === 'live'
        ? 'ui-demo-runner widget (real ElevenLabs agent)'
        : 'ui-demo-runner widget (deterministic ElevenLabs mock)',
      mode: build.mode,
      rootSelector: WIDGET_SELECTORS.root,
      ...(build.agentId === undefined ? {} : {agentId: build.agentId}),
      ...(scenario.capability === undefined ? {} : {capability: scenario.capability}),
      ...(scenario.business.vertical === undefined ? {} : {vertical: scenario.business.vertical}),
    },
    steps: build.steps,
  };
}

export function lastSay(turn: ScenarioTurn): string {
  for (let i = turn.reply.length - 1; i >= 0; i -= 1) {
    const beat = turn.reply[i]!;
    if (isSayBeat(beat)) {
      return beat.say;
    }
  }

  throw new Error(`turn "${turn.user}" has no {say} beat to sync the recorder on`);
}

export function countTools(scenario: WidgetScenario): number {
  return scenario.turns.reduce(
    (total, turn) => total + turn.reply.filter(beat => Object.hasOwn(beat, 'tool')).length,
    0,
  );
}

function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

type FeatureCard = {title: string; body: string};

function heroCopy(vertical: string | undefined): string {
  switch (vertical) {
    case 'restaurant': {
      return 'Reservations, waitlists, and special requests — answered the moment a guest reaches out, day or night.';
    }

    case 'dental': {
      return 'Book cleanings, triage emergencies, and check coverage without anyone waiting on hold.';
    }

    case 'salon': {
      return 'Rebook regulars, recover service issues, and pull every client formula on file automatically.';
    }

    case 'ecommerce': {
      return 'Track orders, start returns, and resolve refunds in one conversation — no ticket queue.';
    }

    case 'medspa': {
      return 'Book consults, quote treatment packages, and reschedule with care — discreet, polished, and on the clock 24/7.';
    }

    case 'home-services': {
      return 'Dispatch no-heat and no-cool emergencies, schedule maintenance, and quote service calls without a callback queue.';
    }

    case 'saas': {
      return 'Book qualified demos straight to your calendar — no forms, no back-and-forth, no SDR triage tax.';
    }

    default: {
      return 'A conversational AI front desk that books, looks things up, and gets work done on your behalf.';
    }
  }
}

function featureCards(vertical: string | undefined): FeatureCard[] {
  switch (vertical) {
    case 'restaurant': {
      return [
        {title: 'Live availability', body: 'Checks the floor plan in real time before it ever offers a table.'},
        {title: 'Modify on the fly', body: 'Resize parties, log dietary notes, and move times mid-conversation.'},
        {title: 'Confirmations', body: 'Sends a text confirmation the second a booking locks.'},
      ];
    }

    case 'dental': {
      return [
        {title: 'Emergency triage', body: 'Prioritizes urgent cases into same-day openings automatically.'},
        {title: 'Insurance lookup', body: 'Verifies coverage and estimates patient cost before booking.'},
        {title: 'Reminders', body: 'Confirms appointments and follows up so chairs stay full.'},
      ];
    }

    case 'salon': {
      return [
        {title: 'Service recovery', body: 'Turns a complaint into a credit and a rebook without a manager.'},
        {title: 'Formula on file', body: 'Pulls the exact color formula so every redo matches.'},
        {title: 'Smart rebooking', body: 'Finds the right stylist and time in one pass.'},
      ];
    }

    case 'ecommerce': {
      return [
        {title: 'Order tracking', body: 'Looks up live shipping status from the order number.'},
        {title: 'Self-serve returns', body: 'Generates a prepaid label and starts the return instantly.'},
        {title: 'Instant refunds', body: 'Issues store credit or refunds within policy, no escalation.'},
      ];
    }

    case 'medspa': {
      return [
        {title: 'Discreet booking', body: 'Schedules consults and treatments with a polished, on-brand voice.'},
        {title: 'Package pricing', body: 'Quotes memberships and treatment packages from current pricing.'},
        {title: 'Safe handoff', body: 'Never gives medical advice — escalates clinical questions to a provider.'},
      ];
    }

    case 'home-services': {
      return [
        {title: 'Emergency dispatch', body: 'Routes no-heat / no-cool calls to the next available technician on the spot.'},
        {title: 'Live arrival windows', body: 'Confirms a specific dispatch window before ending the call.'},
        {title: 'Service-call quotes', body: 'Gives a ballpark price up front so callers know what to expect.'},
      ];
    }

    case 'saas': {
      return [
        {title: 'Direct-to-calendar', body: 'Books a demo on Cal.com the moment the caller has time, email, and time zone.'},
        {title: 'No-form qualification', body: 'Captures intent in conversation — no marketing form, no SDR queue.'},
        {title: 'Confirmation in inbox', body: 'Cal.com sends the calendar invite the second the booking confirms.'},
      ];
    }

    default: {
      return [
        {title: 'Answers instantly', body: 'No hold music, no missed calls, no after-hours gap.'},
        {title: 'Uses your tools', body: 'Looks up records and takes action through connected systems.'},
        {title: 'Hands off cleanly', body: 'Escalates to a human with full context when it should.'},
      ];
    }
  }
}
