# Changelog

All notable user-visible changes to **ui-demo-runner**. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project is
pre-1.0 so everything still lives under **[Unreleased]** — no semver
breaking-change contract yet. Cut a `0.2.0` tag when the surface stabilizes.

## [Unreleased]

### Added — ElevenLabs ConvAI widget mode (one scenario, two modes)
- `widget` subcommand: compiles a `*.scenario.json` into a business landing
  page mounting `<elevenlabs-convai>` plus the matching `.demo.json` flow.
  `--run` records it. (#16)
- Live mode embeds the real CDN widget bound to an agent id; mock mode
  ships a deterministic offline replica with the same text-mode selectors,
  so the recorder drives both identically. Branded headers via agent-level
  `platform_settings.widget.text_contents.chatting_status`. (#16)
- Choreographed motion: zoom punch-in anchored at the widget's
  bottom-right corner, held while the reply streams, then resetZoom. (#16)
- Visible **client-tool calls** + rich **markdown** replies — tool runs
  in-page with no backend, agent speaks the canned result as a formatted
  summary. (#16)
- Seven shipped scenarios under `examples/widget/`: six vertical demos
  (restaurant, dental, salon, ecommerce, medspa, home-services) on canned
  client tools + one **wranngle-scheduling** scenario on the real Cal.com
  `book_demo` workspace tool — the single host that creates real bookings.
  (#16, #17)
- `scripts/provision-agents.mjs` idempotently creates/reuses the agents;
  `scripts/tune-agents.mjs` PATCHes prompts + tool attachment + branded
  text-contents; `scripts/record-live-demos.mjs` records the whole suite. (#16, #17)
- `examples/widget/README.md` orientation: scenario shape, real-action
  boundary, authoring guide. (#20)

### Added — Recorder + flow features
- `run` — Playwright-driven flow recorder with cursor overlay, captions,
  smooth zoom/focus, screenshot artifacts, and a per-run `manifest.json`.
- `narrate` — mux a voiceover track (deterministic mock tone today; the
  `--voice elevenlabs` slot is reserved for real TTS but currently falls
  back to mock). (#9)
- `vertical` — convert a recording into a 9:16 export for Shorts/TikTok/
  Reels with `--fit crop|pad`. (#10)
- `from-url` — deterministic 5-step script from a URL + plain-English
  goal via a mock LLM client (fixture-backed for stable tests). (#11)
- `watch --once` — DOM-hash comparator that emits `CHANGE_DETECTED` or
  `NO_CHANGE` and fires a re-record hook exactly once per detected change. (#12)
- `storyboard` — render a markdown storyboard from a recorded run's
  manifest (keyframe per screenshot with timestamp + narration). (#13)
- `svg` — sample frames from an MP4 fixture into a single self-contained
  animated SVG for README embeds, with a 200 KB ceiling. (#14)
- `regress` mode emits a markdown diff summary between DOM snapshots. (#8)
- `--quality 720p | 1080p | 4k` preset for `run` (viewport + bitrate). (#6)
- `--captions-lang en,es,pt,fr` multilingual SRT export. (#5)
- `split` subcommand — 1920×1080 split-screen of flow + recording. (#4)
- Drop-in `auto-demo-on-deploy.yml.template` GitHub Action for
  consumer-repo CI re-recording. (#3)
- NDJSON event-log sidecar — append-only ECS-shaped `events.jsonl` next
  to `manifest.json`, grep/jq/DuckDB-readable across runs. (#19, pending)

### Changed — install requirements
- **ffmpeg + ffprobe are now a documented dependency.** They were already
  required for `narrate`, `vertical`, `split`, and `svg`; the new runner-side
  retime adds them to the base recording path too. README install section
  spells this out, plus the no-op-on-missing fallback. (#33)

### Changed
- Renamed user-visible `auto_demo` labels to the published package name
  `ui-demo-runner` — `metadata.source` in every generated flow + the
  exported SVG aria-label. The GitHub repository is still named `auto_demo`
  (it's an identifier, not a brand). (#18)
- `package.json` description + keywords refreshed to surface the widget
  capability in npm search (`elevenlabs`, `convai`, `chat-widget`,
  `ai-agent`, `voice-agent`). (#21)
- README hero leads with the hero GIF; subcommands renamed conceptually
  from "actions" to "modes" for consistency. (#7)
- README docs fixed: narrate + vertical chaining examples reference
  `recording.webm` (the actual runner output) instead of `recording.mp4`.

### Removed (public-visibility remediation)
- Private dev-harness clutter stripped from the published tree:
  `scripts/bin/*` (replaced by the global `git_good`), `bin/symphony`,
  `.agents/`, `.automation/`, `schemas/automation-policy.v1.json`,
  `WORKFLOW.md`, `AUTOMATION.md`, `DESIGN.md`, internal portfolio docs.
  Audit verdict: zero secrets in any tracked file.

### Fixed
- **Real-time playback (kills the 3–5× slow-motion bug).** Playwright tags webms
  at 25 fps while capturing ~75 fps of real frames, so every recording in the
  repo was stretching to 3–5× its real wall-clock duration (smoke demo: 2.7 s →
  15.3 s container; widget demos: 34 s → 101 s). `runFlow` now invokes
  `src/retime.ts` after writing the manifest, comparing wall-clock to container
  duration and re-encoding with `ffmpeg setpts` when the video is stretched
  >10 %. Caught only by viewing the actual playback, not by step counts. (#30, #32)
- Real repo URL in `SECURITY.md` + issue-template config (was
  `REPO_URL_NOT_DETECTED` placeholder).
- Template artifact paths now `recording.webm` + `manifest.json` (was
  `recording.mp4` + `*.ndjson` — consumer CI was failing with
  `if-no-files-found: error`).
- Drift-detection test on `--voice elevenlabs` now documents the stub
  fallback honestly instead of claiming real speech.

### Tests + CI hardening
- Bats shell-integration suite (33 cases across 7 files: from-url, narrate,
  storyboard, svg, vertical, watch, widget) now runs in CI under the existing
  `test` job — installs bats + ffmpeg on the ubuntu-latest runner. Closes the
  doctrine gap "wire to CI before claiming done". (#25)
- `tests/runner-events.test.ts` — ECS-shaped NDJSON sidecar format. (#19)
- `tests/narrate.test.ts` — `start | duration | text` parser contract. (#26)
- `tests/url-resolver.test.ts` — relative/baseUrl/file:// branches of
  `resolveTarget`. (#27)
- `tests/retime.test.ts` — `computeRetimeRatio` boundary + degenerate-input
  contract; guards the real-time fix from silent regression. (#31)
- `tests/widget.test.ts` — `data-client-tools` payload-shape contract
  (name → exact result, no metadata leakage) + a `wranngle-scheduling`
  load/render/flow guard. (#24, #29)
- Widget source `xo --fix` for 33 stylistic lint errors (formatting-only). (#28)

### Infrastructure
- Squash-merge auto-merge pipeline (`.github/workflows/automerge.yml`)
  gates on `automerge` label + required-check set
  (`shell-lint, yaml-lint, test, gitleaks, actionlint, zizmor,
  workflow-lint`) before landing PRs to `main`.
- `.gitignore` covers `output/`, `.auto_demo/`, `.work/`, `*.webm`, and
  the private `docs/wranngle-hero-demo/` notes.

## [0.1.0] — initial public surface

Tracked as the initial seed: Playwright `run`, JSON flow schema, smoke
demo, hero GIF, and the original portfolio examples. Subsequent work
(see [Unreleased]) extends rather than breaks the surface.
