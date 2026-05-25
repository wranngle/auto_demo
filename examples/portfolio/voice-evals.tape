# VHS terminal clip for the voice-agent eval harness.

Output examples/portfolio/output/voice-evals.gif

Set FontSize 18
Set Width 1280
Set Height 720
Set Padding 24
Set Theme "Catppuccin Frappe"

Type "cd ~/projects/voice_ai_agent_evals"
Enter
Sleep 400ms
Type "export PATH=$HOME/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Enter
Sleep 300ms
Type "bun run testing:list"
Enter
Sleep 2s
Type "bun run testing:run -- --id SCEN-barge-in-mid-question || true"
Enter
Sleep 2s
Type "bun run testing:run -- --id SCEN-lookup-record-greeting"
Enter
Sleep 2s
Type "bun run testing:report"
Enter
Sleep 2s
