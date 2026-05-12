#!/usr/bin/env bash
# agent-git-guard.sh -- strict baseline/finalize guard for agent-owned Git drift.
#
# This is not a prompt hook. It is an explicit finalizer contract:
# - baseline writes a start-of-turn snapshot
# - finalize reads that snapshot, emits NDJSON findings, and never mutates repos
# - finalize fails closed when the baseline is missing
set -euo pipefail

usage(){
  cat <<'USAGE'
Usage:
  agent-git-guard.sh baseline [--session ID] [--scope current|roots] [PATH...]
  agent-git-guard.sh finalize [--session ID] [--scope current|roots] [PATH...]

Environment:
  AGENT_GIT_GUARD_SESSION     Baseline/finalize session id. Default: global
  AGENT_GIT_GUARD_ROOTS       Colon-separated roots for --scope roots.
                              Default: $HOME/projects:$HOME/.dotfiles
  AGENT_GIT_GUARD_MAX_DEPTH   Repository discovery depth. Default: 4
  AGENT_GIT_GUARD_MAX_REPOS   Safety cap. Default: 80
  AGENT_GIT_GUARD_STATE_DIR   State dir. Default: $XDG_STATE_HOME/agent-git-guard

Output:
  NDJSON. Exit 0 clean, 1 dirty/agent-owned drift, 2 misconfigured.
USAGE
}

command_name=${1:-}
[[ -n "$command_name" ]] || { usage; exit 2; }
shift || true

session_id=${AGENT_GIT_GUARD_SESSION:-global}
scope=current
state_root=${AGENT_GIT_GUARD_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/agent-git-guard}
max_depth=${AGENT_GIT_GUARD_MAX_DEPTH:-4}
max_repos=${AGENT_GIT_GUARD_MAX_REPOS:-80}
explicit_paths=()
discovery_truncated=0

while [[ $# -gt 0 ]];do
  case "$1" in
    --session) session_id=${2:-}; [[ -n "$session_id" ]] || { echo "missing --session value" >&2; exit 2; }; shift 2;;
    --scope) scope=${2:-}; [[ "$scope" =~ ^(current|roots)$ ]] || { echo "invalid --scope" >&2; exit 2; }; shift 2;;
    --hook) echo '{"check":"finalizer.hook_mode","outcome":"fail","severity":"error","message":"ambient hooks are forbidden; invoke baseline/finalize explicitly"}'; exit 2;;
    -h|--help) usage; exit 0;;
    --) shift; while [[ $# -gt 0 ]];do explicit_paths+=("$1"); shift; done;;
    -*) echo "unknown option: $1" >&2; exit 2;;
    *) explicit_paths+=("$1"); shift;;
  esac
done

[[ "$command_name" =~ ^(baseline|finalize)$ ]] || { usage >&2; exit 2; }
command -v jq >/dev/null 2>&1 || { printf '{"check":"prereq","outcome":"fail","severity":"error","message":"jq is required"}\n'; exit 2; }

emit(){
  local repo=$1 check=$2 outcome=$3 severity=$4 message=$5 subject=${6:-}
  jq -nc \
    --arg repo "$repo" \
    --arg check "$check" \
    --arg outcome "$outcome" \
    --arg severity "$severity" \
    --arg message "$message" \
    --arg subject "$subject" \
    '{repo:$repo,check:$check,outcome:$outcome,severity:$severity,message:$message} + (if $subject == "" then {} else {subject:$subject} end)'
}

hash_text(){
  printf '%s' "$1" | sha256sum | awk '{print $1}'
}

safe_session(){
  local normalized digest
  normalized=$(printf '%s' "$session_id" | tr -c 'A-Za-z0-9_.-' '_')
  digest=$(printf '%s' "$session_id" | sha256sum | awk '{print substr($1,1,12)}')
  printf '%s-%s' "$normalized" "$digest"
}

state_file_for_repo(){
  local repo=$1
  printf '%s/%s/%s.tsv' "$state_root" "$(safe_session)" "$(hash_text "$repo")"
}

discover_repos(){
  declare -gA seen_repos=()
  declare -ga repos=()
  local candidate root entry repo

  add_repo(){
    local path=$1 found
    found=$(git -C "$path" rev-parse --show-toplevel 2>/dev/null || true)
    [[ -n "$found" ]] || return 0
    if [[ -z ${seen_repos[$found]+x} ]];then
      seen_repos[$found]=1
      repos+=("$found")
    fi
  }

  if ((${#explicit_paths[@]} > 0));then
    for candidate in "${explicit_paths[@]}";do
      [[ -e "$candidate" || -d "$candidate" ]] && add_repo "$candidate"
    done
  else
    add_repo "$PWD"
  fi

  [[ "$scope" == roots ]] || return 0
  IFS=: read -r -a roots <<<"${AGENT_GIT_GUARD_ROOTS:-$HOME/projects:$HOME/.dotfiles}"
  for root in "${roots[@]}";do
    [[ -d "$root" ]] || continue
    add_repo "$root"
    while IFS= read -r entry;do
      repo=$(dirname "$entry")
      add_repo "$repo"
      if ((${#repos[@]} >= max_repos));then
        discovery_truncated=1
        break
      fi
    done < <(
      find "$root" -maxdepth "$max_depth" \
        \( -path '*/node_modules/*' -o -path '*/.git/modules/*' -o -path '*/.symphony/workspaces/*' \) -prune -o \
        \( -type d -name .git -o -type f -name .git \) -print 2>/dev/null
    )
    if ((${#repos[@]} >= max_repos));then
      discovery_truncated=1
      break
    fi
  done
}

diff_paths_z(){
  local repo=$1 mode=$2 status path old_path new_path
  while IFS= read -r -d '' status;do
    case "$status" in
      R*|C*)
        IFS= read -r -d '' old_path || break
        IFS= read -r -d '' new_path || break
        printf '%s\0%s\0' "$old_path" "$new_path"
        ;;
      *)
        IFS= read -r -d '' path || break
        printf '%s\0' "$path"
        ;;
    esac
  done < <(
    if [[ -n "$mode" ]];then
      git -C "$repo" -c core.quotepath=false diff -z --name-status -M "$mode" 2>/dev/null || true
    else
      git -C "$repo" -c core.quotepath=false diff -z --name-status -M 2>/dev/null || true
    fi
  )
}

dirty_paths(){
  local repo=$1
  {
    diff_paths_z "$repo" ''
    diff_paths_z "$repo" --cached
    git -C "$repo" -c core.quotepath=false ls-files -z --others --exclude-standard 2>/dev/null || true
  } | LC_ALL=C sort -zu
}

encode_path(){
  printf '%s' "$1" | base64 | tr -d '\n'
}

decode_path(){
  printf '%s' "$1" | base64 -d
}

path_hashes(){
  local repo=$1 path=$2 work_hash=- index_hash=- index_mode=
  index_mode=$(git -C "$repo" -c core.quotepath=false ls-files -s -- "$path" 2>/dev/null | awk '{print $1; exit}')
  index_hash=$(git -C "$repo" -c core.quotepath=false ls-files -s -- "$path" 2>/dev/null | awk '{print $2; exit}')
  [[ -n "$index_hash" ]] || index_hash=-
  if [[ "$index_mode" == 160000 ]];then
    printf '%s\t%s\n' "$index_hash" "$index_hash"
    return 0
  fi
  if [[ -e "$repo/$path" || -L "$repo/$path" ]];then
    work_hash=$(git -C "$repo" -c core.quotepath=false hash-object -- "$path" 2>/dev/null || printf '-')
  fi
  printf '%s\t%s\n' "$work_hash" "$index_hash"
}

head_hash_for_path(){
  local repo=$1 path=$2
  git -C "$repo" -c core.quotepath=false rev-parse "HEAD:$path" 2>/dev/null || printf '-'
}

head_oid(){
  git -C "$1" rev-parse --verify HEAD 2>/dev/null || printf 'UNBORN'
}

branch_name(){
  git -C "$1" symbolic-ref --quiet --short HEAD 2>/dev/null \
    || git -C "$1" rev-parse --short HEAD 2>/dev/null \
    || printf 'UNBORN'
}

upstream_name(){
  git -C "$1" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true
}

ahead_behind(){
  local repo=$1 upstream counts
  upstream=$(upstream_name "$repo")
  if [[ -z "$upstream" ]];then
    printf -- '-1\t-1\n'
    return 0
  fi
  counts=$(git -C "$repo" rev-list --left-right --count "HEAD...@{upstream}" 2>/dev/null || printf '0 0')
  printf '%s\n' "$counts" | awk '{printf "%s\t%s\n", $1, $2}'
}

unsafe_state(){
  local repo=$1 gitdir gitdir_abs f
  gitdir=$(git -C "$repo" rev-parse --git-dir 2>/dev/null || true)
  [[ -n "$gitdir" ]] || return 1
  if [[ "$gitdir" == /* ]];then
    gitdir_abs=$gitdir
  else
    gitdir_abs=$repo/$gitdir
  fi
  for f in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD BISECT_LOG rebase-apply rebase-merge;do
    [[ -e "$gitdir_abs/$f" ]] && { printf '%s' "$f"; return 0; }
  done
  return 1
}

baseline_repo(){
  local repo=$1 file tmp path path_key hashes ahead behind count=0
  file=$(state_file_for_repo "$repo")
  mkdir -p "$(dirname "$file")"
  tmp=$(mktemp "${file}.tmp.XXXXXX")
  read -r ahead behind < <(ahead_behind "$repo")
  {
    printf 'version\t1\n'
    printf 'repo\t%s\n' "$repo"
    printf 'head\t%s\n' "$(head_oid "$repo")"
    printf 'branch\t%s\n' "$(branch_name "$repo")"
    printf 'upstream\t%s\n' "$(upstream_name "$repo")"
    printf 'ahead\t%s\n' "$ahead"
    printf 'behind\t%s\n' "$behind"
    while IFS= read -r -d '' path;do
      [[ -n "$path" ]] || continue
      hashes=$(path_hashes "$repo" "$path")
      path_key=$(encode_path "$path")
      printf 'path\t%s\t%s\n' "$path_key" "$hashes"
      count=$((count+1))
    done < <(dirty_paths "$repo")
    printf 'dirty_count\t%s\n' "$count"
  } > "$tmp"
  mv "$tmp" "$file"
  emit "$repo" baseline pass info "baseline recorded" "$file"
}

finalize_repo(){
  local repo=$1 file kind a b c path hashes work index unsafe head_hash
  local base_head=UNBORN base_ahead=-1 base_upstream='' current_head current_ahead current_behind current_upstream
  local exit_class=0
  declare -A base_work=()
  declare -A base_index=()
  declare -A base_seen=()
  declare -A current_seen=()
  declare -a new_dirty=()
  declare -a changed_dirty=()
  declare -a unchanged_dirty=()
  declare -a removed_dirty=()

  file=$(state_file_for_repo "$repo")
  if [[ ! -s "$file" ]];then
    emit "$repo" baseline fail error "missing baseline; finalizer fails closed" "$file"
    return 2
  fi

  while IFS=$'\t' read -r kind a b c;do
    c=${c%$'\r'}
    case "$kind" in
      head) base_head=$a;;
      upstream) base_upstream=$a;;
      ahead) base_ahead=${a:--1};;
      path)
        path=$(decode_path "$a")
        base_work[$path]=${b:--}
        base_index[$path]=${c:--}
        base_seen[$path]=1
        ;;
    esac
  done < "$file"

  if unsafe=$(unsafe_state "$repo");then
    emit "$repo" git.operation fail error "in-progress Git operation has precedence" "$unsafe"
    exit_class=1
  fi

  while IFS= read -r -d '' path;do
    [[ -n "$path" ]] || continue
    current_seen[$path]=1
    hashes=$(path_hashes "$repo" "$path")
    work=${hashes%%$'\t'*}
    index=${hashes#*$'\t'}
    if [[ -z ${base_seen[$path]+x} ]];then
      new_dirty+=("$path")
    elif [[ ${base_work[$path]} == "$work" && ${base_index[$path]} == "$index" ]];then
      unchanged_dirty+=("$path")
    else
      changed_dirty+=("$path")
    fi
  done < <(dirty_paths "$repo")

  if ((${#new_dirty[@]} > 0));then
    emit "$repo" dirty.new fail error "new dirty paths created after baseline" "$(printf '%s,' "${new_dirty[@]}" | sed 's/,$//')"
    exit_class=1
  fi
  if ((${#changed_dirty[@]} > 0));then
    emit "$repo" dirty.changed fail error "pre-existing dirty paths changed after baseline" "$(printf '%s,' "${changed_dirty[@]}" | sed 's/,$//')"
    exit_class=1
  fi
  if ((${#unchanged_dirty[@]} > 0));then
    emit "$repo" dirty.unchanged pass info "unchanged pre-existing dirty paths ignored" "${#unchanged_dirty[@]}"
  fi

  for path in "${!base_seen[@]}";do
    [[ -z ${current_seen[$path]+x} ]] || continue
    hashes=$(path_hashes "$repo" "$path")
    work=${hashes%%$'\t'*}
    if [[ "$work" == "${base_work[$path]}" && "$work" != '-' ]];then
      emit "$repo" dirty.ignored_unchanged pass info "pre-existing dirty path remains on disk but is now ignored" "$path"
      continue
    fi
    head_hash=$(head_hash_for_path "$repo" "$path")
    if [[ ( ${base_work[$path]} == '-' && "$head_hash" == '-' ) || ( ${base_work[$path]} != '-' && ${base_work[$path]} == "$head_hash" ) ]];then
      emit "$repo" dirty.committed pass info "pre-existing dirty path is now represented in HEAD" "$path"
    else
      removed_dirty+=("$path")
    fi
  done
  if ((${#removed_dirty[@]} > 0));then
    emit "$repo" dirty.removed fail error "pre-existing dirty paths disappeared after baseline" "$(printf '%s,' "${removed_dirty[@]}" | sed 's/,$//')"
    exit_class=1
  fi

  current_head=$(head_oid "$repo")
  current_upstream=$(upstream_name "$repo")
  if [[ "$current_upstream" != "$base_upstream" ]];then
    emit "$repo" commits.upstream fail error "branch upstream changed after baseline" "baseline=$base_upstream current=$current_upstream"
    exit_class=1
  fi
  read -r current_ahead current_behind < <(ahead_behind "$repo")
  if [[ "$current_head" != "$base_head" && ( "$current_ahead" == -1 || "$current_ahead" -gt "$base_ahead" ) ]];then
    emit "$repo" commits.unpushed fail error "HEAD changed and branch has new unpushed commits" "ahead=$current_ahead"
    exit_class=1
  elif [[ "$current_ahead" != -1 && "$base_ahead" != -1 && "$current_ahead" -gt "$base_ahead" ]];then
    emit "$repo" commits.unpushed fail error "branch ahead count increased after baseline" "ahead=$current_ahead"
    exit_class=1
  fi
  if [[ "$current_behind" != -1 && "$current_behind" -gt 0 ]];then
    emit "$repo" commits.behind warn warn "branch is behind upstream" "behind=$current_behind"
  fi

  if (( exit_class == 0 ));then
    emit "$repo" finalize pass info "no agent-owned dirty or unpushed work"
  fi
  return "$exit_class"
}

discover_repos
if ((${#repos[@]} == 0));then
  emit "" repo fail error "no git repositories discovered"
  exit 2
fi
if (( discovery_truncated ));then
  emit "" discovery.truncated warn warn "repository discovery hit AGENT_GIT_GUARD_MAX_REPOS" "$max_repos"
fi

status=0
case "$command_name" in
  baseline)
    for repo in "${repos[@]}";do
      baseline_repo "$repo"
    done
    ;;
  finalize)
    for repo in "${repos[@]}";do
      if finalize_repo "$repo";then
        :
      else
        repo_status=$?
        if (( repo_status == 2 ));then
          status=2
        elif (( status == 0 ));then
          status=1
        fi
      fi
    done
    exit "$status"
    ;;
esac
