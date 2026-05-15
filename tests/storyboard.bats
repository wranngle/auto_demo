#!/usr/bin/env bats

# auto-demo storyboard subcommand: renders a markdown storyboard
# from a recorded run directory's manifest.json. Asserts the
# central promise (image link + timestamp + narration per keyframe)
# against fixtures/run-fixture/ which carries 4 artifact rows.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
  FIXTURE_SRC="$REPO_ROOT/fixtures/run-fixture"
  WORK_DIR="$(mktemp -d)"
  RUN_DIR="$WORK_DIR/run-fixture"
  cp -R "$FIXTURE_SRC" "$RUN_DIR"
  CLI="$REPO_ROOT/dist/cli.js"

  if [ ! -f "$CLI" ]; then
    (cd "$REPO_ROOT" && npm run build >/dev/null 2>&1)
  fi
}

teardown() {
  rm -rf "$WORK_DIR"
}

@test "storyboard: emits storyboard.md inside the run directory" {
  run node "$CLI" storyboard "$RUN_DIR"
  [ "$status" -eq 0 ]
  [ -f "$RUN_DIR/storyboard.md" ]
}

@test "storyboard: renders at least three keyframe rows (image, timestamp, narration)" {
  run node "$CLI" storyboard "$RUN_DIR"
  [ "$status" -eq 0 ]

  storyboard="$RUN_DIR/storyboard.md"
  [ -f "$storyboard" ]

  # Count data rows in the markdown table: lines that start with "| 1 ", "| 2 ", ...
  row_count="$(grep -cE '^\| [0-9]+ \|' "$storyboard")"
  [ "$row_count" -ge 3 ]

  # Each data row must carry an image link, an ISO timestamp, and narration text.
  grep -qE '^\| 1 \| !\[.*\]\(screenshots/.+\.png\) \| 2026-05-14T[0-9:.Z]+ \| ' "$storyboard"
  grep -qE '^\| 2 \| !\[.*\]\(screenshots/.+\.png\) \| 2026-05-14T[0-9:.Z]+ \| ' "$storyboard"
  grep -qE '^\| 3 \| !\[.*\]\(screenshots/.+\.png\) \| 2026-05-14T[0-9:.Z]+ \| ' "$storyboard"
}

@test "storyboard: prints keyframe count to stdout" {
  run node "$CLI" storyboard "$RUN_DIR"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Storyboard:"* ]]
  [[ "$output" == *"keyframes"* ]]
}

@test "storyboard: exits non-zero when manifest is missing" {
  bogus_dir="$WORK_DIR/missing"
  mkdir -p "$bogus_dir"
  run node "$CLI" storyboard "$bogus_dir"
  [ "$status" -ne 0 ]
}
