// Contract for resolveTarget — the README promise: "Relative startUrl and
// goto.url values resolve against the flow file's directory. With --base-url,
// relative URLs resolve against that local dev server." Pure function, four
// branches (absolute passthrough → base-url join → existing-file file:// →
// literal passthrough), previously unit-untested.

import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {describe, expect, test} from 'vitest';
import {resolveTarget} from '../src/url-resolver.js';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const flowDir = resolve(repoRoot, 'examples'); // Examples/fixtures/smoke.html exists

describe('resolveTarget', () => {
  test('absolute http/https URLs pass through unchanged', () => {
    expect(resolveTarget('https://example.com/app', flowDir)).toBe('https://example.com/app');
    expect(resolveTarget('http://127.0.0.1:5177/console/', flowDir)).toBe('http://127.0.0.1:5177/console/');
  });

  test('absolute URL wins even when a base-url is supplied', () => {
    expect(resolveTarget('https://example.com/x', flowDir, 'http://localhost:3000')).toBe('https://example.com/x');
  });

  test('relative ref joins against base-url when given', () => {
    expect(resolveTarget('console/', flowDir, 'http://127.0.0.1:5177')).toBe('http://127.0.0.1:5177/console/');
  });

  test('base-url join tolerates a missing trailing slash (ensureTrailingSlash)', () => {
    // Without the trailing-slash guard, "http://h/base" + "page" would drop "base".
    expect(resolveTarget('page.html', flowDir, 'http://host/base')).toBe('http://host/base/page.html');
    expect(resolveTarget('page.html', flowDir, 'http://host/base/')).toBe('http://host/base/page.html');
  });

  test('relative ref to an existing local file becomes a file:// URL', () => {
    const resolved = resolveTarget('fixtures/smoke.html', flowDir);
    expect(resolved.startsWith('file://')).toBe(true);
    expect(resolved.endsWith('/examples/fixtures/smoke.html')).toBe(true);
  });

  test('relative ref to a non-existent path is returned literally (no base-url, no file)', () => {
    expect(resolveTarget('does/not/exist.html', flowDir)).toBe('does/not/exist.html');
  });
});
