// Gap #5 in ROAST.md — when the bearer is rejected at /v1/messages, the user
// gets a real, actionable error, not a hang. Spins up a local HTTP server
// that masquerades as api.anthropic.com.
import {describe, expect, test} from 'vitest';
import {createServer, type Server} from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import {AddressInfo} from 'node:net';

async function withMock(
  responder: (req: any, res: any) => void,
  body: (baseURL: string) => Promise<void>,
): Promise<void> {
  const server: Server = createServer(responder);
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', res));
  const port = (server.address() as AddressInfo).port;
  try {
    await body(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((res) => server.close(() => res()));
  }
}

describe('Anthropic SDK error mapping (contract)', () => {
  test('401 from /v1/messages produces an AuthenticationError', async () => {
    await withMock(
      (_req, res) => {
        res.writeHead(401, {'content-type': 'application/json'});
        res.end(JSON.stringify({error: {type: 'authentication_error', message: 'invalid x-api-key'}}));
      },
      async (baseURL) => {
        const client = new Anthropic({apiKey: 'fake', baseURL, maxRetries: 0});
        await expect(
          client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 16,
            messages: [{role: 'user', content: 'hi'}],
          }),
        ).rejects.toMatchObject({status: 401});
      },
    );
  }, 20_000);

  test('403 from /v1/messages produces a PermissionDeniedError-equivalent (status 403)', async () => {
    await withMock(
      (_req, res) => {
        res.writeHead(403, {'content-type': 'application/json'});
        res.end(JSON.stringify({error: {type: 'permission_error', message: 'access denied'}}));
      },
      async (baseURL) => {
        const client = new Anthropic({apiKey: 'fake', baseURL, maxRetries: 0});
        await expect(
          client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 16,
            messages: [{role: 'user', content: 'hi'}],
          }),
        ).rejects.toMatchObject({status: 403});
      },
    );
  }, 20_000);

  test('429 from /v1/messages produces a RateLimitError (status 429)', async () => {
    await withMock(
      (_req, res) => {
        res.writeHead(429, {'content-type': 'application/json', 'retry-after': '1'});
        res.end(JSON.stringify({error: {type: 'rate_limit_error', message: 'slow down'}}));
      },
      async (baseURL) => {
        const client = new Anthropic({apiKey: 'fake', baseURL, maxRetries: 0});
        await expect(
          client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 16,
            messages: [{role: 'user', content: 'hi'}],
          }),
        ).rejects.toMatchObject({status: 429});
      },
    );
  }, 20_000);

  test('OAuth bearer requests include the oauth-beta header so 401s arise from auth, not the wire shape', async () => {
    let observedAuth: string | undefined;
    let observedBeta: string | undefined;
    await withMock(
      (req, res) => {
        observedAuth = req.headers['authorization'];
        observedBeta = req.headers['anthropic-beta'];
        res.writeHead(401, {'content-type': 'application/json'});
        res.end(JSON.stringify({error: {type: 'authentication_error', message: 'bad bearer'}}));
      },
      async (baseURL) => {
        const client = new Anthropic({
          authToken: 'oauth-test-bearer',
          baseURL,
          maxRetries: 0,
          defaultHeaders: {'anthropic-beta': 'oauth-2025-04-20'},
        });
        await expect(
          client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 16,
            messages: [{role: 'user', content: 'hi'}],
          }),
        ).rejects.toMatchObject({status: 401});
        expect(observedAuth).toMatch(/Bearer oauth-test-bearer/);
        expect(observedBeta).toBe('oauth-2025-04-20');
      },
    );
  }, 20_000);
});
