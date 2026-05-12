#!/usr/bin/env bash
# llm.sh — gemini+claude+codex fallback chain with intelligent backoff.
# stdout: model response. stderr: ECS jsonl events.
# Env: LLM_CHAIN, LLM_SYSTEM, LLM_TIMEOUT (default 90), DOTFILES_BOOTSTRAP_RUN_ID
set -uo pipefail
LLMSH_RUN_ID=${DOTFILES_BOOTSTRAP_RUN_ID:-$(uuidgen 2>/dev/null||printf '%s-%s' "$(date +%s%N)" "$RANDOM")}
LLMSH_SERVICE_NAME=llm-fallback-chain
LLMSH_EVENT_SEQUENCE=0
emitEcsEventOnStderr(){ local lvl=$1 act=$2 out=$3 prov=${4:-} mdl=${5:-} err=${6:-} ts json
  LLMSH_EVENT_SEQUENCE=$((LLMSH_EVENT_SEQUENCE+1))
  ts=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
  json=$(jq -nc --arg ts "$ts" --arg l "$lvl" --arg a "$act" --arg o "$out" --arg svc "$LLMSH_SERVICE_NAME" --arg pv "$prov" --arg m "$mdl" --arg e "$err" --arg trace "$LLMSH_RUN_ID" --arg eid "${LLMSH_RUN_ID}-${LLMSH_EVENT_SEQUENCE}" '{"@timestamp":$ts,"log.level":$l,"event.action":$a,"event.outcome":$o,"event.id":$eid,"trace.id":$trace,"service.name":$svc,"labels":{"provider":$pv,"model":$m}}+(if $e=="" then {} else {"error.message":$e} end)')
  printf '%s\n' "$json" >&2;[[ -n ${DOTFILES_LOG_FILE:-} ]]&&printf '%s\n' "$json" >> "$DOTFILES_LOG_FILE"||:;}
userPrompt="";jsonSchema=""
while [[ $# -gt 0 ]];do case "$1" in
  --schema|--json-schema) jsonSchema="$2";shift 2;;
  *) [[ -z $userPrompt ]]&&userPrompt="$1"||userPrompt="$userPrompt $1";shift;;
esac;done
[[ -z $userPrompt && ! -t 0 ]]&&userPrompt=$(cat)
[[ -z $userPrompt ]]&&{ emitEcsEventOnStderr error llm.usage failure '' '' 'no prompt provided';exit 2;}
DEFAULT_FALLBACK_CHAIN='gemini:gemini-3.1-pro-preview,claude:opus,codex:o3-mini,gemini:gemini-3-pro-preview,gemini:gemini-pro-latest,gemini:gemini-3-flash-preview,gemini:gemini-3.1-flash-lite-preview,claude:sonnet,gemini:gemini-flash-latest,gemini:gemini-2.5-flash,gemini:gemma-3-27b-it'
fallbackChainSpec=${LLM_CHAIN:-$DEFAULT_FALLBACK_CHAIN};perCallTimeoutSeconds=${LLM_TIMEOUT:-120};systemPrompt=${LLM_SYSTEM:-}
isQuotaOrRateLimitError(){ local err;err=$(printf %s "$1"|tr A-Z a-z);case "$err" in *429*|*quota*|*"rate limit"*|*"rate-limit"*|*exceeded*|*resource_exhausted*|*503*|*504*|*overloaded*|*capacity*) return 0;;*) return 1;;esac;}
callGeminiGenerateContentApi(){ local modelId=$1 prompt=$2 system=$3 schema=$4 commandArgs fullPrompt
  command -v gemini >/dev/null||{ echo 'gemini not on PATH' >&2;return 2;}
  fullPrompt="$prompt";[[ -n $system ]]&&fullPrompt="SYSTEM_INSTRUCTIONS: $system\n\nUSER_PROMPT: $prompt"
  [[ -n $schema ]]&&fullPrompt="$fullPrompt\n\nOUTPUT_SCHEMA: $schema\nReturn ONLY raw JSON matching the schema."
  commandArgs=(-p - -y --output-format text -m "$modelId")
  printf '%s' "$fullPrompt" | IS_SANDBOX=1 timeout --preserve-status "${perCallTimeoutSeconds}s" gemini "${commandArgs[@]}";}
callClaudeCommandLineInterface(){ local modelId=$1 prompt=$2 system=$3 schema=$4 commandArgs
  command -v claude >/dev/null||{ echo 'claude not on PATH' >&2;return 2;}
  commandArgs=(-p --dangerously-skip-permissions --strict-mcp-config --disable-slash-commands --setting-sources user --model "$modelId" --output-format text)
  [[ -n $system ]]&&commandArgs+=(--system-prompt "$system")
  [[ -n $schema ]]&&commandArgs+=(--json-schema "$schema")
  printf '%s' "$prompt" | IS_SANDBOX=1 timeout --preserve-status "${perCallTimeoutSeconds}s" claude "${commandArgs[@]}" -;}
callCodexCommandLineInterface(){ local modelId=$1 prompt=$2 system=$3 schema=$4 commandArgs fullPrompt
  command -v npx >/dev/null||{ echo 'npx not on PATH' >&2;return 2;}
  fullPrompt="$prompt";[[ -n $system ]]&&fullPrompt="$system\n\n$prompt"
  commandArgs=(exec --ephemeral --dangerously-bypass-approvals-and-sandbox --color never -m "$modelId")
  [[ -n $schema ]]&&commandArgs+=(--output-schema "$schema")
  commandArgs+=(-)
  printf '%s' "$fullPrompt" | timeout --preserve-status "${perCallTimeoutSeconds}s" npx -y @openai/codex "${commandArgs[@]}";}
chainEntries=();while IFS= read -r rawEntry||[[ -n $rawEntry ]];do rawEntry=$(printf %s "$rawEntry"|tr -d '[:space:]');[[ -n $rawEntry ]]&&chainEntries+=("$rawEntry");done < <(printf %s "$fallbackChainSpec"|tr ',' '\n')
errorBufferFile=$(mktemp);trap 'rm -f "$errorBufferFile"' EXIT
for chainSpec in "${chainEntries[@]}";do
  providerName=${chainSpec%%:*};modelId=${chainSpec#*:};retryCount=0;maxRetries=3;sleepTime=30
  while ((retryCount <= maxRetries));do
    : >"$errorBufferFile";emitEcsEventOnStderr info llm.attempt success "$providerName" "$modelId" "attempt=$((retryCount+1))"
    case "$providerName" in
      gemini) modelOutput=$(callGeminiGenerateContentApi "$modelId" "$userPrompt" "$systemPrompt" "$jsonSchema" 2>"$errorBufferFile");;
      claude) modelOutput=$(callClaudeCommandLineInterface "$modelId" "$userPrompt" "$systemPrompt" "$jsonSchema" 2>"$errorBufferFile");;
      codex) modelOutput=$(callCodexCommandLineInterface "$modelId" "$userPrompt" "$systemPrompt" "$jsonSchema" 2>"$errorBufferFile");;
      *) emitEcsEventOnStderr warn llm.unknown-provider failure "$providerName" "$modelId" 'unknown provider in chain';break 2;;
    esac
    exitCode=$?
    if [[ $exitCode -eq 0 && -n ${modelOutput:-} ]];then emitEcsEventOnStderr info llm.success success "$providerName" "$modelId" '';printf '%s\n' "$modelOutput";exit 0;fi
    capturedError=$(cat "$errorBufferFile")
    [[ $exitCode -ne 0 && -n ${modelOutput:-} ]] && capturedError="${capturedError} ${modelOutput}"
    if isQuotaOrRateLimitError "$capturedError" && ((retryCount < maxRetries));then
      emitEcsEventOnStderr warn llm.retry-backoff failure "$providerName" "$modelId" "wait=${sleepTime}s error=${capturedError:0:100}"
      sleep "$sleepTime";retryCount=$((retryCount+1));sleepTime=$((sleepTime * 2));continue
    fi
    if isQuotaOrRateLimitError "$capturedError";then emitEcsEventOnStderr warn llm.quota-advance failure "$providerName" "$modelId" "${capturedError:0:200}"
    else emitEcsEventOnStderr warn llm.error-advance failure "$providerName" "$modelId" "${capturedError:0:200}";fi
    break
  done
done
emitEcsEventOnStderr error llm.chain-exhausted failure '' '' 'all models in chain exhausted'
exit 1
