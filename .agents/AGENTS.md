# Abstract Agent Imperatives

1. Never trust or tolerate errors; deeper truth must always be aggressively researched and addressed.
2. Architecture must be organically robust. Do not use brittle API key fallbacks when local environment context (CLI tokens, D-Bus) is natively available.
3. Strict determinism is required across programmatic JSON pipelines. Always use structured output bounding.
4. Pace intelligently. Assume rate limits are not model failures but pacing signals; back off exponentially.
5. The workspace boundary is absolute. Deployments must happen dynamically in the target directory, not a hardcoded artifact folder.
6. API-first, browser last. If a service exposes an API, MCP tool, or webhook, use it; reach for browser automation only when no programmatic surface exists, the platform itself blocks API onboarding, or a visual artifact is the deliverable. Cloud-managed sources of truth (n8n, ElevenLabs, Twilio Studio, Zapier, Make) own their own state — do not mirror their config to local JSON files except under explicit `templates/`, `fixtures/`, or `archived_` paths.
7. No always-on banner injection. Hooks and prompt-injectors must be conditional, not ambient. A hook that fires on every prompt or every session-start with the same static reminder text is banner spam — it desensitizes agents to real signals and burns context. If guidance is always-true, put it in `AGENTS.md` or `CLAUDE.md` once; if it is situational, gate the injection on a detected condition.
8. Autosync hands-off: Never manually `git push` main/master in repos with `.automation/policy.json` declaring `integration.default: integrate_when_green`. The cron `*/10 * * * * ~/.dotfiles/scripts/bin/git-autosync.sh` opens a squash-PR via gh and auto-merges within ~5 min after a 300s quiet window. Do not offer or propose to `git push`. If autosync mode is paused or snapshot-only (per `.autosync/policy.env`), manual push is fine.
9. Greenfield development: All projects are greenfield, so attempts to upgrade that cause regressions by mistake are allowed. Unit tests and tracing development per jsonl skill are still always required in parallel for all features, outcomes, and data flows. And the next best test is to ship it and run the integration test as a whole and take the perspective of user by understanding what is their expected sensory outcome, and leveraging AI modality whether its local LLM for text and UI screenshots, or a blind test voice ai agent recipient for audio, or whatever modality best simulates user experience. But the truest test is to allow scream test from actual pilot users (usually me the developer) AFTER tracing the experience simulation to avoid wasting development time backtracking to fix for something that should have surfaced in trace.

## UI / Design — see and customize `.agents/DESIGN.md`

For ALL UI/UX work in this project, the canonical source of design decisions is
`.agents/DESIGN.md`. Read it before writing markup, styles, copy, or interaction
flows; update it whenever you make a design call worth preserving. This file
(AGENTS.md) sets the agent posture; DESIGN.md sets the visual + UX contract.
