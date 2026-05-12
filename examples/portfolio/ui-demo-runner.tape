# VHS terminal clip for the recorder itself.

Output examples/portfolio/output/ui-demo-runner.gif

Set FontSize 18
Set Width 1280
Set Height 720
Set Padding 24
Set Theme "Catppuccin Frappe"

Type "cd ~/projects/ui-demo-runner"
Enter
Sleep 400ms
Type "npm run build"
Enter
Sleep 2s
Type "node dist/cli.js run examples/local-smoke.demo.json --output .work/smoke-demo --speed 1.35 --json | jq '{flowName, videoPath, events: (.events | length)}'"
Enter
Sleep 3s
