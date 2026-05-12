# Wranngle portfolio demo plan

This is the capture plan for a repo set with mixed browser UIs and CLI tools.
The goal is repeatable proof clips, not a repo tour.

## Recording style

- Start on the working surface. No title cards.
- Move through actions in reading order: left to right, top to bottom, then down
  the navigation rail.
- Keep cursor motion fast but legible: `--speed 1.25` to `1.5`, modern cursor,
  short click pauses.
- Use `focus` only when the viewer needs to inspect a control or result. Zoom in,
  hold briefly, then `resetZoom`.
- Use `caption` for shot intent, not narration paragraphs.
- Use the action rail for QA and internal review. Disable it for final public
  clips if it starts competing with the app.

## Browser/UI clips

| Repo | Clip | Treatment |
| --- | --- | --- |
| `gtm_ops` | Ops console full loop | Primary. Callbacks -> Calls -> Pipeline -> Generate -> Proposals -> Evals -> Agents -> Settings. |
| `wranngle_com` | Public product surface | Supporting. Product page, lead capture/Sarah entry point, proof that the public site exists. |
| `career_architect` | Admin/pipeline dashboard | Optional supporting clip. Shows full-stack automation and operator UI, not the ElevenLabs lead. |
| `CIPP` | Forked M365 UI | Skip for portfolio video. Background MSP credibility only. |

## CLI/cassette clips

Use VHS `.tape` files for custom CLI tools. The terminal style should be plain,
high-contrast, and fast, with commands prepared so the clip shows output rather
than typing drama.

| Repo | Tape target | Treatment |
| --- | --- | --- |
| `voice_ai_agent_evals` / `voice-evals` | Eval list, one run, report | Primary CLI clip. Shows deterministic scenarios and measurable voice-agent behavior. |
| `gtm_ops` | `eval:report`, synthetic generate/verify | Supporting CLI clip if the UI video needs backend proof. |
| `n8n` | `verify` and public workflow export | Short proof clip. Show workflow-as-code validation, not raw JSON walls. |
| `logo_maker` | Generate one asset set | Utility clip only if asset pipeline comes up. |
| `comfyui_bulk_python_generator` | `comfybulk --help`, seeded manifest run | Utility clip. Keep it about seeded media automation and manifests. |
| `droidlan` | LAN file-transfer CLI | Mention-only unless a reviewer asks about utilities. |
| `ui-demo-runner` | Smoke recording command | Meta clip only if explaining the recording system itself. |

## Editing principles borrowed from the media pipeline

- Treat every recording as a reproducible variant: raw WebM, final MP4/GIF,
  screenshots, manifest.
- Prefer seeded/demo fixtures over live state.
- Keep a clean path and an effects path. For product proof, the clean path wins.
- Emit manifests alongside artifacts so later edits know what happened when.
- Use montage only for public-surface scans. Use single-flow captures for
  flagship proof clips.
