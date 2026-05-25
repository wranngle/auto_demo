#!/usr/bin/env bats

# widget subcommand: compile an ElevenLabs widget chat scenario into a landing
# page + demo flow. The shipped examples are LIVE scenarios (real
# <elevenlabs-convai> bound to an agent); the same scenario also drives the
# deterministic mock when its `live` block is absent.
#
# Asserts the central promise without a browser or the network:
#   - exit 0; writes <name>.html + <name>.demo.json
#   - live page embeds the pinned CDN widget + the agent id (no mock script)
#   - the flow types + sends every turn and holds a pause for the live reply
#   - generation is deterministic
#   - an invalid scenario exits non-zero
#
# The real-agent recording is exercised by `widget --run` (chromium + quota),
# not here.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  CLI="$REPO_ROOT/dist/cli.js"
  SCENARIO="$REPO_ROOT/examples/widget/dental-emergency.scenario.json"
  WORK_DIR="$(mktemp -d)"
  if [[ ! -f "$CLI" ]]; then
    (cd "$REPO_ROOT" && npm run build >/dev/null)
  fi
}

teardown() {
  rm -rf "$WORK_DIR"
}

@test "widget: generates a live page embedding the real widget + the agent id" {
  run node "$CLI" widget "$SCENARIO" --out-dir "$WORK_DIR"
  [ "$status" -eq 0 ]

  html="$WORK_DIR/tidewater-family-dental.html"
  flow="$WORK_DIR/tidewater-family-dental.demo.json"
  [ -s "$html" ]
  [ -s "$flow" ]

  grep -q "@elevenlabs/convai-widget-embed@0.12.2" "$html"
  grep -q 'data-agent-id="agent_' "$html"
  # Live mode must NOT inline the deterministic mock script.
  ! grep -q 'id="convai-scenario"' "$html"
}

@test "widget: live flow types + sends every turn and holds a pause for the reply" {
  run node "$CLI" widget "$SCENARIO" --out-dir "$WORK_DIR"
  [ "$status" -eq 0 ]

  flow="$WORK_DIR/tidewater-family-dental.demo.json"
  contract_ok=$(python3 -c '
import json, sys
flow = json.load(open(sys.argv[1]))
steps = flow["steps"]
fills = [s for s in steps if s["action"] == "fill"]
sends = [s for s in steps if s["action"] == "click" and s.get("selector", "").endswith("Send\"]")]
replies = [s for s in steps if "reply" in s.get("label", "")]
assert len(fills) == 3, f"fills={len(fills)}"
assert len(sends) == 3, f"sends={len(sends)}"
assert len(replies) == 3, f"replies={len(replies)}"
assert all(s["action"] == "pause" for s in replies), "live replies must be pauses"
assert flow["metadata"]["mode"] == "live"
assert flow["metadata"]["agentId"].startswith("agent_")
assert steps[-1]["action"] == "screenshot"
print("ok")
' "$flow")
  [ "$contract_ok" = "ok" ]
}

@test "widget: generation is deterministic (byte-identical flow)" {
  run node "$CLI" widget "$SCENARIO" --out-dir "$WORK_DIR/a"
  [ "$status" -eq 0 ]
  run node "$CLI" widget "$SCENARIO" --out-dir "$WORK_DIR/b"
  [ "$status" -eq 0 ]
  cmp -s "$WORK_DIR/a/tidewater-family-dental.demo.json" "$WORK_DIR/b/tidewater-family-dental.demo.json"
}

@test "widget: an invalid scenario exits non-zero" {
  bad="$WORK_DIR/bad.scenario.json"
  printf '%s' '{"name":"x","business":{"name":"b","tagline":"t","accent":"nope"},"agent":{"name":"a","greeting":"g"},"turns":[{"user":"u","reply":[{"say":"s"}]}]}' > "$bad"
  run node "$CLI" widget "$bad" --out-dir "$WORK_DIR"
  [ "$status" -ne 0 ]
}
