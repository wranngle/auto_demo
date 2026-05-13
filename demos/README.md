# UI Demos

Auto-recorded with `auto-demo author` against the dev server of each repo.
Each directory holds the polished `composed.mp4`, a `flow.demo.json` (best-effort
deterministic re-run), `metadata.json`, and a `preview.jpg` still.

| Repo | Preview | Video | Actions | Tokens (in/out) | Duration |
|---|---|---|---|---|---|
| [career_architect](./career_architect/) | ![](./career_architect/preview.jpg) | [composed.mp4](./career_architect/composed.mp4) | 5 | 12,437 / 579 | 14.4 s |
| [gtm_ops](./gtm_ops/) | ![](./gtm_ops/preview.jpg) | [composed.mp4](./gtm_ops/composed.mp4) | 14 | 83,382 / 1,728 | 44.8 s |
| [unified-presales-report](./unified-presales-report/) | ![](./unified-presales-report/preview.jpg) | [composed.mp4](./unified-presales-report/composed.mp4) | 4 | 15,795 / 711 | 9.1 s |
| [wranngle_com](./wranngle_com/) | ![](./wranngle_com/preview.jpg) | [composed.mp4](./wranngle_com/composed.mp4) | 15 | 55,849 / 1,302 | 71.3 s |

All four used `claude-haiku-4-5-20251001` via the local OAuth bearer
(`~/.claude/.credentials.json`) — no API key, no screencli.sh proxy, no credit
meter. Total inference: **167,463 input + 4,320 output tokens** across the four
recordings, billed against the Claude Max subscription.

## Per-repo notes

### career_architect
Next.js landing page (port 3001). Agent scrolled deliberately and called `done`
cleanly at the bottom. 5 actions, cleanest run.

### gtm_ops
Bun + custom server (port 3002). Agent reached the Eval Dashboard, opened an
evaluation row (`bland-veterinary-001`), and hit max-steps while still exploring.
The captured video shows the dashboard with the flaw distribution + evaluation
runs table, the cursor moving into a row, and a click. Flow file has
`TODO selector` markers — Haiku acted by accessibility-tree index, which doesn't
replay deterministically. Re-record with Sonnet or hand-edit selectors before
checking the flow in.

### unified-presales-report
Bun + Express (port 3003). **Boot was broken** — required a one-line fix to the
sqlite schema: `lib/evaluation/corpus.js` declared `case_studies` without a
`vendor` column even though INSERTs and `SELECT … GROUP BY vendor` referenced it.
Added `vendor TEXT` to the schema and dropped the existing `.db` files so they
were recreated. Demo runs cleanly after the fix; the dashboard renders the
Evaluation Dashboard shell but inline `500 Internal Server Error` messages show
the empty-state data loaders still need work (`evaluation_runs` and
`case_studies` queries fail downstream). The video captures the actual UI state
honestly.

### wranngle_com
Vite SPA (port 5173). Agent scrolled through Offerings, "What we build", and
sub-sections before max-steps. Last frame shows the navigation hover + the AI
Agents / Websites / gtm_ops product tabs. Same `TODO selector` caveat as gtm_ops.

## Skipped

### CIPP
Next.js M365 management fork (port 3004). Next isn't installed in its local
`node_modules`; `npx next` resolved to v16.2.6 but turbopack couldn't find the
workspace root (`Couldn't find the Next.js package … from the project directory`).
Beyond boot it gates on Azure AD auth. Not in scope to fix.

## Re-running

Each demo was captured with:

```bash
node dist/cli.js author <url> \
  --prompt '...' \
  --output ./demos/<repo> \
  --max-steps 14 \
  --flow-name <slug>
```

Dev servers started from each repo's own `dev`/`start` script on a unique port
(3001 / 3002 / 3003 / 5173) and torn down after recording. The `composed.mp4` +
`flow.demo.json` + `metadata.json` were lifted from the per-UUID subdir and the
subdir was pruned.

## Known limitations

- **Selector quality**: Haiku frequently acts by element-index alone. The
  emitted `flow.demo.json` works as a record of intent but its `click`/`fill`
  steps often lack stable selectors (marked `TODO selector — …`). Hand-edit
  before committing the flow to a repo, or rerun with
  `-m claude-sonnet-4-5-20250929` for richer `role` / `name` capture.
- **Max steps**: 14 is intentionally low to bound token spend. For longer apps,
  bump `--max-steps`.
