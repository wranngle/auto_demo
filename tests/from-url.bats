#!/usr/bin/env bats

# from-url subcommand: deterministic 5-step script from a mock LLM client.
#
# Asserts the contract called out in DESIGN/feature plan §5.3:
#   - exit 0 on happy path
#   - script JSON has steps[] with selector, action, narration on every step
#   - script is deterministic across invocations
#   - --out writes the script JSON to disk

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  CLI="$REPO_ROOT/dist/cli.js"
  if [[ ! -f "$CLI" ]]; then
    (cd "$REPO_ROOT" && npm run build >/dev/null)
  fi
}

@test "from-url: happy path produces a 5-step script with selector, action, narration on every step" {
  run node "$CLI" from-url https://example.com/billing --goal "show how to add a credit card"
  [ "$status" -eq 0 ]

  # All five required keys appear; steps[] has exactly 5 entries.
  steps_count=$(printf '%s' "$output" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d["steps"]))')
  [ "$steps_count" -eq 5 ]

  # Every step has the three required fields (selector, action, narration), non-empty.
  contract_ok=$(printf '%s' "$output" | python3 -c '
import json, sys
script = json.load(sys.stdin)
for i, step in enumerate(script["steps"]):
    for key in ("selector", "action", "narration"):
        assert key in step and isinstance(step[key], str) and step[key], f"step[{i}] missing {key}"
print("ok")
')
  [ "$contract_ok" = "ok" ]
}

@test "from-url: deterministic — two runs produce byte-identical output" {
  run node "$CLI" from-url https://example.com/billing --goal "show how to add a credit card"
  [ "$status" -eq 0 ]
  first_run="$output"

  run node "$CLI" from-url https://example.com/billing --goal "show how to add a credit card"
  [ "$status" -eq 0 ]
  [ "$output" = "$first_run" ]
}

@test "from-url: --out writes the script JSON to disk" {
  tmpfile="$(mktemp -d)/script.json"
  run node "$CLI" from-url https://example.com/billing --goal "demo" --out "$tmpfile"
  [ "$status" -eq 0 ]
  [ -s "$tmpfile" ]

  steps_count=$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))["steps"]))' "$tmpfile")
  [ "$steps_count" -eq 5 ]
}
