import {mkdtemp, readFile, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, test} from 'vitest';
import {
  buildRegressReport,
  renderRegressMarkdown,
  writeRegressArtifacts,
  type RegressFlowResult,
} from '../src/modes/regress.js';

const fixtureFlows: RegressFlowResult[] = [
  {flow: 'console-overview', total: 10, passed: 9, selectorQuality: 0.92},
  {flow: 'opportunity-review', total: 4, passed: 4, selectorQuality: 0.81},
];

describe('regress mode artifacts', () => {
  test('writes both regression.json and regression-summary.md', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'regress-test-'));
    const report = buildRegressReport(fixtureFlows, new Date('2026-05-14T00:00:00Z'));

    const result = await writeRegressArtifacts(report, {outputDir});

    const jsonStat = await stat(result.jsonPath);
    const mdStat = await stat(result.markdownPath);
    expect(jsonStat.isFile()).toBe(true);
    expect(mdStat.isFile()).toBe(true);

    const jsonContent = JSON.parse(await readFile(result.jsonPath, 'utf8'));
    expect(jsonContent.flows).toHaveLength(2);
    expect(jsonContent.generatedAt).toBe('2026-05-14T00:00:00.000Z');
  });

  test('markdown contains the required header columns and per-flow rows', async () => {
    const report = buildRegressReport(fixtureFlows, new Date('2026-05-14T00:00:00Z'));
    const markdown = renderRegressMarkdown(report);

    expect(markdown).toMatch(/^# Regression summary/);
    expect(markdown).toContain('| flow | pass-rate | selector-quality |');
    expect(markdown).toContain('| --- | --- | --- |');
    expect(markdown).toContain('console-overview');
    expect(markdown).toContain('9/10 (90.0%)');
    expect(markdown).toContain('92.0%');
    expect(markdown).toContain('opportunity-review');
    expect(markdown).toContain('4/4 (100.0%)');
  });

  test('parses as a stable two-column markdown table', () => {
    const report = buildRegressReport(fixtureFlows);
    const markdown = renderRegressMarkdown(report);
    const lines = markdown.split('\n').filter(line => line.startsWith('|'));

    expect(lines).toHaveLength(2 + fixtureFlows.length);
    for (const line of lines) {
      const cells = line.split('|').slice(1, -1);
      expect(cells).toHaveLength(3);
    }
  });

  test('rejects invalid pass counts and out-of-range selector quality', () => {
    expect(() => buildRegressReport([{flow: 'bad', total: 2, passed: 5, selectorQuality: 0.5}])).toThrow(/invalid counts/);
    expect(() => buildRegressReport([{flow: 'bad', total: 2, passed: 1, selectorQuality: 1.4}])).toThrow(/selectorQuality/);
  });

  test('handles an empty flow set without emitting a malformed table', () => {
    const report = buildRegressReport([], new Date('2026-05-14T00:00:00Z'));
    const markdown = renderRegressMarkdown(report);

    expect(markdown).toContain('No flows recorded');
    expect(markdown).not.toContain('| --- |');
  });
});
