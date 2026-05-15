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

## Run the smoke demo

```bash
npm run demo:smoke
```

The run writes:

- `.work/smoke-demo/recording.webm`
- `.work/smoke-demo/manifest.json`
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
tests never hit the network; pass `--voice elevenlabs` with the
`ELEVENLABS_API_KEY` env var to swap in real speech.

```bash
node dist/cli.js narrate \
  --script fixtures/short-script.txt \
  --in output/console-overview/recording.mp4 \
  --out output/console-overview/narrated.mp4 \
  --voice mock
```

Script format is one line per cue: `start_sec | duration_sec | text`. Lines
beginning with `#` and blank lines are ignored. The output MP4 carries the
original video track plus a single AAC audio track (`ffprobe` reports both).

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

## Design bias

This tool is intentionally boring at runtime. The valuable part of a demo
recording tool is not an agent hallucinating a flow; it is a flow you can rerun
after every UI repair pass and trust enough to publish.
