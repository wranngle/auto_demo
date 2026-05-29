#!/usr/bin/env bats
# Behaviour-level contract for `ui-demo-runner split`. Generates a small
# testsrc clip + a synthetic .demo.json flow, runs `split`, and asserts the
# output MP4 has the documented 1920x1080 frame dimensions. Mirrors the
# vertical.bats / narrate.bats style so the seven shipped subcommands all
# have parallel CLI-surface coverage (split was the gap).

setup_file() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  export REPO_ROOT
  WORK_DIR="$(mktemp -d -t ui-demo-split-bats.XXXXXX)"
  export WORK_DIR
  export INPUT_VIDEO="$WORK_DIR/recording.mp4"
  export FLOW_PATH="$WORK_DIR/scene.demo.json"
  export OUTPUT_VIDEO="$WORK_DIR/split.mp4"
  export CLI_ENTRY="$REPO_ROOT/dist/cli.js"

  if [ ! -f "$CLI_ENTRY" ]; then
    (cd "$REPO_ROOT" && npm run build >/dev/null 2>&1) || {
      echo "build failed -- cannot run split bats" >&2
      return 1
    }
  fi

  ffmpeg -y -f lavfi -i "testsrc=duration=3:size=1280x720:rate=15" \
    -c:v libx264 -pix_fmt yuv420p "$INPUT_VIDEO" >/dev/null 2>&1

  cat >"$FLOW_PATH" <<'JSON'
{
  "name": "split-bats-fixture",
  "startUrl": "about:blank",
  "steps": [
    {"action": "caption", "text": "First beat", "label": "Beat one"},
    {"action": "caption", "text": "Second beat", "label": "Beat two"},
    {"action": "caption", "text": "Third beat", "label": "Beat three"}
  ]
}
JSON
}

teardown_file() {
  if [ -n "${WORK_DIR:-}" ] && [ -d "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
  fi
}

@test "split: produces a 1920x1080 MP4 from <flow> + <recording>" {
  run node "$CLI_ENTRY" split \
    "$FLOW_PATH" "$INPUT_VIDEO" \
    --output "$OUTPUT_VIDEO" \
    --work-dir "$WORK_DIR/scratch"
  [ "$status" -eq 0 ]
  [ -f "$OUTPUT_VIDEO" ]

  fileSize=$(stat -c%s "$OUTPUT_VIDEO" 2>/dev/null || stat -f%z "$OUTPUT_VIDEO")
  [ "$fileSize" -gt 0 ]

  dims=$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=width,height -of csv=p=0 "$OUTPUT_VIDEO")
  width=$(echo "$dims" | cut -d, -f1)
  height=$(echo "$dims" | cut -d, -f2)
  [ "$width" -eq 1920 ]
  [ "$height" -eq 1080 ]
}

@test "split: --json emits a structured result naming the output path + dimensions" {
  JSON_OUT="$WORK_DIR/split-json.mp4"
  run node "$CLI_ENTRY" split \
    "$FLOW_PATH" "$INPUT_VIDEO" \
    --output "$JSON_OUT" \
    --work-dir "$WORK_DIR/scratch-json" \
    --json
  [ "$status" -eq 0 ]
  [[ "${output}" == *"\"outputPath\""* ]]
  [[ "${output}" == *"\"width\": 1920"* ]]
  [[ "${output}" == *"\"height\": 1080"* ]]
}

@test "split: missing recording file fails fast with the documented error" {
  run node "$CLI_ENTRY" split \
    "$FLOW_PATH" "$WORK_DIR/does-not-exist.mp4" \
    --output "$WORK_DIR/should-not-exist.mp4"
  [ "$status" -ne 0 ]
  [[ "${output}" == *"not found"* ]]
}
