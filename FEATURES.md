# auto_demo — Complete Feature Map

Every user-visible and internal feature. Maintained as the contract that the test suite is supposed to defend.

## CLI surface (8 subcommands)

### `auto_demo run <flow>`
Deterministic Playwright-driven replay of a `.demo.json` flow file.
- Options: `--output`, `--base-url`, `--headed`, `--no-video`, `--slow-mo`, `--speed`, `--json`
- Output: `recording.webm`, `manifest.json`, `screenshots/*.png`
- Auth: none required

### `auto_demo capture <url>`
Agent-driven recording with polished post-production.
- Required when given: `<url>`. Everything else has a sensible default.
- Prompt options: `--prompt <text>` OR `--explore` (or omit both — `--explore` is the implicit default and runs a tour prompt).
- Output options: `--output`, `--viewport`, `--model`, `--max-steps`, `--slow-mo`, `--headed`, `--verbose`.
- Polish options: `--background midnight|ember|forest|nebula|slate|copper|none`, `--padding`, `--corner-radius`, `--no-shadow`.
- Format options: `--format mp4[,webm,gif]` (comma-separated for matrix output), `--aspect 16:9[,1:1,9:16]` (comma-separated), `--logo <path>`.
- Audio options: `--tts none|flite|elevenlabs|openai` — synthesize voiceover from `narrate` events and mux into the composed mp4. `flite` runs offline through ffmpeg's libflite filter (no key, no network); `elevenlabs` reads `ELEVENLABS_API_KEY`; `openai` reads `OPENAI_API_KEY`.
- Authentication options: `--auth-state <path>` (Playwright storageState JSON for protected apps), `--skip-preflight` (bypass the URL reachability probe).
- Output: `raw.webm`, `composed.mp4` (+ optional `composed.gif` / `composed.webm` from `--format`, `composed-audio.mp4` when `--tts` is set), `events.json`, `metadata.json`, `screenshots/step-*.jpg`, `thumbnail.jpg`, `audio/narration-NNN.{wav,mp3}`.
- Auth: required (Anthropic via one of the three sources below).

### `auto_demo author <url>`
Capture mode + emit a re-runnable `.demo.json` from the agent's tool-call log.
- Options: all of `capture` + `--flow-out`, `--flow-name`.
- Output: all of `capture` + `flow.demo.json`.
- Selectors: role-aware tools + back-resolution from the accessibility snapshot mean most flows replay without manual editing. Steps the agent couldn't pin to a stable selector get `TODO selector — …` labels.

### `auto_demo embed <recordingDir>`
Print README-ready markdown + HTML snippets to embed a recording.
- Options: `--relative-to <dir>` (make video/poster paths relative), `--title <text>`.
- Picks the best available output: `composed.mp4` → `composed.gif` → `composed.webm` → `recording.webm`.
- Emits a linked-poster markdown image + an HTML5 `<video controls muted playsinline loop>` fallback.

### `auto_demo stitch <dir1> <dir2> ...`
Concatenate two or more recording directories into a single video.
- Options: `--output <path>`, `--fade <seconds>` (cross-fade duration; 0 = hard cut), `--reencode` (force re-encode rather than concat-demuxer copy).
- Picks the best per-directory video: `composed-audio.mp4` → `composed.mp4` → `composed.webm` → `recording.webm`.
- Concat-demuxer for byte-copy when codecs match; xfade + acrossfade filter chain when `--fade` is set.

### `auto_demo watch <flow>`
File watcher that re-runs the flow whenever it changes; reports selector regressions across runs.
- Options: `--output <dir>`, `--base-url <url>`, `--headed`, `--debounce <ms>` (default 500), `--once`.
- Exits non-zero on detected regressions for CI.

### `auto_demo judge <recordingDir>`
Send the recording's `thumbnail.jpg` + the agent's prompt to Claude vision; receive `{covers_prompt, aesthetic, blockers[]}` JSON.
- Options: `--model <name>` (defaults to `claude-haiku-4-5-20251001`).
- Auth: same three-source cascade as capture/author.

### `auto_demo regress <flows...>`
Re-run a list of flow.demo.json files; emit JSON with selector quality + per-step pass rate.
- Options: `--threshold <0..1>` (default 0.75), `--score-only` (skip running, score selectors only), `--report <path>`, `--base-url <url>`.
- Exits non-zero when any flow falls below the threshold.

## Pre-flight reachability check

`src/preflight.ts` — capture/author refuse to launch Playwright + the agent against a 404/500/unreachable URL. Real `fetch` call with 5s timeout; rejects 404 and >=500, passes through 401/403 (login pages are valid demo targets). Bypass with `--skip-preflight`.

## Auth (three-source cascade)

In `src/oauth.ts`:
1. `ANTHROPIC_API_KEY` env var
2. `ANTHROPIC_AUTH_TOKEN` env var (bearer, sent with `anthropic-beta: oauth-2025-04-20`)
3. `~/.claude/.credentials.json` `claudeAiOauth.accessToken` if not expired

Returns a tagged-union `AnthropicAuth` with a `source` discriminator. `describeAuth()` produces a human-readable label per source.

## Flow schema (arktype-validated)

Supported actions (from `src/types.ts`):
- `goto` — navigate to URL
- `caption` — on-video text for a timed beat
- `waitForText` / `waitForSelector` — gate on visibility
- `focus` / `resetZoom` / `zoom` — cursor + zoom framing
- `click` / `fill` / `hover` / `press` — interaction
- `scroll` — by pixel delta
- `pause` — fixed wait
- `screenshot` — write a PNG artifact
- `annotate` — render an `arrow` / `callout` / `box` overlay (anchored to a selector or x/y) for a timed duration; visible in both `run` (DOM overlay) and `capture` (ffmpeg drawbox/drawtext) pipelines

Top-level fields: `name`, `startUrl`, `viewport`, `record.{enabled,size}`, `timing.{speed,moveMs,clickPauseMs,fillPauseMs,pressPauseMs,scrollPauseMs,zoomMs}`, `polish.{cursor,actionRail,captions,zoom}`, `metadata`, `steps`.

Selector resolution: Playwright `page.locator(selector)` with CSS/XPath/`text=`/`role=` engines.

## Polish pipeline

In-page overlay (during `run`):
- `src/overlay.ts` injects a cursor element, action rail, captions, and CSS zoom transitions.
- Cursor styles: `modern` / `classic` / `none`, configurable accent color, move/pulse timings.

Post-production (during `capture`/`author`):
- `src/video/compose.ts` runs an ffmpeg filter graph: cursor PNG overlay (with smoothed coordinates), annotation overlays, zoom-in around clicks, rounded-corner frame, drop shadow, gradient background, final H.264 mp4 + thumbnail jpg.
- `src/video/trim.ts` strips significant idle time from the raw recording.
- `src/video/background.ts` resolves one of six gradient backgrounds: `midnight`, `ember`, `forest`, `nebula`, `slate`, `copper`. Random preset when not specified.
- `src/video/cursor.ts` + `src/video/zoom.ts` + `src/video/highlight.ts` + `src/video/annotations.ts` generate the ffmpeg expressions for those effects.
- `src/video/format.ts` converts the composed mp4 to GIF / WebM and applies aspect-crop + logo overlay. `convertMatrix(...)` runs the (formats × aspects) matrix in one pass.

Audio post-production (`src/audio/`):
- `src/audio/tts.ts` resolves the requested TTS provider (`flite`, `elevenlabs`, `openai`) and synthesizes one audio clip per `narrate` event.
- `src/audio/compose-audio.ts` builds the `adelay + amix` filter chain that drops each clip at its post-trim timestamp, then mux into a `composed-audio.mp4` alongside the silent composed mp4.

## Agent loop (Anthropic Messages API)

In `src/agent/loop.ts`:
- Anthropic SDK client built from `authToken` (bearer) or `apiKey`.
- Multi-turn conversation with `system` + `tools` + interleaved screenshots.
- Old screenshots are stripped from message history beyond N=2 to keep payloads small.
- Retries on 429/529/overloaded with exponential backoff (max 3 attempts).
- Token usage accumulated across the loop.

Tools available to the agent (from `src/agent/tools.ts`):
- `screenshot`, `get_interactive_elements`, `get_page_info`
- `click`, `type`, `press_key`, `go_back`, `scroll`, `hover`, `navigate`, `wait`, `select_option`
- `done` (terminal), `narrate` (caption-only)

Target resolution (`src/browser/resolve-locator.ts` + `actions.ts`):
- Priority: `selector` → `role` + `name` → `text` → `index` (from `get_interactive_elements`) → `x,y` (coordinate fallback).

Auth state save/load for target sites: `src/browser/auth.ts` (Playwright `storageState`) — supports recording past a login wall, then re-using cookies on later runs.

## Recording + metadata

- `src/recording/event-log.ts` — append-only log of agent actions, timestamps, bounding boxes, optional `target_meta`.
- `src/recording/types.ts` — `RecordingEvent`, `TargetMeta`, `Chapter`, `AgentStats`, `RecordingMetadata`.
- `src/recording/chapters.ts` — derive chapter boundaries from the event stream (used by the trim/compose step).
- `src/recording/metadata.ts` — write the final `metadata.json` with model, viewport, duration, chapters, agent stats.

## Author-mode converter

`src/commands/events-to-flow.ts`:
- Maps every `RecordingEvent` type → `DemoStep` form.
- Skips the implicit initial navigate.
- For interaction events, builds a Playwright-resolvable selector from `target_meta` in priority order: explicit `selector` → `role[name=…]` → `role` → `text=name` (only when ≠ typed value).
- Marks unresolvable interaction steps with `TODO selector — …` label and appends an "Author note" caption.

## Build / dev surface

- TypeScript strict mode (`strict: true`).
- `npm run build` — `tsc -p tsconfig.build.json` → `dist/`.
- `npm run typecheck` — no-emit, full src + tests.
- `npm test` — vitest run.
- `npm run lint` — xo on src + tests.
- `npm run demo:smoke` — build + run the bundled local-smoke flow.
- `npm run demo:capture` — build + capture against local fixture.

## Packaged assets

- `assets/cursor.png` — cursor overlay sprite (used by ffmpeg compose).
- `assets/backgrounds/{midnight,ember,forest,nebula,slate,copper}.png` — gradient backgrounds.

## Determinism

`capture` is **nondeterministic by design** — the agent picks elements and decides when to stop. Two captures of the same URL will not produce byte-identical mp4s. For byte-identical reruns, use `author` once to emit a `flow.demo.json`, then `run` it forever.

## Not implemented (deliberately or aspirationally)

- Cloud upload / share URL — dropped from screencli.
- Hosted login (`init`, `login`, `logout`, `whoami`) — dropped.
- Cloud rerender via `render` — dropped.
- Multi-browser support — chromium only.
- Visual diff of composed output — see [Roast](./tests/ROAST.md).
- Sonnet-grade selector capture against non-semantic UIs — see [Roast](./tests/ROAST.md).
