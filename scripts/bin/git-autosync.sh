#!/usr/bin/env bash
# git-autosync.sh — checkpoint local git repos to neutral wip branches.
# Integration into the default branch is explicit policy, not the default.
# stderr: ECS jsonl events. stdout: nothing. Same envelope as llm.sh / .dotfiles.sh.
# Env: GIT_AUTOSYNC_ROOTS, GIT_AUTOSYNC_MAXDEPTH, GIT_AUTOSYNC_DIFF_BYTES,
#      GIT_AUTOSYNC_LOG_FILE (default: $XDG_STATE_HOME/git-autosync.jsonl),
#      GIT_AUTOSYNC_DRY_RUN=1 (skip push/pr), GIT_AUTOSYNC_DEFAULT_MODE
#      (snapshot-only|integrate|paused), GIT_AUTOSYNC_QUIET_SECONDS,
#      GIT_AUTOSYNC_AGENT_KIND (default: autosync),
#      GIT_AUTOSYNC_SESSION_ID (default: local), DOTFILES_BOOTSTRAP_RUN_ID.

set -uo pipefail

# Cron has a minimal PATH; pin the tools we need.
export PATH="/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin:$HOME/.dotfiles/scripts/bin:$PATH"

readonly GIT_AUTOSYNC_VERSION=0.6.0 GIT_AUTOSYNC_SERVICE_NAME=git-autosync
GIT_AUTOSYNC_RUN_ID=${DOTFILES_BOOTSTRAP_RUN_ID:-$(uuidgen 2>/dev/null||printf '%s-%s' "$(date +%s%N)" "$RANDOM")}
# Sequence counter is file-backed so command substitutions (which run in
# subshells) can still increment it without parent-shell visibility tricks.
GIT_AUTOSYNC_SEQ_FILE=$(mktemp -t git-autosync-seq.XXXXXX)
echo 0 > "$GIT_AUTOSYNC_SEQ_FILE"
trap 'rm -f "$GIT_AUTOSYNC_SEQ_FILE"' EXIT

sanitizeAutosyncNamespaceToken(){ local raw=${1:-} normalized
  normalized=$(printf '%s' "$raw"|tr '[:upper:]' '[:lower:]'|tr -cs '[:alnum:]_.-' '-')
  normalized=${normalized#-}
  normalized=${normalized%-}
  printf '%s' "$normalized"
}

normalizeAutosyncNamespace(){ local raw=${1:-local} normalized machine machine_short
  normalized=$(sanitizeAutosyncNamespaceToken "$raw")
  machine=$(sanitizeAutosyncNamespaceToken "$(hostname 2>/dev/null||true)")
  machine_short=${machine%%.*}
  if [[ -z $normalized || ( -n $machine && $normalized == "$machine" ) || ( -n $machine_short && $normalized == "$machine_short" ) ]];then
    normalized=local
  fi
  printf '%s' "$normalized"
}

AUTOSYNC_AGENT_KIND=$(normalizeAutosyncNamespace "${GIT_AUTOSYNC_AGENT_KIND:-autosync}")
AUTOSYNC_SESSION_ID=$(normalizeAutosyncNamespace "${GIT_AUTOSYNC_SESSION_ID:-${GIT_AUTOSYNC_NAMESPACE:-${GIT_AUTOSYNC_HOST:-local}}}")
AUTOSYNC_NAMESPACE="$AUTOSYNC_AGENT_KIND/$AUTOSYNC_SESSION_ID"

wipBaseTokenFor(){ local raw=${1:-detached} normalized digest
  normalized=$(sanitizeAutosyncNamespaceToken "$raw")
  [[ -n "$normalized" ]]||normalized=detached
  if [[ "$normalized" != "$raw" ]];then
    digest=$(printf '%s' "$raw"|sha1sum|awk '{print substr($1,1,12)}')
    normalized="${normalized}-${digest}"
  fi
  printf '%s' "$normalized"
}

wipBranchFor(){ local branch=$1 base_token
  base_token=$(wipBaseTokenFor "$branch")
  printf 'wip/%s/%s/%s' "$AUTOSYNC_AGENT_KIND" "$AUTOSYNC_SESSION_ID" "$base_token"
}
ROOTS=${GIT_AUTOSYNC_ROOTS:-$HOME}
MAX_DEPTH=${GIT_AUTOSYNC_MAXDEPTH:-5}
DIFF_BUDGET_BYTES=${GIT_AUTOSYNC_DIFF_BYTES:-40000}
DRY_RUN=${GIT_AUTOSYNC_DRY_RUN:-0}
STATE_DIR=${XDG_STATE_HOME:-$HOME/.local/state}
LOG_FILE=${GIT_AUTOSYNC_LOG_FILE:-$STATE_DIR/git-autosync.jsonl}
LOCK_FILE=${GIT_AUTOSYNC_LOCK:-/tmp/git-autosync.lock}
DEFAULT_MODE=${GIT_AUTOSYNC_DEFAULT_MODE:-snapshot-only}
DEFAULT_QUIET_SECONDS=${GIT_AUTOSYNC_QUIET_SECONDS:-120}
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null||:

emitEcsEventOnStderr(){ local lvl=$1 act=$2 out=$3 repo=${4:-} branch=${5:-} detail=${6:-} err=${7:-} ts json seq
  seq=$(( $(<"$GIT_AUTOSYNC_SEQ_FILE") + 1 ))
  echo "$seq" > "$GIT_AUTOSYNC_SEQ_FILE"
  ts=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
  json=$(jq -nc --arg ts "$ts" --arg l "$lvl" --arg a "$act" --arg o "$out" \
    --arg svc "$GIT_AUTOSYNC_SERVICE_NAME" --arg namespace "$AUTOSYNC_NAMESPACE" --arg repo "$repo" \
    --arg branch "$branch" --arg detail "$detail" --arg err "$err" \
    --arg trace "$GIT_AUTOSYNC_RUN_ID" --arg eid "${GIT_AUTOSYNC_RUN_ID}-${seq}" \
    '{"@timestamp":$ts,"log.level":$l,"event.action":$a,"event.outcome":$o,"event.id":$eid,"trace.id":$trace,"service.name":$svc,"labels":{"namespace":$namespace,"repo":$repo,"branch":$branch,"detail":$detail}}+(if $err=="" then {} else {"error.message":$err} end)')
  printf '%s\n' "$json" >&2
  printf '%s\n' "$json" >> "$LOG_FILE" 2>/dev/null||:
}

# Single-instance lock — slow run must not overlap next cron tick.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  emitEcsEventOnStderr info autosync.lock-held success '' '' 'another run holds the lock'
  exit 0
fi

for required_tool in git jq flock sha1sum; do
  command -v "$required_tool" >/dev/null||{ emitEcsEventOnStderr error autosync.prereq failure '' '' "$required_tool" "missing required tool"; exit 2; }
done
LLM_SH=${LLM_SH:-$(command -v llm.sh || echo "$HOME/.dotfiles/scripts/bin/llm.sh")}
[[ -x "$LLM_SH" ]]||{ emitEcsEventOnStderr error autosync.prereq failure '' '' "llm.sh=$LLM_SH" "llm.sh not executable"; exit 2; }
HAS_GH=0; command -v gh >/dev/null && HAS_GH=1

discoverGitRepositoryRoots(){ local root
  for root in ${ROOTS//:/ }; do
    [[ -d "$root" ]]||continue
    find "$root" -maxdepth "$MAX_DEPTH" \
      \( -name node_modules -o -name .cache -o -name .venv -o -name venv \
         -o -name target -o -name dist -o -name build -o -name .next \
         -o -name __pycache__ -o -name .nvm -o -name .claude \
         -o -path '*/.codex/.tmp' -o -path '*/.gemini/tmp' \) -prune -o \
      -type d -name .git -print 2>/dev/null \
      | sed 's|/\.git$||'
  done | sort -u
}

# Returns 0 if repo is in a state we should skip; prints reason on stdout.
detectUnsafeRepoState(){ local gitdir f
  gitdir=$(git rev-parse --git-dir 2>/dev/null)||{ echo not-a-repo; return 0; }
  [[ "$(git rev-parse --is-bare-repository)" == "true" ]]&&{ echo bare; return 0; }
  git symbolic-ref -q HEAD >/dev/null||{ echo detached-HEAD; return 0; }
  for f in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD BISECT_LOG rebase-apply rebase-merge; do
    [[ -e "$gitdir/$f" ]]&&{ echo "in-progress:$f"; return 0; }
  done
  return 1
}

buildDiffPayloadForLlm(){ local stat diff status untracked
  # `git add -N` (intent-to-add) makes untracked files visible in `git diff`
  # without actually staging them — required so the LLM sees new-file content,
  # not just filenames. We undo it after capturing the diff.
  untracked=$(git ls-files --others --exclude-standard 2>/dev/null)
  if [[ -n "$untracked" ]]; then
    # shellcheck disable=SC2086
    git add -N -- $untracked 2>/dev/null||:
  fi
  status=$(git status --porcelain=v2 --branch 2>/dev/null)
  stat=$( { git diff --stat HEAD; git diff --stat --cached; } 2>/dev/null )
  diff=$( { git diff HEAD; git diff --cached; } 2>/dev/null | head -c "$DIFF_BUDGET_BYTES")
  if [[ -n "$untracked" ]]; then
    # shellcheck disable=SC2086
    git reset -- $untracked >/dev/null 2>&1||:
  fi
  printf 'STATUS:\n%s\n\nDIFFSTAT:\n%s\n\nDIFF (truncated to %d bytes):\n%s\n' \
    "$status" "$stat" "$DIFF_BUDGET_BYTES" "$diff"
}

readonly LLM_SYSTEM_PROMPT='You write git commit messages. Read the provided git status and diff. You MUST return ONLY a single JSON object matching the schema — no prose, no markdown fences, no commentary. Even if the diff seems trivial or unclear, still emit valid JSON. The "subject" is a single-line conventional-commit-style summary under 72 chars (feat/fix/chore/docs/refactor/test/style as appropriate). The "body" is optional context explaining WHY, empty string if the subject is enough. Set "wip" to true if the change looks half-finished, trivial whitespace, or scratch debugging — the wrapper will prefix the subject with "wip:" when wip is true. If you truly cannot infer anything, return {"subject":"chore: snapshot","body":"","wip":true}.'
readonly LLM_SCHEMA='{"type":"object","required":["subject","body","wip"],"additionalProperties":false,"properties":{"subject":{"type":"string","maxLength":72},"body":{"type":"string"},"wip":{"type":"boolean"}}}'

# Fallback message when llm.sh fails entirely. Better to checkpoint with a
# generic message than to lose the WIP because the model chain was down.
buildFallbackCommitMessage(){ local files
  files=$( { git diff --name-only HEAD; git diff --name-only --cached; } 2>/dev/null|sort -u|head -3|paste -sd, -)
  printf 'wip: autosync %s' "${files:-changes}"
}

generateCommitMessageViaLlm(){ local repo=$1 branch=$2 payload response subject body wip msg
  payload=$(buildDiffPayloadForLlm)
  emitEcsEventOnStderr info autosync.llm.invoke success "$repo" "$branch" "bytes=$(printf %s "$payload"|wc -c)"
  if ! response=$(LLM_SYSTEM="$LLM_SYSTEM_PROMPT" timeout --preserve-status 60 "$LLM_SH" --json-schema "$LLM_SCHEMA" <<<"$payload" 2>/dev/null); then
    emitEcsEventOnStderr warn autosync.llm.fallback failure "$repo" "$branch" 'llm.sh nonzero, using fallback'
    buildFallbackCommitMessage; return 0
  fi
  # Some models wrap JSON in ```json fences``` or add prose. Strip fences and
  # extract the first {...} block to be robust to non-strict compliance.
  response=${response//\`\`\`json/}
  response=${response//\`\`\`/}
  local json_only
  json_only=$(printf '%s' "$response" | awk '/^\s*\{/{flag=1} flag{print} /^\s*\}\s*$/{if(flag){exit}}' )
  [[ -n "$json_only" ]] && response="$json_only"
  subject=$(jq -r '.subject // empty' <<<"$response" 2>/dev/null)
  body=$(jq -r '.body // empty' <<<"$response" 2>/dev/null)
  wip=$(jq -r '.wip // false' <<<"$response" 2>/dev/null)
  if [[ -z "$subject" ]]; then
    emitEcsEventOnStderr warn autosync.llm.fallback failure "$repo" "$branch" 'empty subject, using fallback'
    buildFallbackCommitMessage; return 0
  fi
  [[ "$wip" == "true" && "$subject" != wip:* ]]&&subject="wip: $subject"
  msg="$subject"
  [[ -n "$body" ]]&&msg=$(printf '%s\n\n%s\n' "$subject" "$body")
  emitEcsEventOnStderr info autosync.llm.success success "$repo" "$branch" "subject=${subject:0:60}"
  printf '%s' "$msg"
}

originIsGitHub(){ git remote get-url origin 2>/dev/null | grep -qE '(github\.com[:/])'; }

# Two-stage merge attempt:
#   1. `gh pr merge --auto --squash` — succeeds when the repo has
#      `allow_auto_merge=true` and (usually) at least one required status
#      check. The PR will be merged by GitHub once checks pass. Best path.
#   2. Optional fallback: `gh pr merge --squash --delete-branch` — immediate
#      squash merge with no gate. This is disabled when repo policy requires
#      green checks, which is the dotfiles-managed default.
mergePrAutomatically(){ local repo=$1 branch=$2 wip_branch=$3 auto_err immediate_err
  GIT_AUTOSYNC_LAST_PR_MERGE_MODE=
  if auto_err=$(gh pr merge "$wip_branch" --auto --squash --delete-branch 2>&1); then
    GIT_AUTOSYNC_LAST_PR_MERGE_MODE=auto-armed
    emitEcsEventOnStderr info autosync.repo.pr-automerge-armed success "$repo" "$branch" "wip=$wip_branch"
    return 0
  fi
  if [[ "${GIT_AUTOSYNC_REPO_REQUIRE_GREEN:-0}" == 1 && "${GIT_AUTOSYNC_REPO_ALLOW_IMMEDIATE_MERGE_FALLBACK:-0}" != 1 ]];then
    GIT_AUTOSYNC_LAST_PR_MERGE_MODE=require-green-blocked
    emitEcsEventOnStderr warn autosync.repo.pr-automerge-unavailable failure "$repo" "$branch" "wip=$wip_branch require_green=1 immediate_fallback=0" "${auto_err:0:200}"
    return 1
  fi
  emitEcsEventOnStderr info autosync.repo.pr-automerge-unavailable success "$repo" "$branch" "wip=$wip_branch falling back to immediate squash" "${auto_err:0:200}"
  if immediate_err=$(gh pr merge "$wip_branch" --squash --delete-branch 2>&1); then
    GIT_AUTOSYNC_LAST_PR_MERGE_MODE=immediate-merged
    emitEcsEventOnStderr info autosync.repo.pr-merged success "$repo" "$branch" "wip=$wip_branch via immediate squash"
    return 0
  fi
  GIT_AUTOSYNC_LAST_PR_MERGE_MODE=failed
  emitEcsEventOnStderr warn autosync.repo.pr-merge-failed failure "$repo" "$branch" "wip=$wip_branch" "auto:${auto_err:0:80} | immediate:${immediate_err:0:80}"
  return 1
}

resolveRepoDefaultBranch(){ local b
  b=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null|sed 's|^origin/||')
  [[ -n "$b" ]]&&{ printf %s "$b"; return; }
  if (( HAS_GH )); then
    b=$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name 2>/dev/null)
    [[ -n "$b" ]]&&{ printf %s "$b"; return; }
  fi
  printf main
}

normalizeAutosyncMode(){ local raw=${1:-snapshot-only}
  raw=$(printf '%s' "$raw"|tr '[:upper:]' '[:lower:]'|tr '_' '-')
  case "$raw" in
    integrate|integration|integrate-when-green|when-green|automerge|auto-merge|merge|pr|pull-request) printf integrate;;
    paused|pause|off|disabled|disable|skip) printf paused;;
    snapshot|snapshot-only|checkpoint|checkpoint-only|backup|backup-only) printf snapshot-only;;
    *) printf snapshot-only;;
  esac
}

readAutosyncPolicyValue(){ local file=$1 key=$2
  [[ -f "$file" ]]||return 0
  awk -F= -v wanted="$key" '
    {
      k=$1
      gsub(/^[ \t]+|[ \t]+$/, "", k)
      k=tolower(k)
      if (k == wanted) {
        v=substr($0, index($0, "=") + 1)
        sub(/[ \t]*#.*/, "", v)
        gsub(/^[ \t]+|[ \t]+$/, "", v)
        gsub(/^["'\'']|["'\'']$/, "", v)
        print v
      }
    }
  ' "$file" 2>/dev/null|tail -1
}

readAutomationPolicyString(){ local jq_expr=$1
  [[ -f .automation/policy.json ]]||return 0
  jq -r "$jq_expr // empty" .automation/policy.json 2>/dev/null||true
}

readAutomationPolicyArrayCsv(){ local jq_expr=$1
  [[ -f .automation/policy.json ]]||return 0
  jq -r "$jq_expr // [] | if type == \"array\" then join(\",\") else . end" .automation/policy.json 2>/dev/null||true
}

readAutomationPolicyBool(){ local jq_expr=$1
  [[ -f .automation/policy.json ]]||return 0
  jq -r "try ($jq_expr) catch null | if . == null then empty else tostring end" .automation/policy.json 2>/dev/null||true
}

leaseIsActive(){ local lease=$1 expires expires_epoch now
  [[ -f "$lease" ]]||return 1
  expires=$(jq -r '.expires_at // empty' "$lease" 2>/dev/null||echo)
  [[ -z "$expires" ]]&&return 0
  expires_epoch=$(date -d "$expires" +%s 2>/dev/null||echo 0)
  [[ "$expires_epoch" == 0 ]]&&return 0
  now=$(date +%s)
  (( expires_epoch > now ))
}

readAutosyncLeaseMode(){ local lease=$1
  jq -r '
    if (.autosync.mode? // "") != "" then .autosync.mode
    elif (.allowed_actions.autosync? // "") != "" then .allowed_actions.autosync
    elif ((.allowed_actions? | type) == "array" and (.allowed_actions | index("autosync:integrate"))) then "integrate"
    elif ((.allowed_actions? | type) == "array" and (.allowed_actions | index("autosync:snapshot"))) then "snapshot-only"
    else "snapshot-only"
    end
  ' "$lease" 2>/dev/null
}

branchMatchesPatternList(){ local branch=$1 list=$2 pattern
  [[ -n "$list" ]]||return 1
  IFS=',' read -ra patterns <<< "$list"
  for pattern in "${patterns[@]}";do
    pattern=$(printf '%s' "$pattern"|sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    # shellcheck disable=SC2053 # Glob matching is the policy format.
    [[ -n "$pattern" && "$branch" == $pattern ]]&&return 0
  done
  return 1
}

loadAutosyncRepoPolicy(){ local repo=$1 branch=$2 base=$3 gitdir policy_file mode quiet policy_mode policy_quiet skip_branches integrate_branches lease lease_mode automation_mode automation_quiet automation_default automation_require_green automation_allow_immediate policy_require_green policy_allow_immediate
  gitdir=$(git rev-parse --git-dir 2>/dev/null||echo .git)
  mode=$(normalizeAutosyncMode "$DEFAULT_MODE")
  quiet=$DEFAULT_QUIET_SECONDS
  GIT_AUTOSYNC_REPO_OWNED=0
  GIT_AUTOSYNC_REPO_REQUIRE_GREEN=0
  GIT_AUTOSYNC_REPO_ALLOW_IMMEDIATE_MERGE_FALLBACK=1
  GIT_AUTOSYNC_REPO_MODE=$mode
  GIT_AUTOSYNC_REPO_QUIET_SECONDS=$quiet
  GIT_AUTOSYNC_REPO_POLICY_DETAIL="mode=$mode source=default quiet=${quiet}s require_green=0 immediate_fallback=1"

  if [[ -f .automation/policy.json ]];then
    automation_mode=$(readAutomationPolicyString '.autosync.mode')
    automation_default=$(readAutomationPolicyString '.integration.default')
    [[ -z "$automation_mode" ]]&&automation_mode=$automation_default
    automation_quiet=$(readAutomationPolicyString '.integration.quiet_seconds')
    [[ -n "$automation_mode" ]]&&mode=$(normalizeAutosyncMode "$automation_mode")
    [[ "$automation_quiet" =~ ^[0-9]+$ ]]&&quiet=$automation_quiet
    skip_branches=$(readAutomationPolicyArrayCsv '.integration.skip_branches')
    integrate_branches=$(readAutomationPolicyArrayCsv '.integration.integrate_branches')
    if branchMatchesPatternList "$branch" "$skip_branches";then mode=snapshot-only;fi
    if [[ -n "$integrate_branches" ]]&&! branchMatchesPatternList "$branch" "$integrate_branches";then mode=snapshot-only;fi
    automation_require_green=$(readAutomationPolicyBool '.integration.require_green')
    automation_allow_immediate=$(readAutomationPolicyBool '.integration.allow_immediate_merge_fallback')
    if [[ "$automation_require_green" == true || "$automation_default" == *green* ]];then GIT_AUTOSYNC_REPO_REQUIRE_GREEN=1;fi
    if [[ "$automation_allow_immediate" == false ]];then GIT_AUTOSYNC_REPO_ALLOW_IMMEDIATE_MERGE_FALLBACK=0;fi
    GIT_AUTOSYNC_REPO_POLICY_DETAIL="mode=$mode source=.automation/policy.json quiet=${quiet}s require_green=$GIT_AUTOSYNC_REPO_REQUIRE_GREEN immediate_fallback=$GIT_AUTOSYNC_REPO_ALLOW_IMMEDIATE_MERGE_FALLBACK"
  fi

  policy_file=.autosync/policy.env
  if [[ -f "$policy_file" ]];then
    policy_mode=$(readAutosyncPolicyValue "$policy_file" mode)
    [[ -z "$policy_mode" ]]&&policy_mode=$(readAutosyncPolicyValue "$policy_file" autosync_mode)
    policy_quiet=$(readAutosyncPolicyValue "$policy_file" quiet_seconds)
    [[ -n "$policy_mode" ]]&&mode=$(normalizeAutosyncMode "$policy_mode")
    [[ "$policy_quiet" =~ ^[0-9]+$ ]]&&quiet=$policy_quiet
    skip_branches=$(readAutosyncPolicyValue "$policy_file" skip_branches)
    integrate_branches=$(readAutosyncPolicyValue "$policy_file" integrate_branches)
    if branchMatchesPatternList "$branch" "$skip_branches";then mode=snapshot-only;fi
    if [[ -n "$integrate_branches" ]]&&! branchMatchesPatternList "$branch" "$integrate_branches";then mode=snapshot-only;fi
    policy_require_green=$(readAutosyncPolicyValue "$policy_file" require_green)
    policy_allow_immediate=$(readAutosyncPolicyValue "$policy_file" allow_immediate_merge_fallback)
    [[ "$policy_require_green" == true || "$policy_require_green" == 1 ]]&&GIT_AUTOSYNC_REPO_REQUIRE_GREEN=1
    [[ "$policy_require_green" == false || "$policy_require_green" == 0 ]]&&GIT_AUTOSYNC_REPO_REQUIRE_GREEN=0
    [[ "$policy_allow_immediate" == true || "$policy_allow_immediate" == 1 ]]&&GIT_AUTOSYNC_REPO_ALLOW_IMMEDIATE_MERGE_FALLBACK=1
    [[ "$policy_allow_immediate" == false || "$policy_allow_immediate" == 0 ]]&&GIT_AUTOSYNC_REPO_ALLOW_IMMEDIATE_MERGE_FALLBACK=0
    GIT_AUTOSYNC_REPO_POLICY_DETAIL="mode=$mode source=$policy_file quiet=${quiet}s require_green=$GIT_AUTOSYNC_REPO_REQUIRE_GREEN immediate_fallback=$GIT_AUTOSYNC_REPO_ALLOW_IMMEDIATE_MERGE_FALLBACK"
  fi

  if [[ -f .autosync/pause || -f .autosync/paused || -f "$gitdir/autosync.pause" ]];then
    mode=paused
    GIT_AUTOSYNC_REPO_POLICY_DETAIL="mode=paused source=pause-marker"
  fi

  lease=.autosync/lease.json
  if leaseIsActive "$lease";then
    GIT_AUTOSYNC_REPO_OWNED=1
    lease_mode=$(readAutosyncLeaseMode "$lease")
    mode=$(normalizeAutosyncMode "$lease_mode")
    [[ "$mode" == integrate ]]||mode=snapshot-only
    GIT_AUTOSYNC_REPO_POLICY_DETAIL="mode=$mode source=$lease active-owner=1 quiet=${quiet}s require_green=$GIT_AUTOSYNC_REPO_REQUIRE_GREEN immediate_fallback=$GIT_AUTOSYNC_REPO_ALLOW_IMMEDIATE_MERGE_FALLBACK"
  fi

  GIT_AUTOSYNC_REPO_MODE=$mode
  GIT_AUTOSYNC_REPO_QUIET_SECONDS=$quiet
  emitEcsEventOnStderr info autosync.repo.policy success "$repo" "$branch" "$GIT_AUTOSYNC_REPO_POLICY_DETAIL base=$base"
}

workingTreeQuietEnough(){ local quiet_seconds=$1 latest now latest_int age
  [[ "$quiet_seconds" =~ ^[0-9]+$ ]]||return 0
  (( quiet_seconds <= 0 ))&&return 0
  latest=$(find . -path ./.git -prune -o -type f -printf '%T@\n' 2>/dev/null|sort -nr|head -1)
  [[ -z "$latest" ]]&&return 0
  latest_int=${latest%.*}
  now=$(date +%s)
  age=$(( now - latest_int ))
  (( age >= quiet_seconds ))
}

computeWorkingTreeShaPreservingIndex(){ local saved_index_sha working_tree_sha
  saved_index_sha=$(git write-tree 2>/dev/null||echo)
  git add -A 2>/dev/null||:
  working_tree_sha=$(git write-tree 2>/dev/null||echo)
  [[ -n "$saved_index_sha" ]]&&git read-tree "$saved_index_sha" 2>/dev/null||:
  printf '%s' "$working_tree_sha"
}

repairLocalCheckoutAfterImmediateMerge(){ local repo=$1 branch=$2 base=$3 pushed_ref=$4 working_tree_sha base_tree_sha pushed_tree_sha
  local base_ref="refs/remotes/origin/$base"
  git fetch --quiet origin 2>/dev/null||:
  if ! git rev-parse --verify --quiet "$base_ref" >/dev/null 2>&1;then
    emitEcsEventOnStderr warn autosync.repo.local-repair-skip failure "$repo" "$branch" "base=$base" "missing $base_ref"
    return 0
  fi
  pushed_tree_sha=$(git rev-parse "$pushed_ref^{tree}" 2>/dev/null||echo)
  base_tree_sha=$(git rev-parse "$base_ref^{tree}" 2>/dev/null||echo)
  working_tree_sha=$(computeWorkingTreeShaPreservingIndex)
  if [[ -z "$pushed_tree_sha" || -z "$base_tree_sha" || -z "$working_tree_sha" ]];then
    emitEcsEventOnStderr warn autosync.repo.local-repair-skip failure "$repo" "$branch" "base=$base" 'could not compute tree sha'
    return 0
  fi
  if [[ "$pushed_tree_sha" != "$base_tree_sha" ]];then
    emitEcsEventOnStderr info autosync.repo.local-repair-skip success "$repo" "$branch" "base=$base" 'merged base tree differs from pushed wip tree'
    return 0
  fi
  if [[ "$working_tree_sha" != "$base_tree_sha" ]];then
    emitEcsEventOnStderr info autosync.repo.local-repair-skip success "$repo" "$branch" "base=$base" 'working tree no longer matches merged base tree'
    return 0
  fi
  if [[ "$branch" != "$base" ]];then
    git branch -f "$base" "$base_ref" >/dev/null 2>&1||:
    if git switch --force "$base" >/dev/null 2>&1;then
      git reset --hard "$base_ref" >/dev/null 2>&1||:
      emitEcsEventOnStderr info autosync.repo.local-repaired success "$repo" "$branch" "switched to $base after merged wip"
      return 0
    fi
  fi
  if git reset --hard "$base_ref" >/dev/null 2>&1;then
    emitEcsEventOnStderr info autosync.repo.local-repaired success "$repo" "$branch" "reset to $base_ref after merged wip"
  fi
}

processRepository(){ local repo=$1 reason branch wip_branch base dirty=0 unpushed=0 msg
  cd "$repo"||{ emitEcsEventOnStderr warn autosync.repo.cd-failed failure "$repo" '' '' "cannot cd"; return 0; }
  if reason=$(detectUnsafeRepoState); then
    emitEcsEventOnStderr info autosync.repo.skip success "$repo" '' "$reason"
    return 0
  fi
  branch=$(git symbolic-ref --short HEAD)
  wip_branch=$(wipBranchFor "$branch")
  base=$(resolveRepoDefaultBranch)
  loadAutosyncRepoPolicy "$repo" "$branch" "$base"
  if [[ "$GIT_AUTOSYNC_REPO_MODE" == paused ]];then
    emitEcsEventOnStderr info autosync.repo.skip success "$repo" "$branch" "$GIT_AUTOSYNC_REPO_POLICY_DETAIL"
    return 0
  fi

  # Fetch so we can detect/heal the squash-merge follow-on case: GitHub
  # squash-merges our wip PR into origin/$branch as a NEW SHA, so local
  # $branch is now strictly behind. We never want to layer wip commits on
  # top of a stale base — that's how we end up "diverged 2 and 2" forever.
  git fetch --quiet origin 2>/dev/null||:

  if (( GIT_AUTOSYNC_REPO_OWNED == 0 ))&&git rev-parse --verify --quiet "refs/remotes/origin/$branch" >/dev/null 2>&1;then
    local local_ahead local_behind saved_index_sha working_tree_sha origin_tree_sha
    local_ahead=$(git rev-list --count "origin/$branch..HEAD" 2>/dev/null||echo 0)
    local_behind=$(git rev-list --count "HEAD..origin/$branch" 2>/dev/null||echo 0)
    origin_tree_sha=$(git rev-parse "origin/$branch^{tree}" 2>/dev/null||echo)

    # Probe the would-be working-tree sha (HEAD's tree if clean; HEAD + dirty
    # edits otherwise) without disturbing the user's index. We borrow it via
    # write-tree, then read-tree restores it. This is what unlocks the
    # squash-merge follow-on heal: GitHub squash-merges our wip PR into
    # origin/$branch, leaving us "diverged" only on commit SHAs while the
    # tree contents still match. We can FF safely in that case.
    saved_index_sha=$(git write-tree 2>/dev/null||echo)
    git add -A 2>/dev/null||:
    working_tree_sha=$(git write-tree 2>/dev/null||echo)
    [[ -n "$saved_index_sha" ]]&&git read-tree "$saved_index_sha" 2>/dev/null||:

    if (( local_behind > 0 ));then
      if [[ -n "$origin_tree_sha" && "$working_tree_sha" == "$origin_tree_sha" ]];then
        # Working-tree contents already match origin/$branch — reset is
        # byte-preserving for the workspace. Covers both the post-squash-merge
        # follow-on and the rare clean-but-tree-equivalent ancestor case.
        if git reset --hard "origin/$branch" >/dev/null 2>&1;then
          emitEcsEventOnStderr info autosync.repo.fast-forward success "$repo" "$branch" "advanced ${local_behind} commits (tree-equivalent: working tree already matches origin)"
        fi
      elif (( local_ahead == 0 )) && [[ -z "$(git status --porcelain 2>/dev/null)" ]];then
        # Strict ancestor + clean tree: standard FF, no data loss.
        if git reset --hard "origin/$branch" >/dev/null 2>&1;then
          emitEcsEventOnStderr info autosync.repo.fast-forward success "$repo" "$branch" "advanced ${local_behind} commits to origin/$branch"
        fi
      elif (( local_ahead > 0 ));then
        # Diverged AND content differs from origin. Layering a new wip commit
        # on top of HEAD here would push the divergence to a fresh PR and
        # re-create the squash-merge cycle. Refuse by default; the
        # GIT_AUTOSYNC_AUTOHEAL_DIVERGENCE=1 opt-in hard-resets only when the
        # working tree is clean (any dirty edits would otherwise be lost).
        if [[ "${GIT_AUTOSYNC_AUTOHEAL_DIVERGENCE:-0}" == "1" ]] \
           && [[ -z "$(git status --porcelain 2>/dev/null)" ]];then
          if git reset --hard "origin/$branch" >/dev/null 2>&1;then
            emitEcsEventOnStderr warn autosync.repo.autoheal success "$repo" "$branch" "force-reset to origin/$branch (autoheal); discarded ${local_ahead} local commits"
          fi
        else
          emitEcsEventOnStderr warn autosync.repo.diverged failure "$repo" "$branch" "ahead=$local_ahead behind=$local_behind" 'manual reconcile required (or set GIT_AUTOSYNC_AUTOHEAL_DIVERGENCE=1 with a clean tree)'
          return 0
        fi
      fi
    fi
  fi

  # If autosync already squash-merged the branch into the default branch, the
  # local checkout can be clean but still parked on the old task branch. When
  # the checked-out tree is identical to origin/$base, switching back to $base
  # is workspace-preserving and prevents duplicate "unpushed" WIP PRs.
  if (( GIT_AUTOSYNC_REPO_OWNED == 0 ))&&[[ "$branch" != "$base" ]] && git rev-parse --verify --quiet "refs/remotes/origin/$base" >/dev/null 2>&1;then
    local current_tree_sha base_tree_sha
    current_tree_sha=$(git rev-parse "HEAD^{tree}" 2>/dev/null||echo)
    base_tree_sha=$(git rev-parse "refs/remotes/origin/$base^{tree}" 2>/dev/null||echo)
    if [[ -n "$current_tree_sha" && "$current_tree_sha" == "$base_tree_sha" ]] \
       && [[ -z "$(git status --porcelain 2>/dev/null)" ]];then
      git branch -f "$base" "refs/remotes/origin/$base" >/dev/null 2>&1||:
      if git switch --force "$base" >/dev/null 2>&1;then
        git reset --hard "refs/remotes/origin/$base" >/dev/null 2>&1||:
        emitEcsEventOnStderr info autosync.repo.stale-branch-repaired success "$repo" "$branch" "switched to $base; tree matched origin/$base"
        branch=$base
        wip_branch=$(wipBranchFor "$branch")
      else
        emitEcsEventOnStderr warn autosync.repo.stale-branch-repair-skip failure "$repo" "$branch" "base=$base" "could not switch to $base"
      fi
    fi
  fi

  emitEcsEventOnStderr info autosync.repo.scan success "$repo" "$branch" "wip=$wip_branch"
  [[ -n "$(git status --porcelain 2>/dev/null)" ]]&&dirty=1
  # Unpushed = HEAD has commits not reachable from any origin/* ref.
  if [[ -n "$(git rev-list HEAD --not --remotes=origin 2>/dev/null|head -1)" ]]; then
    unpushed=1
  fi
  if (( ! dirty && ! unpushed )); then
    emitEcsEventOnStderr info autosync.repo.clean success "$repo" "$branch" 'no changes; HEAD already on origin'
    return 0
  fi

  if (( DRY_RUN )); then
    emitEcsEventOnStderr info autosync.repo.dry-run success "$repo" "$branch" 'skip push/pr (DRY_RUN=1)'
    return 0
  fi

  if ! git remote get-url origin >/dev/null 2>&1; then
    emitEcsEventOnStderr info autosync.repo.no-origin success "$repo" "$branch" 'no origin remote; commit only'
    return 0
  fi

  # Build the wip ref WITHOUT advancing the user's branch. Previously this
  # function called `git commit` on the current branch — when that branch was
  # `main`, every dirty save added a commit on main that GitHub squash-merged
  # into a different SHA, guaranteeing permanent divergence. Using
  # `git commit-tree` we leave HEAD untouched: only the namespace-scoped wip ref
  # advances, the working tree is unchanged, and the user's index is restored.
  local push_ref push_err saved_index orig_head wip_commit tree_sha pr_subject_source
  orig_head=$(git rev-parse HEAD)
  push_ref=$orig_head
  pr_subject_source=$orig_head

  if (( dirty )); then
    msg=$(generateCommitMessageViaLlm "$repo" "$branch")
    saved_index=$(git write-tree 2>/dev/null||true)
    git add -A 2>/dev/null||:
    tree_sha=$(git write-tree 2>/dev/null||true)
    if [[ -z "$tree_sha" ]];then
      emitEcsEventOnStderr warn autosync.repo.tree-failed failure "$repo" "$branch" '' 'git write-tree failed'
      [[ -n "$saved_index" ]]&&git read-tree "$saved_index" 2>/dev/null||:
      return 0
    fi
    if ! wip_commit=$(printf '%s\n\nWip-Owner: %s\nWip-Base: %s\nWip-Run: %s\n' "$msg" "$AUTOSYNC_NAMESPACE" "$branch" "$GIT_AUTOSYNC_RUN_ID" | git -c commit.gpgsign=false commit-tree "$tree_sha" -p "$orig_head" 2>/dev/null);then
      emitEcsEventOnStderr warn autosync.repo.commit-failed failure "$repo" "$branch" '' 'commit-tree failed'
      [[ -n "$saved_index" ]]&&git read-tree "$saved_index" 2>/dev/null||:
      return 0
    fi
    [[ -n "$saved_index" ]]&&git read-tree "$saved_index" 2>/dev/null||:
    push_ref=$wip_commit
    pr_subject_source=$wip_commit
    emitEcsEventOnStderr info autosync.repo.commit success "$repo" "$branch" "msg=$(printf %s "$msg"|head -1|head -c 72) wip_sha=${wip_commit:0:8}"
  fi

  # `wip/<agent-kind>/<session-id>/<base>` is replaceable only by the writer
  # that observed the current remote head. This prevents concurrent agents that
  # accidentally share a tuple from silently clobbering each other.
  local remote_wip_sha push_args=()
  remote_wip_sha=$(git ls-remote --heads origin "$wip_branch" 2>/dev/null | awk '{print $1; exit}')
  if [[ -n "$remote_wip_sha" ]];then
    push_args+=(--force-with-lease="refs/heads/$wip_branch:$remote_wip_sha")
  fi
  if ! push_err=$(git push "${push_args[@]}" origin "$push_ref:refs/heads/$wip_branch" 2>&1); then
    emitEcsEventOnStderr warn autosync.repo.push-failed failure "$repo" "$branch" "wip=$wip_branch" "${push_err:0:200}"
    return 0
  fi
  emitEcsEventOnStderr info autosync.repo.push success "$repo" "$branch" "wip=$wip_branch sha=${push_ref:0:8}"

  if [[ "$GIT_AUTOSYNC_REPO_MODE" != integrate ]];then
    emitEcsEventOnStderr info autosync.repo.snapshot-only success "$repo" "$branch" "wip=$wip_branch mode=$GIT_AUTOSYNC_REPO_MODE"
    return 0
  fi

  if (( dirty ))&&! workingTreeQuietEnough "$GIT_AUTOSYNC_REPO_QUIET_SECONDS";then
    emitEcsEventOnStderr info autosync.repo.integrate-deferred success "$repo" "$branch" "wip=$wip_branch quiet=${GIT_AUTOSYNC_REPO_QUIET_SECONDS}s"
    return 0
  fi

  if (( ! HAS_GH )) || ! originIsGitHub; then
    emitEcsEventOnStderr info autosync.repo.pr-skip success "$repo" "$branch" 'origin not GitHub or gh missing'
    return 0
  fi
  local existing_open
  existing_open=$(gh pr list --head "$wip_branch" --state open --json number --jq '.[0].number' 2>/dev/null||true)
  if [[ -n "$existing_open" ]]; then
    emitEcsEventOnStderr info autosync.repo.pr-existing success "$repo" "$branch" "wip=$wip_branch base=$base pr=#$existing_open"
    mergePrAutomatically "$repo" "$branch" "$wip_branch"
    [[ "${GIT_AUTOSYNC_LAST_PR_MERGE_MODE:-}" == immediate-merged ]]&&repairLocalCheckoutAfterImmediateMerge "$repo" "$branch" "$base" "$push_ref"
    return 0
  fi
  local pr_title pr_body pr_err
  pr_title=$(git log -1 --format='%s' "$pr_subject_source" 2>/dev/null)
  pr_body=$(git log -1 --format='%b' "$pr_subject_source" 2>/dev/null)
  [[ -z "$pr_title" ]]&&pr_title="autosync $branch"
  [[ -z "$pr_body" ]]&&pr_body="Automated checkpoint from $AUTOSYNC_NAMESPACE."
  if pr_err=$(gh pr create --base "$base" --head "$wip_branch" --title "$pr_title" --body "$pr_body" 2>&1); then
    emitEcsEventOnStderr info autosync.repo.pr-open success "$repo" "$branch" "wip=$wip_branch base=$base"
    mergePrAutomatically "$repo" "$branch" "$wip_branch"
    [[ "${GIT_AUTOSYNC_LAST_PR_MERGE_MODE:-}" == immediate-merged ]]&&repairLocalCheckoutAfterImmediateMerge "$repo" "$branch" "$base" "$push_ref"
  else
    emitEcsEventOnStderr warn autosync.repo.pr-create-failed failure "$repo" "$branch" "wip=$wip_branch" "${pr_err:0:200}"
  fi
}

main(){ local repo count=0 t0 entry_cwd=$PWD
  t0=$(date +%s)
  emitEcsEventOnStderr info autosync.start success '' '' "v$GIT_AUTOSYNC_VERSION namespace=$AUTOSYNC_NAMESPACE roots=$ROOTS dry_run=$DRY_RUN"
  while IFS= read -r repo; do
    [[ -d "$repo/.git" ]]||continue
    count=$((count+1))
    # Inline (no subshell) so the event-sequence counter keeps incrementing
    # monotonically. Restore CWD between repos since processRepository cd's in.
    processRepository "$repo" || \
      emitEcsEventOnStderr warn autosync.repo.process-failed failure "$repo" '' '' "processRepository returned nonzero"
    cd "$entry_cwd" 2>/dev/null||:
  done < <(discoverGitRepositoryRoots)
  emitEcsEventOnStderr info autosync.complete success '' '' "repos=$count duration_s=$(( $(date +%s) - t0 ))"
}

main
