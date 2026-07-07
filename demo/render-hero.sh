#!/usr/bin/env bash
# demo/render-hero.sh — render demo/cassette.tape and publish the README hero.
#
# Pipeline: vhs render -> ffmpeg optimize (fps=10, width=720) -> docs/hero.gif
# (the exact asset README.md embeds). The tape needs `dist/` built first and
# a real browser on the host — the gif records an actual Playwright run.
#
# Prereqs on PATH: vhs, ttyd, ffmpeg, node, jq. The stock VHS docker image
# has no node, so this must run on the host (a repo-local toolchain works:
# PATH="$PWD/.work/hero-bin:$PATH" demo/render-hero.sh).
set -euo pipefail

repoRoot="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repoRoot"

for tool in vhs ttyd ffmpeg node jq; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "render-hero: missing prerequisite on PATH: $tool" >&2
    exit 1
  }
done

[[ -f dist/cli.js ]] || {
  echo "render-hero: dist/cli.js not found — run 'npm run build' first" >&2
  exit 1
}

echo "render-hero: recording demo/cassette.tape (real Playwright run inside)..."
vhs demo/cassette.tape

[[ -f demo/cassette.gif ]] || {
  echo "render-hero: vhs produced no demo/cassette.gif" >&2
  exit 1
}

echo "render-hero: optimizing for README embed..."
# GIF re-encodes REQUIRE a palette pass — ffmpeg's default gif encoder
# produces output orders of magnitude larger than vhs's own optimizer
# (observed: 132KB raw -> 29.7MB naive re-encode).
ffmpeg -y -loglevel error -i demo/cassette.gif \
  -vf "fps=10,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" \
  -loop 0 demo/hero.gif

# vhs's own output is already web-optimized; keep whichever is smaller.
if (($(stat -c%s demo/hero.gif) < $(stat -c%s demo/cassette.gif))); then
  cp demo/hero.gif docs/hero.gif
else
  cp demo/cassette.gif docs/hero.gif
fi

rawBytes=$(stat -c%s demo/cassette.gif)
heroBytes=$(stat -c%s docs/hero.gif)
echo "render-hero: demo/cassette.gif ${rawBytes}b -> docs/hero.gif ${heroBytes}b"

if ((heroBytes > 5242880)); then
  echo "render-hero: WARNING docs/hero.gif exceeds 5MB — trim the tape" >&2
  exit 1
fi
