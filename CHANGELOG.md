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
- `live.avatarImage` (optional URL): replaces the widget's orb gradient
  with a brand avatar image. The runtime had read
  `body.dataset.avatarImage` since #16, but no schema field or renderer
  write existed — the read↔write drift test carved a permanent exemption
  around it. Wired end-to-end (scenario schema → `data-avatar-image` →
  `avatar-image-url`) and the exemption removed. (#140)

### Added — Recorder + flow features
- `run` — Playwright-driven flow recorder with cursor overlay, captions,
  smooth zoom/focus, screenshot artifacts, and a per-run `manifest.json`.
- `narrate` — mux a voiceover track. `--voice mock` (default) renders a
  deterministic sine tone per line; `--voice elevenlabs` performs real
  ElevenLabs TTS (voice selected via `--voice-id`, exponential backoff on
  429/5xx, hard failures throw). Without an API key the elevenlabs path
  falls back to the mock tone and the result honestly reports
  `voice: "mock"`. (#9, #134)
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
- `--quality` presets now actually deliver their bitrate: the preset's
  `videoBitrateKbps` was defined, documented, and copied into the manifest,
  but no encoder ever consumed it. The post-process encode now applies
  `-b:v`/`-maxrate`/`-bufsize` whenever a preset is set (even for
  recordings that need no retime). (#135)
- SRT caption cues now honor `timing.speed`: the runner divides every wait
  by the speed factor but cue estimation didn't, so `--captions-lang`
  tracks drifted ~35 % behind the video on 1.35× widget flows. (#135)
- Recording post-process failures are no longer swallowed: a failed
  retime/bitrate encode used to silently ship the raw stretched capture as
  success. It now warns on stderr and lands a `retime` outcome block
  (`retimed | skipped | failed`, applied ratio/bitrate, error) in
  `manifest.json`. The `events.jsonl` forensic-ledger write failure is
  likewise warned instead of ignored. (#135)
- `--speed` was dead on `widget --run` (and shadowed on `run` whenever a
  flow pinned `timing.speed`): the runner let the flow value win over the
  CLI flag. `--speed` no longer carries a default, so an explicitly passed
  value now overrides the flow's pinned speed (`options.speed ??
  flow.timing?.speed ?? 1`, still clamped to [0.25, 8]). (#136)
- `storyboard` and `watch` gain `--json` for structured pipeline output,
  matching every other subcommand; `watch --json` suppresses the
  `CHANGE_DETECTED` / `NO_CHANGE` / `RERUN_INVOKED` text sentinels so
  stdout is a single parseable document. (#136)
- `split` now delivers the README's cleanup promise: the default scratch
  dir (`.ui-demo-runner-split/`) is removed after a successful render; an
  explicit `--work-dir` is kept for inspection. (#136)
- **Live widget suite restored after workspace loss.** All 7 demo agents
  had been deleted from the ElevenLabs workspace (every `live.agentId`
  404'd), leaving the provisioning scripts green locally but dead against
  the cloud. Re-provisioned all 7 and hardened the scripts so this class
  of loss self-heals: `provision-agents.mjs` now syncs fresh agent ids
  back into each scenario file (format-preserving) and single-sources
  `first_message` from the scenario's `agent.greeting`; `tune-agents.mjs`
  gains per-scenario failure isolation (same contract as
  `record-live-demos.mjs`) and preflights `workspaceToolIds`, skipping
  dead tools with a loud warning instead of aborting the PATCH. The
  Cal.com `book_demo` workspace tool (`tool_4001…`) was also deleted and
  cannot be recreated from repo state — `wranngle-scheduling` runs
  without the real booking webhook until it is manually recreated.
  Verified end-to-end with a live recording (35 steps, branded header,
  markdown reply + client-tool confirmation link). (#137)
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
- Bats shell-integration suite (37 cases across 8 files: from-url, narrate,
  split, storyboard, svg, vertical, watch, widget) now runs in CI under the
  existing `test` job — installs bats + ffmpeg on the ubuntu-latest runner.
  Closes the doctrine gap "wire to CI before claiming done". (#25; split.bats
  added later in the autonomous-coherence sweep)
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

### Fixed — accuracy + drift cleanup
- README's `## Modes` section described `zoom` as "set document zoom for
  cleaner video framing" but the implementation is an animated cinematic
  punch-in via `smoothZoom(page, {x, y, scale, durationMs})` — a
  camera-style transform pinned at `(x, y)`, not a static viewport zoom.
  The previous prose would mislead consumers writing flows. (#110)
- Test doc comments carried 18 source-line refs (`src/flow-schema.ts:90-92`,
  `scenario.ts:186`) that drifted after PRs #88 / #90 / #105 / #106. Stripped
  every `.ts:NNN[-NNN]` suffix mechanically — comments still hint at the
  file but make no precision claim that can desync. (#107)

### Refactored — single-source constants + map-driven dispatch
- `FIT_MODES = ['crop','pad'] as const` hoisted to a single source from
  `vertical.ts`. The TS type union (in `VerticalOptions`/`VerticalResult`),
  the `commander` `.choices([...])` literal in `cli.ts`, README's `--fit
  crop`/`--fit pad` prose, and CHANGELOG's `--fit crop|pad` mention now
  all derive from or are locked against it. (#100)
- `vertical`'s `fit === 'crop' ? buildCropFilter(...) : buildPadFilter(...)`
  ternary replaced with a `Record<FitMode, FilterBuilder>` map. Adding a
  new mode without a matching builder is now a TS error rather than a
  silent fall-through to pad. Coupling test asserts each mode produces a
  distinct filter (catches a copy-paste regression). (#106)
- `KNOWN_VOICES` (narrate) promoted to a `SUPPORTED_VOICES` named export.
  CLI option help + README narration prose now locked against it. (#99)
- Widget aria-label strings (`Text message input`, `Send`) hoisted to
  `WIDGET_ARIA_LABELS` in `selectors.ts`. The mock runtime's SET (attribute
  assignment) and READ (querySelector) sides now derive from one source —
  was 4 hardcoded copies that could silently drift apart. (#103)

### Tests + CI hardening (second doctrine-drift batch)
- `tests/from-url.test.ts` — README + CHANGELOG `<N>-step` claims locked
  against the actual mock-fixture step count. Adding a 6th step to the
  fixture now fails CI until docs catch up. (#96)
- `tests/captions.test.ts` — CLI help + CHANGELOG language lists locked
  against `supportedLanguages` (#97); every non-`en` supported language
  must have a `phraseBook` entry that actually translates (catches a
  silent identity-fallback regression, not just doc drift). (#105)
- `tests/quality.test.ts` — CLI help + CHANGELOG `720p | 1080p | 4k`
  pipe-list locked against `QUALITY_PRESETS` keys. (#98)
- `tests/template-action.test.ts` — template's `playwright@<X.Y.Z>` pin
  locked against `package.json` `^X.Y.Z` minor floor (#101); template's
  `node-version: '<N>'` locked against `engines.node` floor (#102).
- `tests/widget.test.ts` — `LIVE_WIDGET_RUNTIME` `body.dataset.<camel>`
  reads must all have matching `render.ts` `data-<kebab>` writes (catches
  the silent live-widget-fails-to-mount class CodeQL can't see). (#104)
- `tests/runner-events.test.ts` — `delay(ms, timing)` (the speed adjuster
  called by 11+ Playwright wait sites) + `clamp(value, min, max)` (the
  runtime-speed gate) now have full pure-function contracts: speed
  scaling, negative-input clamp to 0, integer-rounded output, bounds
  enforcement. Co-located alongside the existing `formatEventNdjson`
  contract tests per the "one test file per project" doctrine. (#109)

### Reverted / closed
- PR #108 (extract `resolveServePath` as pure helper + 9 URL-mapping
  contract tests) closed after 4 fix-up attempts couldn't satisfy
  CodeQL's `js/path-injection` rule. The security boundary was sound
  (normalize collapses leading `..` past root + an inline barrier
  asserts `candidatePath.startsWith(rootAbs + sep)`) but the analyzer's
  interprocedural taint tracking didn't recognize the gate across any
  variation of the helper boundary. Main's serveDir is unchanged and
  has the same posture. Future options documented in PR #108's close
  comment (codeql annotation, file-whitelist serve, drop the HTTP server).

### Fixed — test-infra rename leftovers
- `tests/captions.test.ts` was the lone survivor from PR #88's brand-rename
  sweep of test mktemp prefixes — still wrote `auto-demo-captions-` while
  every other test (storyboard, from-url, split, flow-schema, widget,
  vertical/narrate/svg bats) had moved to `ui-demo-*`. Renamed to
  `ui-demo-captions-`. (#112)
- Dead `.auto_demo/` line in `.gitignore` removed. PR #94 added
  `.ui-demo-runner*/` and kept the legacy entry "for one-release
  back-compat"; 18 releases later nothing in src/, scripts/, templates/,
  or dist/ ever creates a `.auto_demo/` directory. The only references
  are regex literals in tests/template-action.test.ts asserting the
  brand is gone — independent of this line. (#113)

### Tests + CI hardening (third doctrine-drift batch)
- `tests/template-action.test.ts`: new meta-drift test scans every
  `tests/*.ts` file for `mkdtemp(join(tmpdir(), '<prefix>'))` literals
  and asserts each prefix starts with the current brand `ui-demo-` or
  is in the documented allowlist (`regress-test-`). Would have caught
  the #112 survivor at the time of the original sweep — locks the
  convention so the next renamer cannot silently leave another stale
  prefix behind. (#112)
- `tests/load-elevenlabs-key.test.ts`: 8 new contract tests for
  `scripts/_lib/load-elevenlabs-key.mjs` — the single credential-
  resolution seam for all 3 agent-provisioning scripts (extracted in
  PR #65, previously zero coverage). Locks env-var-wins-over-file,
  surrounding-quote stripping (both `"` and `'`), inner-quote
  preservation, the documented throw message in both file-missing
  and key-missing branches, and trailing-whitespace trimming. Test
  isolation via `vi.stubEnv('HOME', mkdtemp(...))` so the operator's
  real `~/.agents/.env` is never touched. (#115)
- `scripts/_lib/load-elevenlabs-key.d.mts` added (one-line declaration)
  so TS LSP can resolve the `.mjs` import from test code without
  enabling `allowJs` globally. (#115)

### Fixed — recording batch robustness
- `scripts/record-live-demos.mjs`: per-scenario try/catch + tally
  (`ok / failed / skipped`) + summary at end. A single agent stall
  (browser drop, network blip, quota glitch) no longer aborts the
  remaining recordings. Sets `process.exitCode = 1` only if at least
  one scenario failed, so the operator sees the full batch state.
  Observed today: `ecommerce-returns` failed with `page.waitForTimeout:
  Target page, context or browser has been closed` partway through;
  without this fix the batch stalled after scenario 1 leaving 5
  unrefreshed. (#114)

### Added — coexistence with parallel Chromium workloads
- `scripts/record-live-demos.mjs`: opt-in memory gate via env vars,
  default behavior byte-equivalent to before. Set `MIN_AVAIL_GIB=N`
  (e.g. `2`) and the batch polls `/proc/meminfo`'s `MemAvailable`
  before each scenario, waiting up to `MIN_AVAIL_TIMEOUT_MIN=30`
  minutes (poll cadence `MIN_AVAIL_POLL_SEC=30`s) for the threshold.
  Lets the recording batch coexist with a parallel
  Playwright/Chromium workload on the same host without OOM-ing
  either side. Non-Linux machines skip the gate (parse returns null),
  preserving old behavior. (#116)

### Changed — recording pacing (designed with intention)
- Live widget flows now apply per-turn cinematic pacing instead of
  a uniform metronome. Each turn gets (a) a `Compose breath` pause
  between `fill` and `click(Send)` — 350ms normally, 500ms on the
  last turn (commitment beat); (b) a post-reply hold extended by
  `replyHoldBonus(reply, isFirst, isLast)` — +400ms first turn
  (orient), +600ms last turn (resolve), +500ms when the reply is
  rich (>2 pieces OR final say >80 chars); bonuses compose. First
  slow → middle fast → last slow + extra commit. (#118)
- New exported pure helper `replyHoldBonus(reply, isFirst, isLast)`
  with 8 contract tests in `tests/widget.test.ts` locking the bonus
  shape — a "simplification" back to uniform pacing fails the test,
  not the user experience. (#118)
- Mock flow gets the same per-turn variation (compose breath, hold
  bonus) — scaled smaller for mock's 1.35x playback speed (260ms /
  360ms compose breath). Pure reuse of `replyHoldBonus`. (#120)

### Added — documented operator subcommands
- `split` and `storyboard` CLI subcommands now have dedicated README
  sections (`## Split-screen export`, `## Storyboard (markdown
  summary of a recorded run)`). Both have shipped in `src/cli.ts`
  for releases but were previously invisible in the README. (#119)
- New doctrine-drift test in `tests/flow-schema.test.ts` parses every
  `.command(...)` in `src/cli.ts` and asserts each subcommand name
  appears in README.md as either `ui-demo-runner <cmd>` or
  `node dist/cli.js <cmd>`. Future subcommand additions fail CI
  until the README catches up. (#119)

### Tests + CI hardening (fourth doctrine-drift batch)
- `tests/widget.test.ts`: 3 mock ↔ live pacing parity tests. The
  existing `replyHoldBonus` contract (#118) locks the helper's shape
  but does not lock the fact that both flow builders actually call
  it. Behavioral assertion: a 3-turn scenario produces non-uniform
  `Hold on answer N` durations AND one `Compose breath` per turn
  in BOTH mock and live flows. A future refactor that strips
  variation from one path silently passes the helper tests but
  fails these. (#122)
- `tests/template-action.test.ts`: scripts-edition brand-drift lock.
  Sibling to the test-infra mktemp lock (#112): scans every
  `scripts/*.mjs` for `auto[-_]demo` brand strings and fails.
  Documented allowlist: comment references to the historical
  archived branch `archive/auto-demo-merger-2026-05-25` are
  preserved. (#123)
- `tests/flow-schema.test.ts`: smoke-demo README ↔ package.json ↔
  flow ↔ runner coupling lock. Parses README's "## Run the smoke
  demo" output bullets and asserts each path lives under the
  script's `--output` dir, each runner-emitted filename
  (`recording.webm`, `manifest.json`, `events.jsonl`) appears as
  a bullet basename AND is still a literal in `runner.ts`, and
  the `screenshots/<name>.png` bullet's name matches a real
  screenshot step in the smoke flow file. (#125)
- `tests/split.bats`: CLI-surface bats coverage for `split` — the
  seven other shipped subcommands all had bats; `split` had only
  vitest. Three behavior-focused tests (1920×1080 frame from
  `<flow>` + `<recording>`, `--json` structured result, missing
  recording file fails fast). CHANGELOG bats count bumped from
  29 → 32 cases across 8 files. (#126)

### Fixed — scripts hygiene + dead surface
- `scripts/provision-agents.mjs`: stale brand tag `auto-demo-suite`
  → `ui-demo-runner-suite` (survivor of PR #18's brand rename
  affecting the ElevenLabs API `tags` field on agent creation).
  Cloud agents created earlier carry their original tags; this
  fixes the source so future creates use the current brand. (#123)
- `src/cli.ts` `watch --interval <ms>`: dead CLI option removed.
  The value parsed to an integer (default 60000) but was never
  used — `watchOnce()` has no polling path, and the action handler
  exits 2 unless `--once` is passed. README's matching claim about
  a "polling-loop variant gated out of this release" was misleading
  in the same direction; corrected to say `--once` is the only
  mode wired today and guide operators to wire polling externally
  via cron / nodemon / CI scheduled workflow. (#124)

### Refactored — single-source constants
- `scripts/_lib/elevenlabs-api.mjs` (new): `ELEVENLABS_AGENTS_API`
  base URL extracted from the two duplicate `const API` literals in
  `scripts/provision-agents.mjs` and `scripts/tune-agents.mjs`. Both
  consumers re-import under the same local name (`API`); fetch sites
  are byte-identical. Plus `scripts/_lib/elevenlabs-api.d.mts`
  (one-line TS declaration) mirroring the pattern PR #115 used for
  `load-elevenlabs-key.d.mts`. (#127)

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
