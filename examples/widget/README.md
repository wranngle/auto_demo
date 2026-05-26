# Widget scenarios

Seven `*.scenario.json` files that drive the `ui-demo-runner widget` subcommand.
Each one compiles into (a) a self-contained business landing page with an
`<elevenlabs-convai>` chat widget mounted and (b) the matching `.demo.json` flow
that drives a multi-turn conversation. `widget --run` records it.

## The shipped seven

| Scenario | Vertical | What the agent does |
|---|---|---|
| `restaurant-trattoria` | restaurant | books a patio table, resizes the party, logs a dietary note, sends an SMS confirmation |
| `dental-emergency` | dental | triages a cracked filling as urgent, books a same-day slot |
| `salon-recovery` | salon | applies a color guarantee, pulls the formula on file, rebooks at no charge |
| `ecommerce-returns` | ecommerce | tracks a delayed order, starts a return, refunds to card |
| `medspa-consult` | medspa | books a consult, quotes package + membership pricing |
| `hvac-dispatch` | home-services | triages an emergency, gives a ballpark price, dispatches the technician |
| `wranngle-scheduling` | saas (real Cal.com) | books a real Cal.com demo via the workspace `book_demo` webhook |

`agents.json` is the snapshot of the seven ElevenLabs agents that back them
(written by `scripts/provision-agents.mjs`).

## Real-action boundary

Six vertical scenarios use only **canned browser-side `clientTools`** — their
recordings have **no backend, no side effects**, fully repeatable. The agent
visibly invokes a tool, the page returns the canned result, the agent speaks it
as rich markdown.

`wranngle-scheduling` is the **single** scenario that hits a real backend via
`live.workspaceToolIds: ["tool_4001..."]` (the workspace native Cal.com
`book_demo` webhook). Re-recording it creates a real Cal.com booking. That
boundary is locked by a vitest contract (see `tests/widget.test.ts`).

## Authoring a new scenario

Minimal shape:

```json
{
  "name": "acme-co",
  "business": {"name": "Acme Co.", "tagline": "We ship on time", "accent": "#ff5f00", "vertical": "ecommerce"},
  "agent":    {"name": "Ada", "greeting": "Hi, I can help."},
  "live":     {"agentId": "agent_...", "orb1": "#ff5f00", "orb2": "#7c1d1d"},
  "turns": [
    {
      "user": "Where is order 42?",
      "reply": [
        {"say": "Let me check."},
        {"tool": "lookup_order", "args": {"order": 42}, "result": "In transit"},
        {"say": "Arriving tomorrow."},
        {"do": {"type": "summary", "text": "Order 42 · arriving tomorrow"}}
      ]
    }
  ]
}
```

- **Drop the `live` block** → mock mode (deterministic, no API key required).
  The scripted `reply` beats render literally: `say` streams text, `tool`
  renders a tool-call card, `do` fires a toast or summary on the host page.
- **Keep the `live` block** → live mode against the real ElevenLabs agent. The
  scripted `reply` is the intended script (and powers the mock view), but the
  real agent improvises — the recorder only types `user` turns and waits.

`live.branding.{mainLabel,startCall}` set widget labels per business;
`live.linkHosts` allowlists hosts so markdown links in agent replies are
clickable; `live.clientTools[]` declares canned in-page tools (`name`,
`description`, `params`, `result`) that the agent's LLM can invoke;
`live.workspaceToolIds[]` attaches existing ElevenLabs workspace tool ids by
reference — those take **real actions** when invoked, use only where intended.

## Run one

```bash
# generate page + flow only (offline)
node dist/cli.js widget examples/widget/restaurant-trattoria.scenario.json \
  --out-dir output/widget

# record it (live or mock based on whether the scenario has a `live` block)
node dist/cli.js widget examples/widget/restaurant-trattoria.scenario.json \
  --out-dir output/widget --run

# record the whole suite
node scripts/record-live-demos.mjs
```

## Re-provision or re-tune the agents

```bash
node scripts/provision-agents.mjs   # idempotent: reuses by name, creates the rest
node scripts/tune-agents.mjs        # PATCH each agent: markdown prompt + attached tools + branded text_contents
```

`tune-agents.mjs` also brands the widget header per business via
`platform_settings.widget.text_contents.chatting_status` ("Chatting with Vera",
"Chatting with Sage", etc.) — that lives on the agent, not the widget tag.
