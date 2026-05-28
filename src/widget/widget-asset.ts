// Self-contained browser runtime for the deterministic <elevenlabs-convai> mock.
// Emitted inline into the generated page so the recorder loads a static file
// with no network, no API key, and no live-agent quota. The custom element
// exposes the real widget's text-mode selectors (see selectors.ts) and plays a
// scripted multi-turn conversation: streamed agent replies, tool-call cards, and
// visible on-page actions (toasts + an action board) — the "capabilities and
// tools" surface. The browser-runtime template literal below uses `${...}`
// interpolation for shared constants only; runtime JS itself avoids backticks
// and bare `${` so it nests inside the TS template untouched.

import {WIDGET_ARIA_LABELS} from './selectors.js';

// Pinned @elevenlabs/convai-widget-embed version. Bump here only; the
// LIVE_WIDGET_RUNTIME template below and tests import this constant.
export const ELEVENLABS_WIDGET_VERSION = '0.12.2';

export const WIDGET_RUNTIME = `
(function () {
  var dataEl = document.getElementById('convai-scenario');
  if (!dataEl) { return; }
  var scenario;
  try { scenario = JSON.parse(dataEl.textContent || '{}'); } catch (e) { return; }
  var business = scenario.business || {};
  var agent = scenario.agent || {name: 'Agent', greeting: 'Hi there!'};
  var turns = Array.isArray(scenario.turns) ? scenario.turns : [];
  var accent = business.accent || '#ff5f00';
  document.documentElement.style.setProperty('--ec-accent', accent);

  var T = {greet: 650, typing: 480, chunk: 14, chars: 2, tool: 880, toolReveal: 360, action: 360, beatGap: 260};

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text != null) { n.textContent = text; }
    return n;
  }
  function fmtArgs(args) {
    if (!args || typeof args !== 'object') { return ''; }
    return Object.keys(args).map(function (k) { return k + ': ' + JSON.stringify(args[k]); }).join('  ·  ');
  }
  function toastLayer() {
    var l = document.getElementById('ec-toasts');
    if (!l) { l = el('div'); l.id = 'ec-toasts'; document.body.appendChild(l); }
    return l;
  }
  function actionBoard() {
    var b = document.getElementById('ec-actionboard');
    if (!b) {
      b = el('aside'); b.id = 'ec-actionboard';
      var head = el('div', 'ec-ab-head');
      head.appendChild(el('span', 'ec-ab-dot'));
      head.appendChild(el('span', 'ec-ab-title', (agent.name || 'Agent') + ' handled'));
      b.appendChild(head);
      b.appendChild(el('ul', 'ec-ab-list'));
      document.body.appendChild(b);
    }
    return b;
  }

  class ConvAi extends HTMLElement {
    connectedCallback() {
      if (this._mounted) { return; }
      this._mounted = true;
      this.turnIndex = 0;
      this.busy = false;
      this.style.setProperty('--ec-accent', accent);
      this.appendChild(buildShell());
      this.transcript = this.querySelector('[data-transcript]');
      this.input = this.querySelector('textarea[aria-label="${WIDGET_ARIA_LABELS.input}"]');
      this.sendBtn = this.querySelector('button[aria-label="${WIDGET_ARIA_LABELS.send}"]');
      var self = this;
      this.sendBtn.addEventListener('click', function () { self.handleSend(); });
      this.input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self.handleSend(); }
      });
      setTimeout(function () { self.typingThenSay(agent.greeting); }, T.greet);
    }

    appendUser(text) {
      var row = el('div', 'ec-row ec-row--user');
      row.appendChild(el('div', 'ec-bubble ec-bubble--user', text));
      this.transcript.appendChild(row);
      this.scrollEnd();
    }

    showTyping() {
      var row = el('div', 'ec-row ec-row--agent');
      var dots = el('div', 'ec-bubble ec-bubble--agent ec-typing');
      dots.appendChild(el('span')); dots.appendChild(el('span')); dots.appendChild(el('span'));
      row.appendChild(dots);
      this.transcript.appendChild(row);
      this.scrollEnd();
      return row;
    }

    async typingThenSay(text) {
      var row = this.showTyping();
      await sleep(T.typing);
      row.innerHTML = '';
      var bubble = el('div', 'ec-bubble ec-bubble--agent');
      var span = el('span');
      bubble.appendChild(span);
      row.appendChild(bubble);
      for (var i = 0; i < text.length; i += T.chars) {
        span.textContent = text.slice(0, i + T.chars);
        this.scrollEnd();
        await sleep(T.chunk);
      }
      span.textContent = text;
      this.scrollEnd();
    }

    async toolCard(beat) {
      var card = el('div', 'ec-tool');
      var head = el('div', 'ec-tool-head');
      head.appendChild(el('span', 'ec-tool-ico', '⚙'));
      head.appendChild(el('code', 'ec-tool-name', beat.tool));
      card.appendChild(head);
      var argsText = fmtArgs(beat.args);
      if (argsText) { card.appendChild(el('div', 'ec-tool-args', argsText)); }
      var status = el('div', 'ec-tool-status ec-tool-status--run');
      status.appendChild(el('span', 'ec-spin'));
      status.appendChild(el('span', null, 'Running…'));
      card.appendChild(status);
      var row = el('div', 'ec-row ec-row--agent');
      row.appendChild(card);
      this.transcript.appendChild(row);
      this.scrollEnd();
      await sleep(T.tool);
      status.className = 'ec-tool-status ec-tool-status--ok';
      status.innerHTML = '';
      status.appendChild(el('span', 'ec-check', '✓'));
      status.appendChild(el('span', null, beat.result));
      this.scrollEnd();
      await sleep(T.toolReveal);
    }

    async hostAction(action) {
      if (action.type === 'toast') {
        var t = el('div', 'ec-toast');
        t.appendChild(el('span', 'ec-toast-ico', '✓'));
        t.appendChild(el('span', null, action.text));
        toastLayer().appendChild(t);
        requestAnimationFrame(function () { t.classList.add('ec-toast--in'); });
      } else if (action.type === 'summary') {
        var board = actionBoard();
        board.classList.add('ec-ab--in');
        var li = el('li', 'ec-ab-item', action.text);
        board.querySelector('.ec-ab-list').appendChild(li);
        requestAnimationFrame(function () { li.classList.add('ec-ab-item--in'); });
      }
      await sleep(T.action);
    }

    async playBeat(beat) {
      if (typeof beat.say === 'string') { await this.typingThenSay(beat.say); }
      else if (typeof beat.tool === 'string') { await this.toolCard(beat); }
      else if (beat.do) { await this.hostAction(beat.do); }
    }

    async handleSend() {
      if (this.busy) { return; }
      var text = (this.input.value || '').trim();
      if (!text) { return; }
      this.busy = true;
      this.sendBtn.disabled = true;
      this.appendUser(text);
      this.input.value = '';
      var turn = turns[this.turnIndex] || {reply: [{say: 'All set!'}]};
      this.turnIndex += 1;
      var beats = Array.isArray(turn.reply) ? turn.reply : [{say: 'All set!'}];
      for (var i = 0; i < beats.length; i += 1) {
        await this.playBeat(beats[i]);
        await sleep(T.beatGap);
      }
      this.busy = false;
      this.sendBtn.disabled = false;
    }

    scrollEnd() {
      if (this.transcript) { this.transcript.scrollTop = this.transcript.scrollHeight; }
    }
  }

  function buildShell() {
    var frag = document.createDocumentFragment();
    var panel = el('div', 'ec-panel');
    var header = el('div', 'ec-header');
    header.appendChild(el('div', 'ec-orb'));
    var meta = el('div', 'ec-meta');
    meta.appendChild(el('div', 'ec-name', agent.name || 'Agent'));
    meta.appendChild(el('div', 'ec-sub', agent.subtitle || ('Powered by ' + (business.name || 'ElevenLabs'))));
    header.appendChild(meta);
    var call = el('button', 'ec-call'); call.setAttribute('aria-label', 'Start a call'); call.setAttribute('type', 'button');
    call.textContent = '☎';
    header.appendChild(call);
    var transcript = el('div', 'ec-transcript'); transcript.setAttribute('data-transcript', '');
    var footer = el('div', 'ec-footer');
    var ta = el('textarea');
    ta.setAttribute('aria-label', '${WIDGET_ARIA_LABELS.input}');
    ta.setAttribute('rows', '1');
    ta.setAttribute('placeholder', 'Message ' + (agent.name || 'the agent') + '…');
    var send = el('button', 'ec-send');
    send.setAttribute('aria-label', '${WIDGET_ARIA_LABELS.send}');
    send.setAttribute('type', 'button');
    send.textContent = '↑';
    footer.appendChild(ta); footer.appendChild(send);
    panel.appendChild(header); panel.appendChild(transcript); panel.appendChild(footer);
    panel.appendChild(el('div', 'ec-brand', 'Conversational AI'));
    frag.appendChild(panel);
    return frag;
  }

  if (!customElements.get('elevenlabs-convai')) {
    customElements.define('elevenlabs-convai', ConvAi);
  }
})();
`;

// "Live" mode: mount the REAL ElevenLabs widget, a verbatim port of
// wranngle_com/demo-stages/widget.js. Reads agent-id + orb colors from the
// <body data-*> attributes render.ts stamps, loads the pinned CDN embed, keeps
// text-input on (so the recorder can type) with the call button live, and
// suppresses the account-billing "quota" toast inside the widget's shadow root
// so it never paints into a recording. No backticks / "${" so it nests below.
export const LIVE_WIDGET_RUNTIME = `
(function () {
  var body = document.body;
  var agentId = body.dataset.agentId;
  if (!agentId) { console.warn('[ui-demo-runner] no data-agent-id; live widget not mounted'); return; }
  var widget = document.createElement('elevenlabs-convai');
  widget.setAttribute('agent-id', agentId);
  widget.setAttribute('variant', 'expanded');
  widget.setAttribute('default-expanded', 'true');
  widget.setAttribute('text-input', 'true');
  widget.setAttribute('placement', 'bottom-right');
  if (body.dataset.orb1) { widget.setAttribute('avatar-orb-color-1', body.dataset.orb1); }
  if (body.dataset.orb2) { widget.setAttribute('avatar-orb-color-2', body.dataset.orb2); }
  if (body.dataset.textContents) { widget.setAttribute('text-contents', body.dataset.textContents); }
  if (body.dataset.linkHosts) { widget.setAttribute('markdown-link-allowed-hosts', body.dataset.linkHosts); }
  if (body.dataset.avatarImage) { widget.setAttribute('avatar-image-url', body.dataset.avatarImage); }
  // Register canned CLIENT tools: the agent's LLM decides to call e.g. book_table,
  // the call runs in this page (no backend) and returns the canned result, which
  // the agent then speaks — a real, visible tool invocation in the recording.
  if (body.dataset.clientTools) {
    var canned = null;
    try { canned = JSON.parse(body.dataset.clientTools); } catch (e) { canned = null; }
    if (canned) {
      widget.addEventListener('elevenlabs-convai:call', function (event) {
        var handlers = {};
        Object.keys(canned).forEach(function (name) {
          handlers[name] = function () { return canned[name]; };
        });
        event.detail.config.clientTools = handlers;
      });
    }
  }
  document.body.append(widget);
  var script = document.createElement('script');
  script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed@${ELEVENLABS_WIDGET_VERSION}';
  script.async = true;
  script.crossOrigin = 'anonymous';
  document.head.append(script);
  customElements.whenDefined('elevenlabs-convai').then(function () {
    var inject = function () {
      var host = document.querySelector('elevenlabs-convai');
      var root = host && host.shadowRoot;
      if (!root) { return false; }
      var style = document.createElement('style');
      style.textContent = '.text-base-error{display:none !important;}';
      root.append(style);
      return true;
    };
    if (!inject()) {
      var obs = new MutationObserver(function () { if (inject()) { obs.disconnect(); } });
      obs.observe(document.body, {childList: true, subtree: true});
    }
  });
})();
`;

export const WIDGET_STYLE = `
:root { --ec-accent: #ff5f00; }
elevenlabs-convai {
  position: fixed; right: 24px; bottom: 24px; z-index: 2147483000;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.ec-panel {
  width: 384px; max-height: 72vh; display: flex; flex-direction: column;
  background: #ffffff; color: #0b1220; border-radius: 18px; overflow: hidden;
  box-shadow: 0 24px 60px rgba(8, 15, 35, .28), 0 2px 8px rgba(8, 15, 35, .12);
  border: 1px solid rgba(8, 15, 35, .08);
}
.ec-header {
  display: flex; align-items: center; gap: 12px; padding: 14px 16px;
  background: linear-gradient(135deg, var(--ec-accent), rgba(8, 15, 35, .92));
  color: #fff;
}
.ec-orb {
  width: 34px; height: 34px; border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #fff, var(--ec-accent) 70%);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, .25); flex: 0 0 auto;
}
.ec-meta { flex: 1 1 auto; min-width: 0; }
.ec-name { font-weight: 700; font-size: 15px; line-height: 1.1; }
.ec-sub { font-size: 12px; opacity: .82; margin-top: 2px; }
.ec-call {
  width: 34px; height: 34px; border-radius: 50%; border: 0; cursor: pointer;
  background: rgba(255, 255, 255, .18); color: #fff; font-size: 15px;
}
.ec-transcript {
  flex: 1 1 auto; overflow-y: auto; padding: 16px; display: flex;
  flex-direction: column; gap: 10px; background: #f6f7fb; min-height: 280px;
}
.ec-row { display: flex; }
.ec-row--agent { justify-content: flex-start; }
.ec-row--user { justify-content: flex-end; }
.ec-bubble {
  max-width: 80%; padding: 10px 13px; border-radius: 14px; font-size: 14px;
  line-height: 1.45; white-space: pre-wrap; word-break: break-word;
}
.ec-bubble--agent { background: #fff; border: 1px solid rgba(8, 15, 35, .08); border-bottom-left-radius: 5px; }
.ec-bubble--user { background: var(--ec-accent); color: #0b1220; border-bottom-right-radius: 5px; font-weight: 500; }
.ec-typing { display: inline-flex; gap: 4px; align-items: center; }
.ec-typing span {
  width: 6px; height: 6px; border-radius: 50%; background: #9aa3b8;
  animation: ec-blink 1.1s infinite ease-in-out;
}
.ec-typing span:nth-child(2) { animation-delay: .18s; }
.ec-typing span:nth-child(3) { animation-delay: .36s; }
@keyframes ec-blink { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }
.ec-tool {
  max-width: 88%; background: #0f1729; color: #e7ecf6; border-radius: 12px;
  padding: 10px 12px; font-size: 12.5px; border: 1px solid rgba(120, 140, 190, .25);
}
.ec-tool-head { display: flex; align-items: center; gap: 7px; }
.ec-tool-ico { opacity: .85; }
.ec-tool-name { color: var(--ec-accent); font-weight: 700; font-size: 13px; }
.ec-tool-args { margin-top: 5px; color: #9fb0d4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; }
.ec-tool-status { margin-top: 7px; display: flex; align-items: center; gap: 7px; }
.ec-tool-status--run { color: #c3cce0; }
.ec-tool-status--ok { color: #7ee2a8; font-weight: 600; }
.ec-check { font-weight: 800; }
.ec-spin {
  width: 12px; height: 12px; border-radius: 50%; display: inline-block;
  border: 2px solid rgba(255, 255, 255, .25); border-top-color: var(--ec-accent);
  animation: ec-spin 0.7s linear infinite;
}
@keyframes ec-spin { to { transform: rotate(360deg); } }
.ec-footer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid rgba(8, 15, 35, .08); background: #fff; }
.ec-footer textarea {
  flex: 1 1 auto; resize: none; border: 1px solid rgba(8, 15, 35, .16); border-radius: 12px;
  padding: 10px 12px; font: inherit; font-size: 14px; max-height: 90px; outline: none;
}
.ec-footer textarea:focus { border-color: var(--ec-accent); }
.ec-send {
  flex: 0 0 auto; width: 40px; border: 0; border-radius: 12px; cursor: pointer;
  background: var(--ec-accent); color: #0b1220; font-size: 17px; font-weight: 800;
}
.ec-send:disabled { opacity: .5; }
.ec-brand { text-align: center; font-size: 10.5px; color: #99a2b6; padding: 4px 0 8px; letter-spacing: .02em; }

#ec-toasts {
  position: fixed; top: 22px; left: 50%; transform: translateX(-50%);
  z-index: 2147483600; display: flex; flex-direction: column; gap: 10px; align-items: center;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}
.ec-toast {
  display: flex; align-items: center; gap: 9px; background: #0f1729; color: #fff;
  padding: 11px 16px; border-radius: 999px; font-size: 13.5px; font-weight: 600;
  box-shadow: 0 12px 30px rgba(8, 15, 35, .35); border: 1px solid rgba(126, 226, 168, .3);
  opacity: 0; transform: translateY(-8px); transition: opacity .3s ease, transform .3s ease;
}
.ec-toast--in { opacity: 1; transform: translateY(0); }
.ec-toast-ico { color: #7ee2a8; font-weight: 800; }

#ec-actionboard {
  position: fixed; top: 22px; left: 22px; z-index: 2147483400; width: 248px;
  background: rgba(255, 255, 255, .96); border: 1px solid rgba(8, 15, 35, .1);
  border-radius: 14px; padding: 12px 14px; box-shadow: 0 16px 40px rgba(8, 15, 35, .16);
  opacity: 0; transform: translateX(-12px); transition: opacity .35s ease, transform .35s ease;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}
#ec-actionboard.ec-ab--in { opacity: 1; transform: translateX(0); }
.ec-ab-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.ec-ab-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ec-accent); box-shadow: 0 0 0 3px rgba(255, 95, 0, .18); }
.ec-ab-title { font-size: 12px; font-weight: 700; color: #0b1220; }
.ec-ab-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ec-ab-item {
  font-size: 12.5px; color: #29344d; padding-left: 18px; position: relative; line-height: 1.35;
  opacity: 0; transform: translateY(4px); transition: opacity .3s ease, transform .3s ease;
}
.ec-ab-item--in { opacity: 1; transform: translateY(0); }
.ec-ab-item::before { content: "✓"; position: absolute; left: 0; color: var(--ec-accent); font-weight: 800; }
`;
