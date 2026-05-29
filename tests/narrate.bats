#!/usr/bin/env bats
# Behaviour-level contract for `ui-demo-runner narrate`. The test boots a
# disposable 5s `testsrc` clip, runs narrate with `--voice mock`, and asserts
# the produced MP4 carries >=1 video + >=1 audio stream (per round-2 plan §5).

setup_file() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  export REPO_ROOT
  WORK_DIR="$(mktemp -d -t ui-demo-narrate-bats.XXXXXX)"
  export WORK_DIR
  export INPUT_VIDEO="$WORK_DIR/input.mp4"
  export OUTPUT_VIDEO="$WORK_DIR/narrated.mp4"
  export SCRIPT_PATH="$REPO_ROOT/fixtures/short-script.txt"
  export CLI_ENTRY="$REPO_ROOT/dist/cli.js"

  if [ ! -f "$CLI_ENTRY" ]; then
    (cd "$REPO_ROOT" && npm run build >/dev/null 2>&1) || {
      echo "build failed — cannot run narrate bats" >&2
      return 1
    }
  fi

  ffmpeg -y -f lavfi -i "testsrc=duration=5:size=320x240:rate=15" \
    -c:v libx264 -pix_fmt yuv420p "$INPUT_VIDEO" >/dev/null 2>&1
}

teardown_file() {
  if [ -n "${WORK_DIR:-}" ] && [ -d "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
  fi
}

@test "narrate: mock voice produces MP4 with >=1 audio + >=1 video stream" {
  run node "$CLI_ENTRY" narrate \
    --script "$SCRIPT_PATH" \
    --in "$INPUT_VIDEO" \
    --out "$OUTPUT_VIDEO" \
    --voice mock \
    --json
  [ "$status" -eq 0 ]
  [ -f "$OUTPUT_VIDEO" ]

  fileSize=$(stat -c%s "$OUTPUT_VIDEO" 2>/dev/null || stat -f%z "$OUTPUT_VIDEO")
  [ "$fileSize" -gt 0 ]

  videoStreams=$(ffprobe -v error -select_streams v -show_entries stream=codec_type \
    -of csv=p=0 "$OUTPUT_VIDEO" | wc -l)
  audioStreams=$(ffprobe -v error -select_streams a -show_entries stream=codec_type \
    -of csv=p=0 "$OUTPUT_VIDEO" | wc -l)
  [ "$videoStreams" -ge 1 ]
  [ "$audioStreams" -ge 1 ]
}

@test "narrate: unknown --voice fails with a descriptive error" {
  run node "$CLI_ENTRY" narrate \
    --script "$SCRIPT_PATH" \
    --in "$INPUT_VIDEO" \
    --out "$OUTPUT_VIDEO" \
    --voice nonsense-voice-id
  [ "$status" -ne 0 ]
  [[ "${output}" == *"Unknown voice"* ]]
}

@test "narrate: --voice elevenlabs without API key falls back to mock and still ships audio" {
  outputFallback="$WORK_DIR/elevenlabs-fallback.mp4"
  unset ELEVENLABS_API_KEY
  run env -u ELEVENLABS_API_KEY node "$CLI_ENTRY" narrate \
    --script "$SCRIPT_PATH" \
    --in "$INPUT_VIDEO" \
    --out "$outputFallback" \
    --voice elevenlabs \
    --json
  [ "$status" -eq 0 ]
  [ -f "$outputFallback" ]
  [[ "${output}" == *"\"voice\": \"mock\""* ]]
}

@test "narrate: --voice elevenlabs WITH API key still reports voice=mock (stub not wired)" {
  # The synthesize-elevenlabs branch is intentionally a thin stub that falls
  # through to the mock tone (see src/modes/narrate.ts comment). Until the
  # real network call is wired, the JSON result must NOT claim 'elevenlabs'
  # as the voice — it would be lying to the operator who set the key.
  # Locks the honesty contract: result.voice == what actually ran.
  outputWithKey="$WORK_DIR/elevenlabs-with-key.mp4"
  ELEVENLABS_API_KEY="dummy-key-for-test" run node "$CLI_ENTRY" narrate \
    --script "$SCRIPT_PATH" \
    --in "$INPUT_VIDEO" \
    --out "$outputWithKey" \
    --voice elevenlabs \
    --json
  [ "$status" -eq 0 ]
  [ -f "$outputWithKey" ]
  [[ "${output}" == *"\"voice\": \"mock\""* ]]
}

@test "narrate: missing input video surfaces a clear error" {
  run node "$CLI_ENTRY" narrate \
    --script "$SCRIPT_PATH" \
    --in "$WORK_DIR/does-not-exist.mp4" \
    --out "$OUTPUT_VIDEO" \
    --voice mock
  [ "$status" -ne 0 ]
  [[ "${output}" == *"Input video not found"* ]]
}
