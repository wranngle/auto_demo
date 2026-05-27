#!/usr/bin/env node
/**
 * Record every live ElevenLabs widget scenario under examples/widget/ against the
 * real agents (each spins its own local server via `widget --run`). Outputs land
 * in output/live-widget/<slug>-recording/{recording.webm,manifest.json,screenshots}.
 *
 * Run: node scripts/record-live-demos.mjs   (after `npm run build` + provision-agents)
 * Requires ELEVENLABS_API_KEY (env or ~/.agents/.env), Playwright chromium, quota.
 */
import {readdir, readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
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

async function main() {
  if (!existsSync(cli)) throw new Error('dist/cli.js missing — run `npm run build` first');
  const key = await loadElevenLabsKey();
  const files = (await readdir(scenarioDir)).filter(f => f.endsWith('.scenario.json')).sort();
  for (const file of files) {
    const scenario = JSON.parse(await readFile(join(scenarioDir, file), 'utf8'));
    if (!scenario.live?.agentId) {
      console.log(`skip ${file} (no live.agentId)`);
      continue;
    }
    console.log(`\n=== live record ${file} ===`);
    await run([cli, 'widget', join(scenarioDir, file), '--out-dir', outDir, '--run'], {ELEVENLABS_API_KEY: key});
  }
  console.log(`\nrecordings -> ${outDir}`);
}

await main();
