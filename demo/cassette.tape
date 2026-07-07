# demo/cassette.tape — VHS recording script (https://github.com/charmbracelet/vhs)
# Records the recorder's own CLI smoke path: one command, one flow file,
# one reproducible video — the README hero's promise, shown for real.
#
# Render with demo/render-hero.sh (host vhs + ttyd + ffmpeg; `dist/` must be
# built first — the gif types the run command, not the build).
# Waits are screen-anchored, not timed: the gif always includes the JSON
# payoff no matter how long the Playwright run takes.

Output demo/cassette.gif

Set FontSize 18
Set Width 1200
Set Height 720
Set Padding 20
Set Theme "Catppuccin Frappe"
Set WaitTimeout 120s

Type `node dist/cli.js run examples/local-smoke.demo.json --output .work/smoke-demo --speed 1.35 --json | jq '{flowName, video: (.videoPath | sub(".*/"; "")), retime: .retime.status, events: (.events | length)}'`
Sleep 800ms
Enter

# Hold until the JSON payoff (the last key jq prints) is on screen.
Wait+Screen /"events":/

# Let the result breathe before the loop restarts.
Sleep 3.5s
