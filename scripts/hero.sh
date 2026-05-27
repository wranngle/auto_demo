#!/usr/bin/env bash
# hero.sh — render demo/cassette.tape via VHS in Docker, optimize for web.
# stdout: nothing meaningful. stderr: ECS jsonl events.
# Env: DOTFILES_BOOTSTRAP_RUN_ID (inherited if invoked via dotfiles.sh).
set -euo pipefail
HEROSH_RUN_ID=${DOTFILES_BOOTSTRAP_RUN_ID:-$(uuidgen 2>/dev/null||printf '%s-%s' "$(date +%s%N)" "$RANDOM")}
HEROSH_SERVICE_NAME=hero-renderer
HEROSH_EVENT_SEQUENCE=0
emitEcsEventOnStderr(){ local lvl=$1 act=$2 out=$3 err=${4:-} detail=${5:-} ts
  HEROSH_EVENT_SEQUENCE=$((HEROSH_EVENT_SEQUENCE+1))
  ts=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
  jq -nc --arg ts "$ts" --arg l "$lvl" --arg a "$act" --arg o "$out" --arg svc "$HEROSH_SERVICE_NAME" --arg e "$err" --arg detail "$detail" --arg trace "$HEROSH_RUN_ID" --arg eid "${HEROSH_RUN_ID}-${HEROSH_EVENT_SEQUENCE}" '{"@timestamp":$ts,"log.level":$l,"event.action":$a,"event.outcome":$o,"event.id":$eid,"trace.id":$trace,"service.name":$svc,"labels":{"detail":$detail}}+(if $e=="" then {} else {"error.message":$e} end)' >&2;}
tapeFilePath=${1:-demo/cassette.tape}
[[ -f $tapeFilePath ]]||{ emitEcsEventOnStderr error hero.tape-missing failure "tape not found: $tapeFilePath";exit 1;}
emitEcsEventOnStderr info hero.start success '' "tape=$tapeFilePath"
mkdir -p demo
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/vhs" ghcr.io/charmbracelet/vhs "$tapeFilePath"||{ emitEcsEventOnStderr error hero.vhs-failed failure 'vhs render exited nonzero';exit 1;}
rawRenderedGif=demo/cassette.gif
[[ -f $rawRenderedGif ]]||{ emitEcsEventOnStderr error hero.no-gif failure "vhs produced no $rawRenderedGif";exit 1;}
ffmpeg -y -i "$rawRenderedGif" -vf "fps=10,scale=720:-1:flags=lanczos" -loop 0 demo/hero.gif 2>/dev/null||{ emitEcsEventOnStderr error hero.ffmpeg-gif-failed failure 'ffmpeg gif optimization failed';exit 1;}
ffmpeg -y -i "$rawRenderedGif" -vcodec libwebp -lossless 0 -q:v 70 -loop 0 -an demo/hero.webp 2>/dev/null||{ emitEcsEventOnStderr error hero.ffmpeg-webp-failed failure 'ffmpeg webp encoding failed';exit 1;}
gifByteSize=$(stat -c%s demo/hero.gif 2>/dev/null||stat -f%z demo/hero.gif)
webpByteSize=$(stat -c%s demo/hero.webp 2>/dev/null||stat -f%z demo/hero.webp)
emitEcsEventOnStderr info hero.complete success '' "gif=${gifByteSize}b webp=${webpByteSize}b"
((gifByteSize>5242880))&&emitEcsEventOnStderr warn hero.gif-oversize failure '' "gif=${gifByteSize}b limit=5MB"||:
