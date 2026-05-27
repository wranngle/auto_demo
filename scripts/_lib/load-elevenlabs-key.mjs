/**
 * Shared helper for provision-agents.mjs, tune-agents.mjs, and
 * record-live-demos.mjs. Reads ELEVENLABS_API_KEY from the env, and
 * if absent, from ~/.agents/.env (per the operator's machine convention).
 *
 * Centralized here so a change in the env-file path or error wording
 * lands all three scripts at once.
 */
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';

export async function loadElevenLabsKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  const envPath = join(homedir(), '.agents', '.env');
  if (existsSync(envPath)) {
    const line = (await readFile(envPath, 'utf8')).split('\n').find(l => l.startsWith('ELEVENLABS_API_KEY='));
    if (line) return line.slice('ELEVENLABS_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
  }

  throw new Error('ELEVENLABS_API_KEY not set (env or ~/.agents/.env)');
}
