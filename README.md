# ui-demo-runner

![ui-demo-runner hero](docs/hero.gif)

Deterministic CLI recorder for browser UI demos. One command, one flow file,
one reproducible video — every time.

```bash
npm run demo:smoke
# → .work/smoke-demo/recording.webm + manifest.json + screenshots/
```

Stop hand-recording the same Loom walkthroughs. Put the demo flow in a repo,
run it from the CLI, and get a video, screenshots, and a manifest that says
exactly what happened.

## Why this exists

The obvious off-the-shelf candidate is screencli. It is close, but local testing
showed it forces first-run hosted auth unless an Anthropic API key or screencli
config already exists. That fails the bar for unattended repo-local recording.

This repo uses Playwright as the first backend because it is deterministic, local,
and already gives us browser control plus video capture. AI can still help author
or repair flow files, but the recording run itself should not depend on a chatty
agent improvising against the page.

## Install

```bash
npm install
npx playwright install chromium
npm run build
```

You also need `ffmpeg` + `ffprobe` on `PATH` (`apt install ffmpeg` / `brew install
ffmpeg`). The recorder calls them to (a) re-time every webm to real-time
playback — Playwright tags recordings at 25 fps while capturing ~75 fps of real
frames, so without this step recordings play back 3–5× slow — and (b) power
`narrate`, `vertical`, `split`, and `svg`. If ffmpeg is missing the recording
still succeeds and the manifest still ships; only the post-processing steps
no-op.

## Run the smoke demo

```bash
npm run demo:smoke
```

The run writes:

- `.work/smoke-demo/recording.webm`
- `.work/smoke-demo/manifest.json` — per-run snapshot
- `.work/smoke-demo/events.jsonl` — ECS-shaped NDJSON event log (one line per step, grep/jq/DuckDB-readable across runs)
- `.work/smoke-demo/screenshots/opportunity-review.png`

## Record another repo

Create a `*.demo.json` file beside the app you want to record:

```json
{
  "name": "console-overview",
  "startUrl": "http://127.0.0.1:5177/console/",
  "viewport": {
    "width": 1280,
    "height": 720
  },
  "steps": [
    {
      "action": "waitForText",
      "text": "Pipeline Console"
    },
    {
      "action": "click",
      "selector": "text=Opportunities",
      "label": "Open opportunity review"
    },
    {
      "action": "screenshot",
      "name": "opportunity-review"
    }
  ]
}
```

Run it:

```bash
node dist/cli.js run path/to/console-overview.demo.json \
  --output output/console-overview \
  --speed 1.25
```

Relative `startUrl` and `goto.url` values resolve against the flow file's
directory. With `--base-url`, relative URLs resolve against that local dev server.

## Modes

- `goto`: navigate to another URL.
- `caption`: show a short on-video caption for a timed beat.
- `waitForText`: wait until visible text appears.
- `waitForSelector`: wait until a selector is visible.
- `focus`: move the cursor to a selector and smoothly zoom toward it.
- `resetZoom`: return from a focus or zoom beat to full-frame context.
- `click`: click a selector with a visible cursor pulse.
- `fill`: fill a field.
- `hover`: hover a selector.
- `press`: press a keyboard key, optionally scoped to a selector.
- `scroll`: scroll by pixel delta.
- `pause`: wait for a fixed number of milliseconds.
- `zoom`: set document zoom for cleaner video framing.
- `screenshot`: write a PNG artifact.

## Narrate (AI voice mux)

`ui-demo-runner narrate` muxes a voiceover track onto an existing recording.
The default `--voice mock` synthesizes a deterministic sine tone per line so
tests never hit the network. `--voice elevenlabs` is reserved for real TTS but is
not yet wired — it currently falls back to the same mock tone.

```bash
node dist/cli.js narrate \
  --script fixtures/short-script.txt \
  --in output/console-overview/recording.webm \
  --out output/console-overview/narrated.mp4 \
  --voice mock
```

Script format is one line per cue: `start_sec | duration_sec | text`. Lines
beginning with `#` and blank lines are ignored. The output MP4 carries the
original video track plus a single AAC audio track (`ffprobe` reports both).

## Vertical export (9:16)

`ui-demo-runner vertical` converts an existing recording into a 9:16
(1080x1920) MP4 for YouTube Shorts / TikTok / Reels. The default `--fit
crop` center-crops the source frame; `--fit pad` letterboxes the
source onto a black 9:16 canvas instead. The video track is re-encoded
to H.264 with `+faststart`; the audio track is stripped (mux narration
on top separately if needed).

```bash
node dist/cli.js vertical \
  --in output/console-overview/recording.webm \
  --out output/console-overview/short.mp4 \
  --aspect 9:16 \
  --fit crop
```

`ffprobe` on the output reports `width=1080,height=1920` (ratio ~0.5625).

## Generate a script from a URL (mock LLM)

For ideation, `from-url` produces a deterministic 5-step script from a URL +
plain-English goal. The default client is a deterministic mock backed by a
checked-in fixture, so tests and offline runs are stable.

```bash
node dist/cli.js from-url https://example.com/billing \
  --goal "show how to add a credit card" \
  --out out/credit-card.script.json
```

Every step in the emitted `steps[]` carries `selector`, `action`, and
`narration` — the contract that downstream `run` and `narrate` consume.

## ElevenLabs widget demos (real agent + deterministic mock)

`ui-demo-runner widget` compiles a `*.scenario.json` into a business landing page
with an `<elevenlabs-convai>` chat widget plus the matching `.demo.json` flow.
One scenario, two modes (`live` block present = real agent; absent = mock), both
driven through the real widget's text-mode selectors.

```bash
node scripts/provision-agents.mjs        # idempotent — create/reuse 6 demo agents
node scripts/tune-agents.mjs             # PATCH each agent: markdown reply + client tools
node scripts/record-live-demos.mjs       # record all 6 → output/live-widget/
```

Seven shipped scenarios under `examples/widget/` — six vertical demos (restaurant,
dental, salon, ecommerce, medspa, home-services) plus a dedicated SaaS
**wranngle-scheduling** scenario that exercises the real Cal.com `book_demo`
webhook end-to-end (the only scenario whose recording creates a real Cal.com
entry). Each `live` block tunes the widget per
business: orb gradient, `branding.{mainLabel,startCall}` → widget `text-contents`,
`linkHosts` → `markdown-link-allowed-hosts`, and `clientTools[]` declares
browser-side tools (name, description, params, canned `result`). The page
registers the canned handlers via the `elevenlabs-convai:call` event; the real
agent's LLM decides to call a tool, it runs in-page with **no backend, no side
effects**, returns the canned result, and the agent speaks it as rich markdown
(a bold heading + bulleted detail list + a clickable confirmation link). Live
recordings are choreographed for motion — a zoom punch anchored at the widget's
bottom-right corner held while the reply streams, then a pull-back.

`live.workspaceToolIds: string[]` attaches existing ElevenLabs workspace tools
by id (e.g. the native cal.com `book_demo` webhook). **These take real actions**
when invoked — real Cal.com bookings, real SMS. `tune-agents.mjs` merges them
onto the agent's `prompt.tool_ids` (the API rejects sending inline `tools` +
`tool_ids` together). The medspa scenario ships with the real Cal.com `book_demo`
attached; re-recording it may create a real booking if the conversation reaches
that tool.

## Animated SVG export (README hero)

`ui-demo-runner svg` samples frames from an existing MP4 and emits a single
self-contained animated SVG suitable for embedding directly in a README — the
same surface as `docs/hero.gif` from the hero block, but as inline markup that
renders without binary asset hosting.

```bash
node dist/cli.js svg \
  --fixture examples/fixtures/short-clip.mp4 \
  --out out/demo.svg
```

The output is a single `.svg` file with base64-embedded JPEG frames driven by
SMIL `<animate>` elements. The renderer enforces a 200KB ceiling so the file
stays cheap to ship alongside the README; tune `--frames`, `--width`, or
`--jpeg-quality` if the budget is tight.

## Polish controls

Flow files can opt into the recording style used for portfolio demos:

```json
{
  "timing": {
    "speed": 1.25,
    "moveMs": 180,
    "clickPauseMs": 160,
    "zoomMs": 360
  },
  "polish": {
    "cursor": {
      "style": "modern",
      "accentColor": "#ff5f00"
    },
    "actionRail": {
      "enabled": true
    },
    "captions": {
      "enabled": true,
      "position": "bottom"
    },
    "zoom": {
      "defaultScale": 1.06,
      "durationMs": 360,
      "resetMs": 260
    }
  }
}
```

Use the action rail for internal review clips and dense walkthroughs where the
viewer needs to see the planned sequence. Turn it off for final public exports if
it competes with the product UI.

## CI integration — re-record on every deploy

Drop in the shipped GitHub Action template so every push to `main` produces a
fresh `recording.webm` + `manifest.json` as a workflow artifact:

```bash
mkdir -p .github/workflows
cp "$(npm root -g)/ui-demo-runner/templates/auto-demo-on-deploy.yml.template" \
   .github/workflows/auto-demo-on-deploy.yml
git add .github/workflows/auto-demo-on-deploy.yml
```

Edit the copied workflow to point at your own `flows/<name>.demo.json` and
commit. Artifacts land under the workflow run as `auto-demo-<sha>`.

## Watch mode

Re-record only when the UI actually changes. `watch --once` hashes the previous
and next DOM snapshots, emits `CHANGE_DETECTED` (or `NO_CHANGE`), and fires a
re-run hook exactly once per detected change. The `--once` mode is what tests
exercise; the polling-loop variant lives behind the same comparator and is gated
out of this release.

```bash
node dist/cli.js watch --once \
  --fixture fixtures/old-dom.html \
  --next fixtures/new-dom.html
```

## Design bias

This tool is intentionally boring at runtime. The valuable part of a demo
recording tool is not an agent hallucinating a flow; it is a flow you can rerun
after every UI repair pass and trust enough to publish.
