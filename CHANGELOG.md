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
- `writeRegressArtifacts()` library helper (`src/modes/regress.ts`) writes
  `regression.json` + `regression-summary.md` from a per-flow pass-rate report.
  Library API only — not wired as a CLI subcommand. (#8)
- `--quality 720p | 1080p | 4k` preset for `run` (viewport + bitrate). (#6)
- `--captions-lang en,es,pt,fr` multilingual SRT export. (#5)
- `split` subcommand — 1920×1080 split-screen of flow + recording. (#4)
- Drop-in `auto-demo-on-deploy.yml.template` GitHub Action for
  consumer-repo CI re-recording. (#3)
- NDJSON event-log sidecar — append-only ECS-shaped `events.jsonl` next
  to `manifest.json`, grep/jq/DuckDB-readable across runs. (#19)

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
- README widget section drift: `scripts/provision-agents.mjs` / `record-live-demos.mjs`
  comment claimed "6 demo agents" and the closing paragraph attributed the real Cal.com
  `book_demo` webhook to the medspa scenario — both stale after the 7th scenario
  (`wranngle-scheduling`) became the single real-action host. (#38)
- Consumer CI template (`templates/auto-demo-on-deploy.yml.template`) now
  uploads `events.jsonl` alongside `recording.webm` + `manifest.json`. PR #19
  added the NDJSON sidecar to runner output but the template was never updated
  — consumers copy-pasting the template after #19 lost the event ledger. (#43)
- CHANGELOG stale-marker fix: "`#19, pending`" → "`#19`" (PR #19 merged
  17h before the marker was dropped). (#42)
- CHANGELOG honesty fix: `regress` is a library helper (`writeRegressArtifacts`),
  not a CLI "mode". PR #8 only shipped `src/modes/regress.ts` + tests; no
  `src/cli.ts` wiring exists. The prior phrasing matched the neighboring CLI
  subcommand entries and would have led readers to expect `ui-demo-runner
  regress …`. (#46)

### Changed
- Dependabot config (`.github/dependabot.yml`) now labels its PRs with the
  canonical taxonomy (`t.chore` + `a/ci`) instead of the nonexistent
  `dependencies` label. Without this, every action-bump PR dropped the label
  silently or made GitHub auto-create a non-canonical one that escaped
  `issue-triage.yml` classification. (#44)

### Tests + CI hardening
- Bats shell-integration suite (29 cases across 7 files: from-url, narrate,
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
- `tests/widget.test.ts` — agents.json must contain every `scenario.live.agentId`
  (catches a deleted agent or renamed snapshot without removing the referring
  scenario). (#35)
- `tests/widget.test.ts` — doctrine-drift coupling between `agents.json` length,
  the on-disk `*.scenario.json` count, and the digit-count phrases in `README.md`
  (closes the "constant in 2+ files" doctrine gap that surfaced in #38). (#40)
- `tests/template-action.test.ts` — drift-coupling assertion that the consumer
  CI template references every documented per-run artifact name
  (`recording.webm`, `manifest.json`, `events.jsonl`). The filenames now live
  in three truth sources (runner source, README, template); the next artifact
  addition fails CI until the template catches up. (#43)
- `tests/widget.test.ts` — doctrine-drift coupling between the CHANGELOG
  bats-suite count phrase ("`N cases across M files`") and the on-disk
  `tests/*.bats` reality. Adding a `.bats` file or a `@test` without updating
  CHANGELOG now fails CI. (#48)
- Mock-LLM client (`createMockLlmClient`) now has a real `fixturePath`
  override test that actually exercises the override branch instead of
  asserting default behavior. (#50)
- `tests/widget.test.ts` — reverse drift coupling: every `agents.json` entry
  must be referenced by some `scenario.live.agentId` (catches a deleted
  scenario that left a ghost agent in the snapshot, consuming ElevenLabs
  quota). Pairs with the forward direction from #35. (#53)
- Scenario validator (`src/widget/scenario.ts`) reject paths now have full
  contract coverage: `optionalViewport` width/height bounds (#54),
  `linkHosts` non-array + non-string-element branches (#55), and
  `loadScenario` malformed-JSON error path (#56).
- Flow schema validator (`src/flow-schema.ts`) reject paths now have full
  contract coverage: zero-steps no-op guard (#57), unknown-action enum
  guard (#58), nine per-action required-field guards swept in one batch
  (#59), `loadFlow` malformed-JSON error path (#60).
- Mock-LLM fixture validator (`src/from-url/mock-llm.ts`) reject paths
  swept in one batch: malformed root, missing steps, non-object step,
  missing selector, unknown action, missing narration. (#61)
- `tests/flow-schema.test.ts` — drift coupling that walks
  `examples/**/*.demo.json` recursively and asserts every shipped example
  validates against the production schema (twin of widget-side guard at
  #35). (#62)

### Removed (cleanup)
- `src/widget/types.ts`: unused `isToolBeat` / `isActionBeat` type guards
  (only `isSayBeat` is consumed by `render.ts`). (#36)
- `examples/portfolio/ui-demo-runner.tape`: duplicate of the load-bearing
  `demo/cassette.tape` that powers the README hero GIF. (#37)
- Three legacy `auto_demo-*` `mktemp` prefixes in the test suite renamed to
  `ui-demo-*` — closing the brand-rename sweep started in #18. (#39)
- `examples/portfolio/voice-evals.tape` + `examples/portfolio/comfybulk.tape`:
  VHS recipes for two CLIs in separate repos. Incidentally included in PR #16
  and shipped in the published npm package (`files: ["examples", ...]`) but
  never referenced by README/scripts/tests. Same pattern as #37's audit. (#45)
- Two dead `PUPPETEER_SKIP_*` env-var exports in `scripts/hero.sh` — the
  script renders `demo/cassette.tape` via Docker'd VHS + ffmpeg; no puppeteer
  invocation, no npm install, nothing that would honor those vars. (#47)
- Banned-pattern usage-smoke bats tests deleted per CLAUDE.md doctrine: one
  in `narrate.bats` (#51), three more in `from-url.bats` + `watch.bats` (#52).
  These verified commander's required-flag handling — testing the dependency,
  not this project's behavior.
- `eslint-config-xo-typescript@^7` direct devDep — redundant once `xo@^2`
  ships its TypeScript ruleset. (#64)
- Three duplicate `loadElevenLabsKey()` copies across the agent-provisioning
  scripts (`provision-agents.mjs`, `tune-agents.mjs`, `record-live-demos.mjs`)
  consolidated into one shared helper at `scripts/_lib/load-elevenlabs-key.mjs`. (#65)
- Unused `writeFile` import in `src/modes/narrate.ts` (caught after the
  `noUnusedLocals` flip — see #78). (#77)
- Stale dist artifacts shipped to npm: `build` script now `rm -rf dist`
  before `tsc` so removed files don't survive in published tarballs. (#79)
- Two orphan portfolio output GIFs left behind by the tape-file deletion
  in #45 (`examples/portfolio/output/{comfybulk,voice-evals}.gif`). (#81)

### Fixed (brand-rename leftovers — final sweep)
- Three stale `auto-demo` / `auto_demo` user-visible strings missed by the
  PR #18 rename: live-widget devtools warning prefix (`[auto-demo]` →
  `[ui-demo-runner]`), narrate scratch-dir default (`.auto_demo-narrate`
  → `.ui-demo-runner-narrate`), split scratch-dir default. (#91)
- Consumer CI template body still wrote `.auto_demo/ci` paths and
  `auto-demo-${{ github.sha }}` artifact names — every consumer who
  copy-pasted the template would see the pre-rename brand in their
  filesystem and GitHub Actions UI. (#92)
- README's `## CI integration` snippet contradicted the template body —
  told consumers to drop the workflow at `.github/workflows/auto-demo-on-deploy.yml`
  while the template produced `ui-demo-runner-<sha>` artifacts. (#93)
- `.gitignore` still listed `.auto_demo/` but nothing in the codebase
  creates that dir anymore; added `.ui-demo-runner*/` glob to cover the
  three new directory shapes (narrate, split, template-driven CI). (#94)
- Wranngle-scheduling scenario had three different day-of-week references
  in one turn — `user` said "Wednesday May 28th", `book_demo` args said
  "Tuesday", confirmation reply said "Tuesday Pacific". Normalized to
  evergreen "next Wednesday" + added internal-consistency coupling test. (#82)

### Added — widget tailoring
- `render.ts` `heroCopy()` + `featureCards()` now have tailored branches
  for `medspa`, `home-services`, and `saas` verticals. Three of seven
  shipped scenarios were falling through to the generic default copy —
  their recordings showed landing pages that didn't match what the agent
  actually does. Locked with a doctrine-drift test that walks every
  shipped scenario and asserts no vertical falls through to defaults. (#83)

### Refactored — single-source constants
- `ELEVENLABS_WIDGET_VERSION` extracted as the sole bump point for the
  pinned `@elevenlabs/convai-widget-embed` version (was duplicated as a
  literal in 4 places: widget-asset.ts source + 2 TS test assertions + 1
  bats grep). bats now matches on a version pattern; the TS test pins
  the exact value via import. Future widget bumps = one-file edit. (#89)
- `SUPPORTED_ACTIONS` hoisted to a proper named export from `flow-schema.ts`.
  `src/from-url/mock-llm.ts` now derives its `actionSet` from the same
  constant — was two parallel allowlists that could silently desync if a
  new action was added to one but not the other. (#90)

### Tests + CI hardening (doctrine-drift batch)
- `tests/flow-schema.test.ts` — `timing.speed` must be in `(0, 8]` (#66);
  `polish.zoom.defaultScale` must be in `(0, 2]` (#67); `polish.captions.position`
  must be `top` or `bottom` (#68); top-level arktype reject paths
  (non-object, missing fields) (#69).
- `tests/storyboard.test.ts` — `parseManifest` reject paths (missing
  `events` array, missing `flowName`) (#70); `renderStoryboardMarkdown`
  empty-rows + populated-table + pipe-escape branches (#74).
- `tests/svg.test.ts` — `buildSvg` structural contract (XML preamble,
  per-frame `<image>` + `<animate>` count, brand drift in aria-label,
  documented 200 KB ceiling) (#71); turned the existing MAX_BYTES
  constant test into a real cross-file doctrine-drift check — parses
  README + CHANGELOG `<N>KB ceiling` strings and asserts they match
  `MAX_BYTES`. (#85)
- `tests/widget.test.ts` — `metadata.source` brand-drift coupling on
  generated flows (mock + live) (#72); `metadata.capability` +
  `metadata.vertical` conditional-spread contract (both branches) (#73);
  three missed scenario-validator reject paths (empty `reply: []`,
  omitted `reply` field, empty `say` beat) (#84); CHANGELOG six-vertical
  names list (`restaurant, dental, salon, ecommerce, medspa, home-services`)
  locked against scenarios on disk. (#87)
- `tests/vertical.test.ts` — `buildCropFilter` + `buildPadFilter` ffmpeg
  filter shape + `ASPECT_PRESETS['9:16']` dims contract (#75); new
  cross-file drift check that parses README's `(1080x1920)` claim and
  asserts width/height match the preset constant. (#86)
- `tests/narrate.test.ts` — `mockToneFrequencyHz` determinism + documented
  `[220, 660)` Hz range contract. (#76)
- `tests/flow-schema.test.ts` — README's `## Modes` bullets parsed and
  asserted equal to the runtime `SUPPORTED_ACTIONS` allowlist. Adding a
  new `DemoAction` now fails CI until README is updated. (#88)
- `tests/template-action.test.ts` — three new coupling assertions: no
  stale `auto-demo` brand in the template body; README's CI install
  snippet target filename + artifact-name prefix both match what the
  template produces; `.gitignore` covers the `.ui-demo-runner*/` directory
  family runtime defaults create. (#92, #93, #94)

### Changed — tsconfig discipline
- `noUnusedLocals` + `noUnusedParameters` now enabled in `tsconfig.json`
  — surfaced #77 as a forward gate. (#78)
- `npm update` swept in-range dep bumps: `@types/node`, `vitest`,
  transitive babel. (#80)

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
