// Tests for the pre-flight reachability check. Spins up a tiny HTTP server
// per case so we exercise real fetch behavior, not mocks.
import {describe, expect, test} from 'vitest';
import {createServer, type Server} from 'node:http';
import {preflight} from '../src/preflight.js';

async function withServer(handler: Parameters<typeof createServer>[0], fn: (port: number) => Promise<void>): Promise<void> {
  const server: Server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port as number;
  try {
    await fn(port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('preflight', () => {
  test('returns ok for a 200 response', async () => {
    await withServer((_req, res) => {
      res.writeHead(200, {'content-type': 'text/html'});
      res.end('<html></html>');
    }, async (port) => {
      const result = await preflight(`http://127.0.0.1:${port}/`);
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
    });
  });

  test('returns ok for non-2xx that is still a page (redirect, 401, etc.)', async () => {
    // Login pages and auth challenges are valid demo targets.
    await withServer((_req, res) => {
      res.writeHead(401, {'content-type': 'text/html'});
      res.end('<html>Login</html>');
    }, async (port) => {
      const result = await preflight(`http://127.0.0.1:${port}/`);
      expect(result.ok).toBe(true);
      expect(result.status).toBe(401);
    });
  });

  test('rejects 404', async () => {
    await withServer((_req, res) => {
      res.writeHead(404);
      res.end();
    }, async (port) => {
      const result = await preflight(`http://127.0.0.1:${port}/`);
      expect(result.ok).toBe(false);
      expect(result.detail).toMatch(/404/);
    });
  });

  test('rejects 500', async () => {
    await withServer((_req, res) => {
      res.writeHead(500);
      res.end();
    }, async (port) => {
      const result = await preflight(`http://127.0.0.1:${port}/`);
      expect(result.ok).toBe(false);
      expect(result.detail).toMatch(/500/);
    });
  });

  test('rejects unreachable hosts', async () => {
    // Port 1 is never listening on a normal box, ECONNREFUSED fires fast.
    const result = await preflight('http://127.0.0.1:1/', 2000);
    expect(result.ok).toBe(false);
    expect(result.detail).toBeDefined();
  });

  test('passes through non-http schemes without probing', async () => {
    expect((await preflight('file:///tmp/foo.html')).ok).toBe(true);
    expect((await preflight('./relative.html')).ok).toBe(true);
  });
});
