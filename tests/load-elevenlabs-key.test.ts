// Contract lock for scripts/_lib/load-elevenlabs-key.mjs.
// All 3 agent-provisioning scripts (provision, tune, record-live) depend on
// this single helper for credential resolution. A silent regression in
// precedence (file > env), quote-handling, or the throw message would
// break every batch invocation simultaneously.
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {loadElevenLabsKey} from '../scripts/_lib/load-elevenlabs-key.mjs';

let fakeHome: string;

beforeEach(async () => {
  fakeHome = await mkdtemp(join(tmpdir(), 'ui-demo-fake-home-'));
  vi.stubEnv('HOME', fakeHome);
  vi.stubEnv('ELEVENLABS_API_KEY', '');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(fakeHome, {recursive: true, force: true});
});

async function writeAgentsEnv(body: string): Promise<void> {
  await mkdir(join(fakeHome, '.agents'), {recursive: true});
  await writeFile(join(fakeHome, '.agents', '.env'), body, 'utf8');
}

describe('loadElevenLabsKey: credential resolution', () => {
  test('env var wins over file when both are present', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'env-key-xyz');
    await writeAgentsEnv('ELEVENLABS_API_KEY=file-key-abc\n');
    expect(await loadElevenLabsKey()).toBe('env-key-xyz');
  });

  test('falls back to ~/.agents/.env when env var is unset', async () => {
    await writeAgentsEnv('OTHER=ignored\nELEVENLABS_API_KEY=file-key-abc\nMORE=ignored\n');
    expect(await loadElevenLabsKey()).toBe('file-key-abc');
  });

  test('strips surrounding double quotes from the file value', async () => {
    await writeAgentsEnv('ELEVENLABS_API_KEY="quoted-key"\n');
    expect(await loadElevenLabsKey()).toBe('quoted-key');
  });

  test('strips surrounding single quotes from the file value', async () => {
    await writeAgentsEnv("ELEVENLABS_API_KEY='single-quoted'\n");
    expect(await loadElevenLabsKey()).toBe('single-quoted');
  });

  test('does not strip inner quotes (only outermost pair)', async () => {
    // A key with a literal quote in the middle is unlikely in practice, but
    // the regex is `^["']|["']$` (anchored) so it must not eat them.
    await writeAgentsEnv('ELEVENLABS_API_KEY=ab"cd\n');
    expect(await loadElevenLabsKey()).toBe('ab"cd');
  });

  test('throws the documented error when env unset AND file missing', async () => {
    await expect(loadElevenLabsKey()).rejects.toThrow('ELEVENLABS_API_KEY not set (env or ~/.agents/.env)');
  });

  test('throws when file exists but does not contain the key line', async () => {
    await writeAgentsEnv('OTHER=val\nANOTHER=val2\n');
    await expect(loadElevenLabsKey()).rejects.toThrow('ELEVENLABS_API_KEY not set (env or ~/.agents/.env)');
  });

  test('trims trailing whitespace from the file value', async () => {
    await writeAgentsEnv('ELEVENLABS_API_KEY=trimmed-key   \n');
    expect(await loadElevenLabsKey()).toBe('trimmed-key');
  });
});
