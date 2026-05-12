---
workflow_name: project-symphony

tracker:
  kind: local_markdown
  issues_root: .symphony/issues
  active_states:
    - todo
    - in_progress
  terminal_states:
    - done
    - cancelled
    - duplicate

polling:
  interval_ms: 30000

workspace:
  root: .symphony/workspaces

agent:
  command: scripts/bin/llm.sh
  max_concurrent_agents: 1

codex:
  command: scripts/bin/llm.sh
  read_timeout_ms: 5000
  turn_timeout_ms: 3600000
---
# Project Symphony Workflow

You are operating inside this project. Complete the assigned task using the repository's local knowledge base and validation loops.

Replace this prompt body with project-specific guidance once the bootstrap stub is no longer useful.
