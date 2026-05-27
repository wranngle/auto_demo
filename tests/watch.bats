#!/usr/bin/env bats

# watch subcommand: detects DOM-hash differences between two fixtures and
# triggers the re-run hook exactly once. The --once flag keeps tests
# deterministic — no actual polling loop is exercised.
#
# Asserts the contract called out in feature-plan §5.4:
#   - exit 0 on happy path
#   - emits a `CHANGE_DETECTED` log line when the DOMs differ
#   - the re-run hook fires exactly once per change
#   - identical fixtures emit `NO_CHANGE` and skip the re-run
#   - polling loop (no --once) is refused in this release

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  CLI="$REPO_ROOT/dist/cli.js"
  if [[ ! -f "$CLI" ]]; then
    (cd "$REPO_ROOT" && npm run build >/dev/null)
  fi
  OLD="$REPO_ROOT/fixtures/old-dom.html"
  NEW="$REPO_ROOT/fixtures/new-dom.html"
}

@test "watch --once: CHANGE_DETECTED when DOMs differ" {
  run node "$CLI" watch --once --fixture "$OLD" --next "$NEW"
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -q '^CHANGE_DETECTED '
}

@test "watch --once: re-run hook invoked exactly once on change" {
  run node "$CLI" watch --once --fixture "$OLD" --next "$NEW"
  [ "$status" -eq 0 ]
  rerun_lines=$(printf '%s\n' "$output" | grep -c '^RERUN_INVOKED ' || true)
  [ "$rerun_lines" -eq 1 ]
  printf '%s\n' "$output" | grep -q '^RERUN_INVOKED count=1$'
}

@test "watch --once: identical fixtures emit NO_CHANGE and skip re-run" {
  run node "$CLI" watch --once --fixture "$OLD" --next "$OLD"
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -q '^NO_CHANGE '
  ! printf '%s\n' "$output" | grep -q '^CHANGE_DETECTED '
  ! printf '%s\n' "$output" | grep -q '^RERUN_INVOKED '
}

@test "watch: refuses to run without --once (no real polling loop in this release)" {
  run node "$CLI" watch --fixture "$OLD" --next "$NEW"
  [ "$status" -ne 0 ]
}
