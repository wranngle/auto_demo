#!/usr/bin/env bats
# Behaviour contract for `ui-demo-runner svg`. Round-2 §5 idx 5.
# Generates a tiny testsrc MP4, runs `svg --fixture <mp4> --out <svg>`,
# and asserts the output is a valid animated SVG under the 200KB README
# embed budget. Reuses the ffmpeg shell-out pattern from `vertical`
# (round-2 idx 1, PR #10).

setup_file() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  export REPO_ROOT
  WORK_DIR="$(mktemp -d -t ui-demo-svg-bats.XXXXXX)"
  export WORK_DIR
  export FIXTURE_VIDEO="$WORK_DIR/short-clip.mp4"
  export OUTPUT_SVG="$WORK_DIR/demo.svg"
  export CLI_ENTRY="$REPO_ROOT/dist/cli.js"

  if [ ! -f "$CLI_ENTRY" ]; then
    (cd "$REPO_ROOT" && npm run build >/dev/null 2>&1) || {
      echo "build failed -- cannot run svg bats" >&2
      return 1
    }
  fi

  ffmpeg -y -f lavfi -i "testsrc=duration=2:size=320x180:rate=12" \
    -c:v libx264 -pix_fmt yuv420p "$FIXTURE_VIDEO" >/dev/null 2>&1
}

teardown_file() {
  if [ -n "${WORK_DIR:-}" ] && [ -d "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
  fi
}

@test "svg: --fixture + --out produces an SVG containing <animate" {
  run node "$CLI_ENTRY" svg \
    --fixture "$FIXTURE_VIDEO" \
    --out "$OUTPUT_SVG" \
    --json
  [ "$status" -eq 0 ]
  [ -f "$OUTPUT_SVG" ]

  grep -q "<animate" "$OUTPUT_SVG"
  grep -q "<svg" "$OUTPUT_SVG"
}

@test "svg: output is under the 200KB README embed budget" {
  [ -f "$OUTPUT_SVG" ]
  fileSize=$(stat -c%s "$OUTPUT_SVG" 2>/dev/null || stat -f%z "$OUTPUT_SVG")
  [ "$fileSize" -gt 0 ]
  [ "$fileSize" -lt 204800 ]
}

@test "svg: embeds at least 2 base64 frames so the animation has content" {
  frameCount=$(grep -c "data:image/jpeg;base64," "$OUTPUT_SVG")
  [ "$frameCount" -ge 2 ]
}

@test "svg: shipped fixture examples/fixtures/short-clip.mp4 round-trips end-to-end" {
  SHIPPED_FIXTURE="$REPO_ROOT/examples/fixtures/short-clip.mp4"
  [ -f "$SHIPPED_FIXTURE" ]
  SHIPPED_OUT="$WORK_DIR/shipped-demo.svg"

  run node "$CLI_ENTRY" svg \
    --fixture "$SHIPPED_FIXTURE" \
    --out "$SHIPPED_OUT"
  [ "$status" -eq 0 ]
  [ -f "$SHIPPED_OUT" ]
  grep -q "<animate" "$SHIPPED_OUT"

  fileSize=$(stat -c%s "$SHIPPED_OUT" 2>/dev/null || stat -f%z "$SHIPPED_OUT")
  [ "$fileSize" -lt 204800 ]
}

@test "svg: missing --fixture file fails fast with a descriptive error" {
  run node "$CLI_ENTRY" svg \
    --fixture "$WORK_DIR/does-not-exist.mp4" \
    --out "$WORK_DIR/no.svg"
  [ "$status" -ne 0 ]
  [[ "${output}" == *"not found"* ]]
}

@test "svg: --frames below 2 is rejected" {
  run node "$CLI_ENTRY" svg \
    --fixture "$FIXTURE_VIDEO" \
    --out "$WORK_DIR/tiny.svg" \
    --frames 1
  [ "$status" -ne 0 ]
  [[ "${output}" == *"frameCount"* ]] || [[ "${output}" == *"frames"* ]]
}
