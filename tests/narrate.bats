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
  if [ -f "${WORK_DIR:-}/mock-server.pid" ]; then
    kill "$(cat "$WORK_DIR/mock-server.pid")" 2>/dev/null || true
  fi
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

@test "narrate: --voice elevenlabs WITH key fails fast when the API is unreachable (no silent mock fallback)" {
  # Once a key is provided the operator asked for real synthesis; a network
  # failure must surface as an error, never silently degrade to the mock
  # tone. ELEVENLABS_TTS_API points at an unroutable local port so the test
  # stays offline and deterministic. Locks the honesty contract from the
  # other side: result.voice == what actually ran, and 'nothing ran' is an
  # error, not a mock recording.
  outputWithKey="$WORK_DIR/elevenlabs-with-key.mp4"
  ELEVENLABS_API_KEY="dummy-key-for-test" \
    ELEVENLABS_TTS_API="http://127.0.0.1:9/v1/text-to-speech" \
    run node "$CLI_ENTRY" narrate \
    --script "$SCRIPT_PATH" \
    --in "$INPUT_VIDEO" \
    --out "$outputWithKey" \
    --voice elevenlabs \
    --json
  [ "$status" -ne 0 ]
  [[ "${output}" == *"ElevenLabs TTS request failed"* ]]
  [ ! -f "$outputWithKey" ]
}

@test "narrate: --voice elevenlabs against a reachable API performs real synthesis end-to-end" {
  # Full success-path integration, offline: a local HTTP server plays the
  # ElevenLabs API and returns a real (tiny) mp3 for every POST, so the CLI
  # exercises fetch -> decode -> mix -> mux and must report voice=elevenlabs.
  mockMp3="$WORK_DIR/mock-tts.mp3"
  ffmpeg -y -f lavfi -i "sine=frequency=440:duration=0.4:sample_rate=44100" \
    -ac 1 -acodec libmp3lame -b:a 128k "$mockMp3" >/dev/null 2>&1

  portFile="$WORK_DIR/mock-port"
  rm -f "$portFile"
  node -e '
    const {createServer} = require("node:http");
    const {readFileSync} = require("node:fs");
    const bytes = readFileSync(process.argv[1]);
    createServer((req, res) => {
      res.writeHead(200, {"content-type": "audio/mpeg"});
      res.end(bytes);
    }).listen(0, "127.0.0.1", function () {
      console.log(String(this.address().port));
    });
  ' "$mockMp3" > "$portFile" 2>/dev/null 3>&- &
  echo "$!" > "$WORK_DIR/mock-server.pid"

  for _ in $(seq 1 50); do
    [ -s "$portFile" ] && break
    sleep 0.1
  done
  [ -s "$portFile" ]
  mockPort="$(cat "$portFile")"

  outputSuccess="$WORK_DIR/elevenlabs-success.mp4"
  ELEVENLABS_API_KEY="dummy-key-for-test" \
    ELEVENLABS_TTS_API="http://127.0.0.1:$mockPort/v1/text-to-speech" \
    run node "$CLI_ENTRY" narrate \
    --script "$SCRIPT_PATH" \
    --in "$INPUT_VIDEO" \
    --out "$outputSuccess" \
    --voice elevenlabs \
    --json

  kill "$(cat "$WORK_DIR/mock-server.pid")" 2>/dev/null || true

  [ "$status" -eq 0 ]
  [ -f "$outputSuccess" ]
  [[ "${output}" == *"\"voice\": \"elevenlabs\""* ]]

  audioStreams=$(ffprobe -v error -select_streams a -show_entries stream=codec_type \
    -of csv=p=0 "$outputSuccess" | wc -l)
  [ "$audioStreams" -ge 1 ]
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
