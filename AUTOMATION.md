# Automation Contract

This repo is dotfiles-managed. The primitive contract lives in
`.automation/policy.json`; generated workflows, labels, repo settings, and local
autosync behavior should converge on that file.

## Loop

1. Observe local Git state without reading secrets or large diffs.
2. Checkpoint dirty work to a neutral `wip/<agent-kind>/<session-id>/<base>` ref.
3. Integrate only after the tree is quiet and required checks are green.
4. Prefer squash PR merges with branch deletion; use hosted auto-merge only when
   branch protection/rulesets can actually enforce required checks.
5. Repair tree-equivalent local divergence after squash merges.
6. Finalize with an explicit `agent-git-guard.sh` baseline/finalize pair.
7. Stop on semantic conflicts, active leases, unsafe Git states, or secrets.

## Universal GitHub Failure Prevention

All generated artifacts pass through the same local contract before they are
written: normalize trailing whitespace, parse by file type, block shellcheck
warnings when shellcheck is installed, and block yamllint failures when
yamllint is installed. GitHub Actions should confirm the same checks, not be
the first place a deterministic bootstrap defect is discovered.

Repository-administration advisory scans, including OpenSSF Scorecard, are
non-blocking. Findings that require branch protection or ruleset changes should
upload SARIF and annotations, but must not fail generated repo-content
workflows.

Legacy self-repair or AI-review workflows that create notification loops are
retired into `old/` during bootstrap. Current automation may open PRs and rely
on required checks, but private/free repos may not be able to enforce those
checks with GitHub branch protection. In that case, `automerge.yml` must gate
the PR itself: wait for the expected checks, fail on any observed failing check,
require two stable green polls, verify the PR head SHA is unchanged, and only
then squash-merge. It must not keep pushing failing repairs into the same branch.

Routine policy failures should use check conclusions and labels, not repeated
bot comments. Comments are reserved for durable review findings or security
context that cannot be represented as a check annotation, label, or workflow
summary.

## Doctrine Boundary

`/git-reconcile` is the canonical safety doctrine. This repo's
`trunk-based-squash` style is a Wranngle house overlay, not a universal rule for
client or external repos. The universal contract is: preserve work, classify
state, avoid accidental branch mutation, validate policy with
`scripts/bin/git-conformance`, and finish with an explicit guard finalizer.

## Brownfield Modes

Use `.dotfiles.sh audit` and `.dotfiles.sh plan` before writing to existing
repos. The first write should normally be:

```bash
.dotfiles.sh apply --advisory --profile client --no-github-hydrate --skip-llm
```

That advisory mode installs only the minimal conformance surface and does not
touch GitHub repo settings.

## Local Commands

```bash
repo-automation.sh observe
repo-automation.sh doctor
repo-automation.sh policy
github-hygiene.sh triage-failures
github-hygiene.sh repair-failures
```

`.autosync/policy.env`, `.autosync/pause`, and `.autosync/lease.json` are
per-repo overrides. The generated contract is the default; local overrides are
for explicit temporary exceptions.
