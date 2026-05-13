// Forbid regressions in the merger's structural promises.
import {describe, expect, test} from 'vitest';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';

const srcRoot = resolve(__dirname, '..', 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

const sources = walk(srcRoot);

describe('architectural guarantees', () => {
  test('no source file imports from a cloud/ path', () => {
    const offenders: string[] = [];
    for (const file of sources) {
      const body = readFileSync(file, 'utf8');
      if (/from ['"]\.\.?\/cloud\//.test(body)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  test('no source file mentions the screencli cloud host', () => {
    // We absorbed the agent loop but explicitly dropped the hosted proxy.
    // A reference to screencli.sh anywhere in src/ means the cloud surface leaked back in.
    const offenders: Array<[string, string]> = [];
    for (const file of sources) {
      const body = readFileSync(file, 'utf8');
      const match = /screencli\.sh|callAgentProxy|loadCloudConfig|saveCloudConfig/.exec(body);
      if (match) offenders.push([file, match[0]]);
    }
    expect(offenders).toEqual([]);
  });

  test('runtime SDK imports concentrate in agent/loop.ts + agent/client.ts (type-only imports allowed)', () => {
    // Concentrate runtime coupling so the auth choice + retry policy live
    // together. Type-only imports (`import type ...`) compile away to nothing
    // and are fine anywhere. agent/client.ts is the shared factory used by
    // every command that needs a client (capture/author via loop.ts, judge).
    const allowed = ['agent/loop.ts', 'agent/client.ts'];
    const offenders: string[] = [];
    for (const file of sources) {
      const body = readFileSync(file, 'utf8');
      const runtimeImport = /^import\s+(?!type\s)[^;]*from ['"]@anthropic-ai\/sdk['"]/m.test(body);
      if (runtimeImport && !allowed.some((suffix) => file.endsWith(suffix))) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('the agent loop never reads ANTHROPIC_API_KEY directly — it must come through options', () => {
    // The auth cascade in src/oauth.ts is the single source of truth.
    // If the loop reads env directly, it bypasses the cascade.
    const loopBody = readFileSync(join(srcRoot, 'agent', 'loop.ts'), 'utf8');
    expect(loopBody).not.toMatch(/process\.env\[['"]ANTHROPIC_API_KEY/);
    expect(loopBody).not.toMatch(/process\.env\[['"]ANTHROPIC_AUTH_TOKEN/);
  });
});
