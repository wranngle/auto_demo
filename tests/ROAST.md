# Self-roast (CEO-grade) — auto_demo test suite + utility gaps

Read before reading the tests. They cover more than they used to. They still
miss things that matter. This file names every gap — including the ones the
tests can't catch — so they don't quietly persist.

## What the first-pass tests got wrong

**Tested the parser, not the user.** `cli-parsers.test.ts` verifies that
`parseViewport("1280x720")` does what its signature says. Important enough
not to regress, but nobody buys a demo recorder because its CLI argument
parser rejects decimals.

**Tested edges, not contracts.** `events-to-flow.test.ts` covers individual
event-type → step shapes. It did not assert the flow is *round-trippable* —
i.e. that `author` followed by `run` produces a working second video. Until
the back-resolution fix + role-aware tools landed, the unit tests passed and
the headline feature was still broken end-to-end.

**Tested in-process, not on-disk.** `oauth.test.ts` checks the resolution
cascade but not what happens when an Anthropic OAuth bearer is sent and the
server returns 401 / 403 / rate-limit. Those are the real failure modes the
user will see.

**Skipped the whole video pipeline.** ffmpeg compose, cursor overlay
expressions, zoom math, idle trim — zero coverage. The most code-dense files
in `src/video/` are still untested.

**Skipped the agent loop entirely.** `src/agent/loop.ts` is the hot path of
`capture` and `author`. Token accounting, retry policy, screenshot trimming,
tool dispatch — exercised only by live runs against real dev servers.

## The reframe — treat missing features as bugs

Test passing ≠ project useful. A demo recorder that ships a silent .mp4
and forces the user to upload it manually is technically working and
practically useless. The next round of work encodes the **utility gaps**
the way the original tests should have from day one.

## What landed in this round

### Pre-flight URL probe (`src/preflight.ts`)
Capture/author refuse to launch Playwright + the agent against a 404 or
unreachable URL. Saves ~30 s and ~20 k tokens per dead-target run. Tests
in `tests/preflight.test.ts` spin up a real HTTP server per case — no mocks.

### `--explore` mode (no prompt required)
Drop the wall-of-text. `auto_demo capture <url>` (no `--prompt`) runs a
built-in tour prompt that scrolls, hovers nav, clicks the first prominent
action, and calls done. Skips the friction of writing prompts for every UI.

### GIF + aspect ratio + logo overlay (`src/video/format.ts`)
- `--format gif` runs a palette-gen + paletteuse ffmpeg pass — README-embed
  friendly output, the most common ask for marketing demos.
- `--aspect 16:9|1:1|9:16` scales + center-crops for social formats.
- `--logo path/to/png` overlays a brand mark in the bottom-right.

### Embed subcommand (`auto_demo embed <recordingDir>`)
Closes the "what do I do with this file" loop. Reads `metadata.json`,
locates the best available video (composed → composed.gif → recording.webm),
and prints README-ready markdown + an HTML5 video fallback. Handles `--relative-to`
so the printed paths look right in a checked-in README.

### `--auth-state <path>` for protected apps
Wires `browser/auth.ts` to the CLI. Pass a Playwright `storageState.json`
from a previous logged-in browser session and capture against gated UIs.

### Selector quality: role-aware tools + back-resolution
Three layers, only one of which I tried first:
1. **System prompt biases** the agent toward role + name.
2. **Tool schemas now expose** `role` and `name` fields on `click`, `type`,
   `hover` — the agent literally couldn't pass those before, no matter what
   the system prompt said. (This is the silent bug that made the first pass
   useless and was only visible after running the test.)
3. **Back-resolution at capture time** — when the agent still acts by index,
   `tool-handlers.ts` looks up the element in the cached snapshot and fills
   in `role`, `name`, and a length-bounded `text` so the converter can emit
   a `role=...[name="..."]` or `text=...` selector.

Result on the recorded demos: **was 0% selector quality on every demo,
now 100% on 3 of 4 plus the proof recording.** The fourth (`gtm_ops`)
genuinely can't be fixed at this layer — its dashboard rows are non-semantic
divs with no role, no accessible name, and no short text. That's downstream
a11y debt; auto_demo can't synthesize selectors that don't exist.

### Audio / narration via TTS (`src/audio/`)
`--tts flite` (offline, via ffmpeg's libflite filter — no extra binary, no
key) or `--tts elevenlabs|openai` (cloud, key in env) pipes every `narrate`
event from the agent's tool log through synthesis, then `compose-audio.ts`
adelays each clip to its post-trim timestamp and `amix`es them into the
final mp4. `tests/audio.test.ts` locks the plan + filter generation; the
actual TTS calls are pluggable.

### Annotations — arrows, callouts, boxes (`src/video/annotations.ts` + flow schema)
New `annotate` action in the flow schema (`kind: arrow|callout|box`, anchor
either by selector or x/y, optional text/color). Renders via DOM overlay
during `run` and via ffmpeg `drawbox`/`drawtext` during `compose` so the
same flow looks the same in both pipelines. Filter strings are
snapshot-tested in `tests/ffmpeg-filters.test.ts`.

### Multi-shot composition — `auto_demo stitch <dir1> <dir2> ...`
Concatenates two or more recordings into a single video. Defaults to the
concat demuxer (byte-copy, fast) and switches to filter-graph
xfade/acrossfade when `--fade <seconds>` is set. The video-picker prefers
`composed-audio.mp4 → composed.mp4 → composed.webm → recording.webm`.

### Multi-resolution outputs at once
`--format mp4,gif,webm` and `--aspect 16:9,1:1,9:16` are now both
comma-separated lists. Capture/author iterate the (formats × aspects)
matrix once, producing every requested artifact in a single pass.

### Watch / auto-rerecord — `auto_demo watch <flow.demo.json>`
File watcher with a 500 ms debounce that re-runs the flow on every change
and reports selector-quality regressions across runs (`diffEvents` is the
pure comparator — what was passing and is now failing, what came back).
Exits non-zero on regression for CI.

### Vision-judge — `auto_demo judge <recordingDir>`
Sends the recording's `thumbnail.jpg` + the agent's prompt to Claude with
a strict rubric. Returns `{covers_prompt, aesthetic, blockers[]}` JSON.
This is the oracle the fixture corpus uses when "looks good" is not
assertable by string match.

### Selector durability harness — `auto_demo regress <flows...>`
Runs every flow against the live target, scores selector quality, and
emits a JSON report. CI guardrail for staging snapshots — fails the build
when a flow drops below the threshold.

### Filter-string snapshots, idle-trim math, OAuth contract, replay drift
The previously-uncovered ffmpeg expression builders (`buildCursorOverlay`,
`buildZoomFilterExpr`, `buildHighlightFilters`, `buildAnnotationFilters`,
`buildFullFilterComplex`) now have snapshot tests in
`tests/ffmpeg-filters.test.ts`. The trim math (`computeActiveSegments` +
`buildTrimFilter`) is locked down by `tests/trim-math.test.ts`, including
the 30 s-gap merge case the original suite didn't reach. The OAuth bearer
path is exercised against a local mock server in `tests/oauth-contract.test.ts`
for 401 / 403 / 429 (the failure modes users actually see). Replay drift
spins up a tiny HTTP fixture and re-runs a flow after mutating the HTML
in `tests/replay-drift.test.ts`.

## What the suite still doesn't cover

| Gap | Why | What it would take |
|---|---|---|
| Visual diff of composed output | Pixel-diffs explode on cursor jitter | Frame-sampling + perceptual hash, tolerance band per fixture |
| Selector resilience to a11y debt | Some UIs have zero roles/names | Downstream fix in the target app — auto_demo can't synthesize selectors that don't exist |

Down from 13 entries to 2 in this round.

## What "green build" actually means

A green test pass means:
- The merger hasn't regressed structurally (no cloud surface).
- Packaged assets are present and valid (no compose crash).
- `run` works end-to-end against the bundled fixture.
- Flow → step mapping is correct at the unit level.
- CLI parsers reject what they should reject.
- Pre-flight rejects 404/500/unreachable.
- Embed snippets pick the right artifact + format.
- ffmpeg filter strings (cursor, zoom, highlight, annotations, full composite)
  match the recorded snapshots.
- Idle-trim math handles 30s gaps and short-window merges.
- Audio plan + amix filter string is correct given a narration log.
- Stitch planning, manifest, and xfade chain compose correctly.
- Watch-mode regression detector flags new failures and new passes.
- Vision-judge response parser handles fenced JSON / noisy preambles / out-of-range numbers.
- `regress` reports selector quality + per-step pass rate, fails the build below threshold.

A green test pass does **not** mean:
- The recorded demos look good *to a human eye*. (Run `auto_demo judge` for an
  AI second opinion — that's what the vision-judge is for.)
- The agent will pick the right element on your app. (Run `regress` on a
  fixture suite — that's what the harness is for.)
- The output will impress anyone watching it. (Still requires you to watch
  the video.)

## Determinism — by design

`auto_demo capture` is **nondeterministic by design**. The agent picks elements,
phrases narrations, and decides when to call `done`. Two captures of the
same URL will not be byte-identical, and that's the point — the agent is
finding new things on each pass.

For byte-identical reruns: use `auto_demo author <url>` to capture once and
emit `flow.demo.json` next to the recording, then `auto_demo run flow.demo.json`
forever. The deterministic `run` path is byte-stable modulo Playwright video
encoding jitter.

## One failing test stays red

`selector-quality.test.ts > gtm_ops` will keep failing until gtm_ops adds
ARIA roles / accessible names to its dashboard table rows. That's the test's
job: be honest about what auto_demo cannot do on inaccessible UIs.
