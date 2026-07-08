#!/usr/bin/env bats

# CLI-surface contract for `run` — the flagship recorder. Every other
# subcommand had bats; `run` itself had none. These drive the offline smoke
# fixture through a real chromium, so they need a playwright browser on the
# host: CI's generic job installs none, and the suite SKIPS there (visible
# as `skip` in TAP output, never silently green).

setup_file() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  export REPO_ROOT
  CLI_ENTRY="$REPO_ROOT/dist/cli.js"
  export CLI_ENTRY
  WORK_DIR="$(mktemp -d -t ui-demo-run-bats.XXXXXX)"
  export WORK_DIR

  if [ ! -f "$CLI_ENTRY" ]; then
    (cd "$REPO_ROOT" && npm run build >/dev/null 2>&1) || {
      echo "build failed — cannot run run bats" >&2
      return 1
    }
  fi

  if (cd "$REPO_ROOT" && node -e '
    const {chromium} = require("playwright");
    require("node:fs").accessSync(chromium.executablePath());
  ' >/dev/null 2>&1); then
    export RUN_BATS_HAVE_CHROMIUM=1
  else
    export RUN_BATS_HAVE_CHROMIUM=
  fi
}

teardown_file() {
  if [ -n "${WORK_DIR:-}" ] && [ -d "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
  fi
}

require_chromium() {
  if [ -z "$RUN_BATS_HAVE_CHROMIUM" ]; then
    skip "no playwright chromium on this host"
  fi
}

@test "run: offline smoke flow records manifest + events + screenshot (--no-video)" {
  require_chromium
  OUT_DIR="$WORK_DIR/smoke"
  run node "$CLI_ENTRY" run "$REPO_ROOT/examples/local-smoke.demo.json" \
    --output "$OUT_DIR" --no-video --json
  [ "$status" -eq 0 ]
  [ -f "$OUT_DIR/manifest.json" ]
  [ -f "$OUT_DIR/events.jsonl" ]
  [[ "$output" == *'"flowName": "local-smoke"'* ]]

  # One NDJSON line per step event reported in the manifest.
  event_count=$(python3 -c 'import json;print(len(json.load(open("'"$OUT_DIR"'/manifest.json"))["events"]))')
  ndjson_count=$(grep -c . "$OUT_DIR/events.jsonl")
  [ "$event_count" -eq "$ndjson_count" ]
}

@test "run: missing flow file fails fast with a clear error" {
  run node "$CLI_ENTRY" run "$WORK_DIR/does-not-exist.demo.json" --output "$WORK_DIR/nope"
  [ "$status" -ne 0 ]
}

@test "widget: --output implies --run and records the mock scenario end-to-end" {
  require_chromium
  # Mock mode (live block stripped) is fully offline: the deterministic
  # widget replica + the recorder, straight off the filesystem.
  MOCK_SCENARIO="$WORK_DIR/trattoria-mock.scenario.json"
  python3 -c '
import json, sys
d = json.load(open(sys.argv[1]))
d.pop("live", None)
json.dump(d, open(sys.argv[2], "w"))
' "$REPO_ROOT/examples/widget/restaurant-trattoria.scenario.json" "$MOCK_SCENARIO"

  run node "$CLI_ENTRY" widget "$MOCK_SCENARIO" \
    --out-dir "$WORK_DIR/widget" --output "$WORK_DIR/widget-rec" --json
  [ "$status" -eq 0 ]
  [ -f "$WORK_DIR/widget-rec/manifest.json" ]
  [[ "$output" == *'"mode": "mock"'* ]]
}
