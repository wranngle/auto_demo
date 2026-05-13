# Tooling Survey (Historical)

This survey was the original "what off-the-shelf tool fits?" pass. **It is preserved for context only — the answer is now in-repo: `auto-demo`** combines the determinism of a Playwright JSON-flow runner with the agent loop and ffmpeg composition pipeline from screencli, dropping the hosted-login surface.

See [README.md](../README.md) for current usage.

## Original verdict (preserved)

- **screencli** was the closest off-the-shelf fit: prompt in, browser flow out, video export presets. It failed local testing on two axes:
  1. The npm-published tarball (0.2.3) is missing `assets/`, so the polished composition step crashes with `Error opening input file …/assets/cursor.png` even when the agent loop succeeds.
  2. Inference is gated through `screencli.sh/api/agent/messages` with a 10-credit-per-month free tier — despite the MIT license on the code, the OSS surface phones home for the model call.
- **Browser-use, Skyvern, Stagehand** are automation stacks aimed at completing tasks, not producing polished demo recordings with repeatable framing, click emphasis, manifests, and repo-local flow specs.
- **Playwright** already exposes deterministic browser control plus native video capture. The right substrate for a repo-local tool because it can run without cloud auth and can be tested in CI.

## What we did instead

Cloned screencli MIT, lifted `agent/`, `browser/`, `video/`, `recording/`, `utils/`, and `assets/` into this repo, deleted everything cloud-shaped, and added:

- **OAuth bearer auto-discovery** — `auto-demo` reads `~/.claude/.credentials.json` and uses the Claude Code subscription token (`anthropic-beta: oauth-2025-04-20`). No raw API key needed, no screencli.sh proxy, no credit meter.
- **`auto-demo author`** — captures with the agent once and emits a re-runnable `.demo.json` from the agent's tool-call log, so deterministic replay costs $0.
- **No init flow** — the only step that talked to a hosted service (the OAuth login listener) is gone.

The other survey candidates remain unchanged: Browser-use et al. are still wrong for this use case, and Playwright is still the right substrate.

## For CLI-only demos

VHS `.tape` files are still the right answer for terminal recordings. Keep them beside the browser flows.
