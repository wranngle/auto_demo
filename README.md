# auto_demo

CLI for recording browser UI demos — eight modes, one repo:

- **`run`**: replay a deterministic `.demo.json` flow file. Zero model cost, byte-identical reruns. Great for "re-record this every time the UI changes."
- **`capture`**: drive the page with an AI agent (Claude via the Anthropic SDK) and produce a polished `composed.mp4` with cursor pulse, zoom, optional voiceover, and a Loom-grade background. One-shot "show me this app" reels.
- **`author`**: capture once with the agent, then dump a re-runnable `.demo.json` next to the recording. Role-aware tools + back-resolution from the accessibility snapshot mean the emitted flow has stable selectors on most UIs.
- **`embed`**: print README-ready markdown + HTML snippets for a recording directory. Closes the "what do I do with this file" loop.
- **`stitch`**: concatenate two or more recordings into a single video (concat-demuxer copy by default; `--fade <s>` for crossfade).
- **`watch`**: re-run a flow whenever its file changes; report selector regressions across runs (CI-friendly exit codes).
- **`judge`**: send the recording's final frame to Claude vision and get back `{covers_prompt, aesthetic, blockers[]}` — the oracle for "does this demo actually fulfill the prompt."
- **`regress`**: re-run a list of flows; emit JSON with selector quality + pass rate. Fails the build when any flow drops below the threshold.

`--prompt` is optional on `capture`/`author` — omit it (or pass `--explore`) for a built-in tour prompt. `--format mp4,gif,webm` and `--aspect 16:9,1:1,9:16` are now comma-separated lists, so one capture writes the full marketing matrix in a single pass. `--logo path/to/png` overlays a brand mark. `--tts flite` synthesizes voiceover from `narrate` events offline through ffmpeg (no API key needed); `--tts elevenlabs|openai` uses cloud TTS. `--auth-state storage.json` records against logged-in apps. A pre-flight HTTP probe rejects unreachable / 404 / 500 URLs before Playwright launches, so you don't burn 20k tokens on an error page.

`capture` is **nondeterministic by design** — the agent re-decides each pass. For byte-identical reruns: `auto_demo author <url>` to capture once and emit `flow.demo.json`, then `auto_demo run flow.demo.json` forever.

Built on Playwright. Composition pipeline (ffmpeg) and agent loop adapted from
[screencli](https://github.com/usefulagents/screencli) (MIT), but **without** the
hosted login / cloud-credit gate.

## Auth

`auto_demo capture` and `auto_demo author` need Anthropic access. The CLI looks for credentials in this order:

1. `ANTHROPIC_API_KEY` (env)
2. `ANTHROPIC_AUTH_TOKEN` (env)
3. `~/.claude/.credentials.json` — the OAuth bearer your local Claude Code subscription already manages. **Preferred** — no raw key, no hosted login, no credit meter. The bearer is sent with the `anthropic-beta: oauth-2025-04-20` header.

`auto_demo run` needs no credentials.

## Install

```bash
npm install
npx playwright install chromium
npm run build
```

## Three modes, three commands

### `run` — replay a deterministic flow

```bash
auto_demo run examples/local-smoke.demo.json --output .work/smoke-demo
```

Outputs:
- `recording.webm` — Playwright-native video
- `manifest.json` — per-step durations and statuses
- `screenshots/*.png` — explicit `screenshot` steps

### `capture` — agent drives the page, produces a polished video

```bash
auto_demo capture http://127.0.0.1:5180/smoke.html \
  --prompt 'Open Opportunity Review, search "voice automation", scroll the table, then call done.' \
  --output .work/capture-demo
```

Outputs:
- `raw.webm` — Playwright recording
- `composed.mp4` — post-processed with ember background, cursor pulse, zoom
- `events.json` — every agent tool call with timestamps and (when available) `target_meta`
- `metadata.json` — model, token usage, chapters, duration

The default background is `ember`; pick from `midnight ember forest nebula slate copper none`.

### `author` — capture once, replay forever

```bash
auto_demo author http://127.0.0.1:5180/smoke.html \
  --prompt 'Open Opportunity Review, search "voice automation", scroll the table, then call done.' \
  --output .work/author-demo
```

Same artifacts as `capture`, **plus** `flow.demo.json` — a auto_demo flow built from `events.json` that you can re-run with `auto_demo run` for free as many times as you want. Steps the agent couldn't pin to a stable selector get labeled `TODO selector — …` so you know what to hand-edit.

**v1 limitation**: smaller models (Haiku) often act by accessibility-tree index alone (e.g. "click element 2"), which is session-specific. Author mode marks those steps `TODO selector` and the captured `composed.mp4` is still valid; the **replay** path needs you to fill in selectors. Use `-m claude-sonnet-4-5-20250929` for richer `role`/`name` capture, or hand-edit the flow once before checking it in.

## Flow files (for `run` and `author`)

```json
{
  "name": "console-overview",
  "startUrl": "http://127.0.0.1:5177/console/",
  "viewport": {"width": 1280, "height": 720},
  "steps": [
    {"action": "waitForText", "text": "Pipeline Console"},
    {"action": "click", "selector": "text=Opportunities", "label": "Open opportunity review"},
    {"action": "screenshot", "name": "opportunity-review"}
  ]
}
```

Relative `startUrl` and `goto.url` resolve against the flow file's directory. With `--base-url`, relative URLs resolve against that local dev server.

### Supported actions

- `goto` — navigate to another URL
- `caption` — on-video caption for a timed beat
- `waitForText` / `waitForSelector` — gate on visibility
- `focus` / `resetZoom` / `zoom` — cursor + zoom framing
- `click` / `fill` / `hover` / `press` / `scroll` — interaction
- `pause` — fixed wait
- `screenshot` — write a PNG artifact

### Polish controls

```json
{
  "timing": {"speed": 1.25, "moveMs": 180, "clickPauseMs": 160, "zoomMs": 360},
  "polish": {
    "cursor": {"style": "modern", "accentColor": "#ff5f00"},
    "actionRail": {"enabled": true},
    "captions": {"enabled": true, "position": "bottom"},
    "zoom": {"defaultScale": 1.06, "durationMs": 360, "resetMs": 260}
  }
}
```

Use the action rail for review clips and walkthroughs; turn it off for public exports if it competes with the product UI.

## Why this exists

The off-the-shelf candidate was screencli — close, but its public release shipped a broken composition step (missing `assets/`) and routes inference through a hosted proxy with a free-tier credit meter, *even though it's MIT-licensed*. The agent loop was good; the surrounding flow wasn't.

auto_demo absorbs screencli's agent + composition, drops the cloud surface, and adds:

- **OAuth bearer auto-discovery** — your existing Claude Code subscription pays for `capture`, no separate API key or screencli login.
- **Deterministic replay path** — `author` mode turns a one-shot capture into a reusable flow file.
- **The boring path stays boring** — `run` is still deterministic, free, and doesn't talk to anything but your Playwright browser.

## Design bias

`run` is intentionally boring at runtime. The valuable part of a demo recording tool is not an agent hallucinating a flow; it is a flow you can rerun after every UI change and trust enough to publish. `capture` and `author` use the agent only where the agent earns its keep: turning a fuzzy "show me X" prompt into a concrete plan.
