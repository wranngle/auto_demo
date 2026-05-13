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

## What the suite still doesn't cover

| Gap | Why | What it would take |
|---|---|---|
| Video aesthetic quality | "Looks good" is not assertable | Human review or a vision-model judge on a fixture corpus |
| Agent prompt-vs-result fidelity | The agent picks "done"; no oracle | Score final screenshot vs prompt with a vision model |
| Audio / narration | No TTS in the pipeline at all | Pipe captions through ElevenLabs/OpenAI TTS, sync as audio track |
| ffmpeg expression correctness | Filter graphs are stringly typed | Snapshot-test generated filter strings for representative event logs |
| OAuth bearer revocation | No live API in the test | Contract test against a mock Anthropic server returning 401 |
| Idle-time trim math | Math lives isolated, untested | One test with synthetic events + a 30 s gap |
| Demo idempotency | Capture is nondeterministic by design | Cannot be tested into existence; documents the limit |
| Replay drift across UI changes | Tests use a static fixture | Run flow against fixture, mutate DOM, run flow again, diff |
| Watch / auto-rerecord | Not implemented | File watcher + selector-quality regression detection |
| Annotations (arrows, callouts) | Not implemented | Extend flow schema, render with ffmpeg overlay |
| Multi-shot composition | Not implemented | Stitch multiple capture outputs |
| Multi-resolution outputs at once | Not implemented | Loop convert across `--aspect`/`--format` matrix |
| Selector durability across DOM changes | Tests pass on idle UIs | Periodic regression suite that re-runs flows on staging |

## What "green build" actually means

A green test pass means:
- The merger hasn't regressed structurally (no cloud surface).
- Packaged assets are present and valid (no compose crash).
- `run` works end-to-end against the bundled fixture.
- Flow → step mapping is correct at the unit level.
- CLI parsers reject what they should reject.
- Pre-flight rejects 404/500/unreachable.
- Embed snippets pick the right artifact + format.

A green test pass does **not** mean:
- The recorded demos look good.
- The agent will pick the right element on your app.
- The output will impress anyone watching it.

Those still require you to watch the video.

## One failing test stays red

`selector-quality.test.ts > gtm_ops` will keep failing until gtm_ops adds
ARIA roles / accessible names to its dashboard table rows. That's the test's
job: be honest about what auto_demo cannot do on inaccessible UIs.
