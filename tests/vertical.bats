#!/usr/bin/env bats
# Behaviour-level contract for `ui-demo-runner vertical`. Generates a 1280x720
# testsrc clip, runs `vertical --aspect 9:16`, and asserts ffprobe reports the
# output MP4 has a 9:16 frame (width/height ratio in [0.55, 0.57]).
# Round-2 plan §5 idx 1.

setup_file() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  export REPO_ROOT
  WORK_DIR="$(mktemp -d -t ui-demo-vertical-bats.XXXXXX)"
  export WORK_DIR
  export INPUT_VIDEO="$WORK_DIR/landscape.mp4"
  export OUTPUT_VIDEO="$WORK_DIR/vertical.mp4"
  export CLI_ENTRY="$REPO_ROOT/dist/cli.js"

  if [ ! -f "$CLI_ENTRY" ]; then
    (cd "$REPO_ROOT" && npm run build >/dev/null 2>&1) || {
      echo "build failed -- cannot run vertical bats" >&2
      return 1
    }
  fi

  ffmpeg -y -f lavfi -i "testsrc=duration=2:size=1280x720:rate=15" \
    -c:v libx264 -pix_fmt yuv420p "$INPUT_VIDEO" >/dev/null 2>&1
}

teardown_file() {
  if [ -n "${WORK_DIR:-}" ] && [ -d "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
  fi
}

@test "vertical: --aspect 9:16 produces MP4 with ratio in [0.55, 0.57]" {
  run node "$CLI_ENTRY" vertical \
    --in "$INPUT_VIDEO" \
    --out "$OUTPUT_VIDEO" \
    --aspect 9:16 \
    --json
  [ "$status" -eq 0 ]
  [ -f "$OUTPUT_VIDEO" ]

  fileSize=$(stat -c%s "$OUTPUT_VIDEO" 2>/dev/null || stat -f%z "$OUTPUT_VIDEO")
  [ "$fileSize" -gt 0 ]

  dims=$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=width,height -of csv=p=0 "$OUTPUT_VIDEO")
  width=$(echo "$dims" | cut -d, -f1)
  height=$(echo "$dims" | cut -d, -f2)
  [ "$width" -eq 1080 ]
  [ "$height" -eq 1920 ]

  # ratio = width / height, asserted in [0.55, 0.57] via integer scaling (*1000).
  ratioMilli=$(( (width * 1000) / height ))
  [ "$ratioMilli" -ge 550 ]
  [ "$ratioMilli" -le 570 ]
}

@test "vertical: --fit pad produces same 9:16 frame dimensions" {
  PAD_OUT="$WORK_DIR/vertical-pad.mp4"
  run node "$CLI_ENTRY" vertical \
    --in "$INPUT_VIDEO" \
    --out "$PAD_OUT" \
    --aspect 9:16 \
    --fit pad
  [ "$status" -eq 0 ]
  [ -f "$PAD_OUT" ]

  dims=$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=width,height -of csv=p=0 "$PAD_OUT")
  width=$(echo "$dims" | cut -d, -f1)
  height=$(echo "$dims" | cut -d, -f2)
  [ "$width" -eq 1080 ]
  [ "$height" -eq 1920 ]
}

@test "vertical: unknown --aspect fails with a descriptive error" {
  run node "$CLI_ENTRY" vertical \
    --in "$INPUT_VIDEO" \
    --out "$WORK_DIR/should-not-exist.mp4" \
    --aspect 4:3
  [ "$status" -ne 0 ]
  [[ "${output}" == *"Unknown aspect"* ]]
}

@test "vertical: missing input file fails fast" {
  run node "$CLI_ENTRY" vertical \
    --in "$WORK_DIR/does-not-exist.mp4" \
    --out "$WORK_DIR/no.mp4" \
    --aspect 9:16
  [ "$status" -ne 0 ]
  [[ "${output}" == *"not found"* ]]
}
