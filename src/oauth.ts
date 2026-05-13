import {readFileSync, existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

const CLAUDE_CREDENTIALS = join(homedir(), '.claude', '.credentials.json');

export interface AnthropicAuth {
  authToken?: string;
  apiKey?: string;
  source: 'env-api-key' | 'env-auth-token' | 'claude-oauth' | 'none';
}

export function resolveAnthropicAuth(): AnthropicAuth {
  if (process.env['ANTHROPIC_API_KEY']) {
    return {apiKey: process.env['ANTHROPIC_API_KEY'], source: 'env-api-key'};
  }

  if (process.env['ANTHROPIC_AUTH_TOKEN']) {
    return {authToken: process.env['ANTHROPIC_AUTH_TOKEN'], source: 'env-auth-token'};
  }

  if (existsSync(CLAUDE_CREDENTIALS)) {
    try {
      const raw = JSON.parse(readFileSync(CLAUDE_CREDENTIALS, 'utf8')) as {
        claudeAiOauth?: {accessToken?: string; expiresAt?: number; scopes?: string[]};
      };
      const oauth = raw.claudeAiOauth;
      if (oauth?.accessToken && oauth.expiresAt && oauth.expiresAt > Date.now()) {
        return {authToken: oauth.accessToken, source: 'claude-oauth'};
      }
    } catch {
      // fall through
    }
  }

  return {source: 'none'};
}

export function describeAuth(auth: AnthropicAuth): string {
  switch (auth.source) {
    case 'env-api-key':
      return 'ANTHROPIC_API_KEY (env)';
    case 'env-auth-token':
      return 'ANTHROPIC_AUTH_TOKEN (env)';
    case 'claude-oauth':
      return '~/.claude OAuth bearer (Claude Code subscription)';
    case 'none':
      return 'no Anthropic auth available';
  }
}
