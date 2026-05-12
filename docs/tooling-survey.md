# Autonomous UI Demo Tooling Survey

Fresh pass: the closest public tool I found is screencli, but it does not pass the
"fully autonomous from a clean CLI on this workstation" bar yet.

## Current verdict

- screencli is the closest fit: prompt in, browser flow out, video export
  presets. It failed local testing because first run forces setup/login unless
  `ANTHROPIC_API_KEY` or a `~/.screencli/config.json` API key is already present.
- Browser-use, Skyvern, and Stagehand are useful automation stacks, but they
  optimize for completing browser tasks, not producing polished demo recordings
  with repeatable framing, click emphasis, manifests, and repo-local flow specs.
- Playwright already exposes deterministic browser control plus native video
  capture. That is the right substrate for a repo-local tool because it can run
  without cloud auth and can be tested in CI.

## Tested locally

Command shape tested against a local static `gtm_ops` console:

```bash
npx -y screencli record 'http://127.0.0.1:5177/console/' \
  --prompt 'Record a concise demo...' \
  --viewport 1280x720 \
  --max-steps 12 \
  --slow-mo 100 \
  --background ember \
  --local \
  --output /tmp/screencli-test-gtm \
  --verbose
```

Observed result:

```text
First time? Let's get you set up.
screencli setup
Sign in with GitHub or Google to get started.
Opening browser to sign in...
```

Package inspection showed screencli treats the machine as configured only when an
Anthropic API key is present through env/config or the user has completed hosted
login. That makes it a useful reference, not the answer for autonomous repo
recording.

## Tool direction

`ui-demo-runner` is now the working path for repo-local demo capture:

- JSON flow files live with the repo being demoed.
- A run emits `recording.webm`, screenshots, and `manifest.json`.
- Clicks get a modern in-page cursor/pulse overlay so the video is readable.
- Captions, action rails, speed controls, and smooth `focus` / `resetZoom`
  actions keep recordings closer to polished Loom clips without manual editing.
- Local files, `file://`, `http(s)://`, and relative URLs with `--base-url` are
  supported.

For CLI-only repos, use VHS `.tape` files beside the browser flows. That keeps
custom command-line demos deterministic while avoiding a fake browser shell
around terminal tools.

The next useful adapter is a PinchTab playback adapter for flows captured from
live browser sessions. A desktop/computer-use adapter can sit behind the same
manifest contract later, but it should not block browser demos.
