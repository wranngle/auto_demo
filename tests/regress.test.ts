// Gap #13 in ROAST.md — selector durability harness. The scoring function is
// pure and easy to lock down; the run path is exercised against a tiny fixture
// HTTP server.
import {describe, expect, test, beforeEach, afterEach} from 'vitest';
import {createServer, type Server} from 'node:http';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AddressInfo} from 'node:net';
import {scoreSelectors, runRegression} from '../src/commands/regress.js';
import type {DemoFlow} from '../src/types.js';

let scratch: string;
let server: Server | undefined;
let baseUrl: string;

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'auto_demo-regress-'));
  server = createServer((_req, res) => {
    res.writeHead(200, {'content-type': 'text/html'});
    res.end(`<!doctype html><html><body><button id="hit">Hit me</button></body></html>`);
  });
  await new Promise<void>((res) => server!.listen(0, '127.0.0.1', res));
  baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
});

afterEach(async () => {
  rmSync(scratch, {recursive: true, force: true});
  if (server) await new Promise<void>((res) => server!.close(() => res()));
});

describe('scoreSelectors', () => {
  test('ratio = 1.0 for a flow with only resolved selectors', () => {
    const flow: DemoFlow = {
      startUrl: '/',
      steps: [
        {action: 'click', selector: '#a'},
        {action: 'fill', selector: '#b', value: 'x'},
      ],
    };
    expect(scoreSelectors(flow).ratio).toBe(1);
  });

  test('ratio < 1 when a step is labeled TODO selector', () => {
    const flow: DemoFlow = {
      startUrl: '/',
      steps: [
        {action: 'click', selector: '#a'},
        {action: 'click', selector: '#b', label: 'TODO selector — mystery click'},
      ],
    };
    expect(scoreSelectors(flow).ratio).toBe(0.5);
  });

  test('ratio = 1 when the flow has no interaction steps', () => {
    const flow: DemoFlow = {
      startUrl: '/',
      steps: [{action: 'scroll', y: 100}, {action: 'pause', ms: 100}],
    };
    expect(scoreSelectors(flow).ratio).toBe(1);
  });
});

describe('runRegression', () => {
  test('marks a flow as not-passed when selector ratio is below threshold', async () => {
    const flow: DemoFlow = {
      name: 'low-quality',
      startUrl: `${baseUrl}/`,
      steps: [
        {action: 'click', selector: '#hit', label: 'good click'},
        {action: 'click', selector: '#x', label: 'TODO selector — bad click'},
      ],
    };
    const flowPath = join(scratch, 'low-quality.demo.json');
    writeFileSync(flowPath, JSON.stringify(flow, null, 2));

    const report = await runRegression({flows: [flowPath], threshold: 0.75, scoreOnly: true});
    expect(report.passed).toBe(false);
    expect(report.flows[0]!.passed).toBe(false);
    expect(report.flows[0]!.selectorRatio).toBe(0.5);
  });

  test('passes a good flow when running against the live fixture', async () => {
    const flow: DemoFlow = {
      name: 'good-flow',
      startUrl: `${baseUrl}/`,
      steps: [{action: 'click', selector: '#hit'}],
    };
    const flowPath = join(scratch, 'good.demo.json');
    writeFileSync(flowPath, JSON.stringify(flow, null, 2));
    const report = await runRegression({flows: [flowPath], threshold: 0.75});
    expect(report.passed).toBe(true);
    expect(report.flows[0]!.stepsFailed).toBe(0);
  }, 60_000);

  test('reports missing flow files instead of throwing', async () => {
    const report = await runRegression({flows: [join(scratch, 'nope.demo.json')], scoreOnly: true});
    expect(report.passed).toBe(false);
    expect(report.flows[0]!.failureMessages[0]).toMatch(/not found/);
  });
});
