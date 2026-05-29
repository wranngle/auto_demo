#!/usr/bin/env node
/**
 * Record every live ElevenLabs widget scenario under examples/widget/ against the
 * real agents (each spins its own local server via `widget --run`). Outputs land
 * in output/live-widget/<slug>-recording/{recording.webm,manifest.json,screenshots}.
 *
 * Run: node scripts/record-live-demos.mjs   (after `npm run build` + provision-agents)
 * Requires ELEVENLABS_API_KEY (env or ~/.agents/.env), Playwright chromium, quota.
 *
 * Memory-aware mode (optional, opt-in):
 *   MIN_AVAIL_GIB=2 node scripts/record-live-demos.mjs
 *
 * Before each scenario, polls /proc/meminfo's MemAvailable. If below the
 * threshold, waits (default 30s, override MIN_AVAIL_POLL_SEC=N) up to
 * MIN_AVAIL_TIMEOUT_MIN=30 before marking that scenario failed and moving
 * on. Lets the batch coexist with a parallel Playwright/Chromium workload
 * without OOM-ing either side.
 */
import {readdir, readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {setTimeout as wait} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {loadElevenLabsKey} from './_lib/load-elevenlabs-key.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const cli = join(repoRoot, 'dist', 'cli.js');
const scenarioDir = join(repoRoot, 'examples', 'widget');
const outDir = join(repoRoot, 'output', 'live-widget');

function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', args, {stdio: 'inherit', env: {...process.env, ...env}});
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  });
}

// Linux-only helper: parse /proc/meminfo's MemAvailable. Returns GiB or null
// (other platforms / parse failure). Used to coexist with a parallel
// Playwright/Chromium workload — recording one demo needs ~1.5GiB headroom;
// launching while RAM is tight crashes the run with `Target page, context or
// browser has been closed` partway through.
async function memoryAvailableGiB() {
  try {
    const text = await readFile('/proc/meminfo', 'utf8');
    const match = /MemAvailable:\s+(\d+)\s+kB/u.exec(text);
    return match ? Number(match[1]) / 1024 / 1024 : null;
  } catch { return null; }
}

async function waitForMemory(thresholdGiB, label) {
  const pollSec = Number(process.env.MIN_AVAIL_POLL_SEC ?? 30);
  const timeoutMin = Number(process.env.MIN_AVAIL_TIMEOUT_MIN ?? 30);
  const deadline = Date.now() + timeoutMin * 60_000;
  for (let attempt = 0; Date.now() < deadline; attempt++) {
    const avail = await memoryAvailableGiB();
    if (avail === null) return true; // non-Linux or parse failure — skip the gate
    if (avail >= thresholdGiB) {
      if (attempt > 0) console.log(`memory recovered: ${avail.toFixed(1)}GiB available (need ${thresholdGiB}), proceeding with ${label}`);
      return true;
    }
    console.log(`waiting on memory for ${label}: ${avail.toFixed(1)}GiB available, need ${thresholdGiB}GiB (next check ${pollSec}s)`);
    await wait(pollSec * 1000);
  }
  return false;
}

async function main() {
  if (!existsSync(cli)) throw new Error('dist/cli.js missing — run `npm run build` first');
  const key = await loadElevenLabsKey();
  const minAvailGiB = process.env.MIN_AVAIL_GIB ? Number(process.env.MIN_AVAIL_GIB) : null;
  const files = (await readdir(scenarioDir)).filter(f => f.endsWith('.scenario.json')).sort();
  // Per-scenario isolation: a single agent stall / browser drop must not
  // cancel the remaining 6 recordings. Tally outcomes and exit non-zero
  // only if at least one failed, so the operator sees the full batch state.
  const ok = []; const failed = []; const skipped = [];
  for (const file of files) {
    const scenario = JSON.parse(await readFile(join(scenarioDir, file), 'utf8'));
    if (!scenario.live?.agentId) {
      console.log(`skip ${file} (no live.agentId)`);
      skipped.push(file);
      continue;
    }
    if (minAvailGiB !== null) {
      const ready = await waitForMemory(minAvailGiB, file);
      if (!ready) {
        console.error(`!! ${file} skipped: memory never reached ${minAvailGiB}GiB within MIN_AVAIL_TIMEOUT_MIN`);
        failed.push(file);
        continue;
      }
    }
    console.log(`\n=== live record ${file} ===`);
    try {
      await run([cli, 'widget', join(scenarioDir, file), '--out-dir', outDir, '--run'], {ELEVENLABS_API_KEY: key});
      ok.push(file);
    } catch (err) {
      console.error(`!! ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
      failed.push(file);
    }
  }
  console.log(`\nrecordings -> ${outDir}`);
  console.log(`summary: ok=${ok.length} failed=${failed.length} skipped=${skipped.length}`);
  if (failed.length > 0) {
    console.log(`failed scenarios:\n  ${failed.join('\n  ')}`);
    process.exitCode = 1;
  }
}

await main();
