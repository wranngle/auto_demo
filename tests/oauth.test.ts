import {describe, expect, test, beforeEach, afterEach} from 'vitest';
import {writeFileSync, mkdirSync, rmSync} from 'node:fs';
import {tmpdir, homedir} from 'node:os';
import {join} from 'node:path';

const FAKE_HOME = join(tmpdir(), `auto_demo-oauth-${process.pid}-${Date.now()}`);

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  process.env.HOME = FAKE_HOME;
  mkdirSync(join(FAKE_HOME, '.claude'), {recursive: true});
});

afterEach(() => {
  rmSync(FAKE_HOME, {recursive: true, force: true});
  process.env.HOME = homedir();
});

import {resolveAnthropicAuth, describeAuth} from '../src/oauth.js';

describe('resolveAnthropicAuth', () => {
  test('reports "none" when nothing is configured', () => {
    const auth = resolveAnthropicAuth();
    expect(auth.source).toBe('none');
    expect(auth.apiKey).toBeUndefined();
    expect(auth.authToken).toBeUndefined();
  });

  test('prefers ANTHROPIC_API_KEY over everything else', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';
    process.env.ANTHROPIC_AUTH_TOKEN = 'should-be-ignored';
    writeFileSync(
      join(FAKE_HOME, '.claude', '.credentials.json'),
      JSON.stringify({claudeAiOauth: {accessToken: 'oauth-token', expiresAt: Date.now() + 99999}}),
    );
    const auth = resolveAnthropicAuth();
    expect(auth.source).toBe('env-api-key');
    expect(auth.apiKey).toBe('sk-test-key');
  });

  test('falls through to ANTHROPIC_AUTH_TOKEN if API key is unset', () => {
    process.env.ANTHROPIC_AUTH_TOKEN = 'env-bearer';
    const auth = resolveAnthropicAuth();
    expect(auth.source).toBe('env-auth-token');
    expect(auth.authToken).toBe('env-bearer');
  });

  test('uses the local Claude OAuth bearer when env is empty and token is fresh', () => {
    writeFileSync(
      join(FAKE_HOME, '.claude', '.credentials.json'),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: 'oauth-bearer-xyz',
          expiresAt: Date.now() + 60 * 60 * 1000,
          scopes: ['user:inference'],
        },
      }),
    );
    const auth = resolveAnthropicAuth();
    expect(auth.source).toBe('claude-oauth');
    expect(auth.authToken).toBe('oauth-bearer-xyz');
  });

  test('does NOT use an expired Claude OAuth bearer', () => {
    writeFileSync(
      join(FAKE_HOME, '.claude', '.credentials.json'),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: 'stale-token',
          expiresAt: Date.now() - 1000,
        },
      }),
    );
    const auth = resolveAnthropicAuth();
    expect(auth.source).toBe('none');
  });

  test('tolerates a malformed credentials file without crashing', () => {
    writeFileSync(join(FAKE_HOME, '.claude', '.credentials.json'), '{not valid json');
    const auth = resolveAnthropicAuth();
    expect(auth.source).toBe('none');
  });

  test('tolerates the credentials file missing claudeAiOauth entirely', () => {
    writeFileSync(
      join(FAKE_HOME, '.claude', '.credentials.json'),
      JSON.stringify({someOtherProvider: {token: 'irrelevant'}}),
    );
    const auth = resolveAnthropicAuth();
    expect(auth.source).toBe('none');
  });

  test('describeAuth yields a human-readable label for every source', () => {
    expect(describeAuth({source: 'env-api-key'})).toMatch(/ANTHROPIC_API_KEY/);
    expect(describeAuth({source: 'env-auth-token'})).toMatch(/ANTHROPIC_AUTH_TOKEN/);
    expect(describeAuth({source: 'claude-oauth'})).toMatch(/Claude Code/);
    expect(describeAuth({source: 'none'})).toMatch(/no Anthropic auth/);
  });
});
