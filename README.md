# ui-demo-runner

Deterministic CLI recorder for browser UI demos.

The point is simple: stop hand-recording the same Loom walkthroughs. Put the demo
flow in a repo, run it from the CLI, and get a video, screenshots, and a manifest
that says exactly what happened.

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
node dist/cli.js run path/to/console-overview.demo.json --output output/console-overview
```

Relative `startUrl` and `goto.url` values resolve against the flow file's
directory. With `--base-url`, relative URLs resolve against that local dev server.

## Supported actions

- `goto`: navigate to another URL.
- `waitForText`: wait until visible text appears.
- `waitForSelector`: wait until a selector is visible.
- `click`: click a selector with a visible cursor pulse.
- `fill`: fill a field.
- `hover`: hover a selector.
- `press`: press a keyboard key, optionally scoped to a selector.
- `scroll`: scroll by pixel delta.
- `pause`: wait for a fixed number of milliseconds.
- `zoom`: set document zoom for cleaner video framing.
- `screenshot`: write a PNG artifact.

## Design bias

This tool is intentionally boring at runtime. The valuable part of a demo
recording tool is not an agent hallucinating a flow; it is a flow you can rerun
after every UI repair pass and trust enough to publish.
