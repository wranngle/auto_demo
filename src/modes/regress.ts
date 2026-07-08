import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';

export type RegressFlowResult = {
  flow: string;
  total: number;
  passed: number;
  selectorQuality: number;
  notes?: string;
};

export type RegressReport = {
  generatedAt: string;
  flows: RegressFlowResult[];
};

export type WriteRegressArtifactsOptions = {
  outputDir: string;
  jsonFileName?: string;
  markdownFileName?: string;
};

export type WriteRegressArtifactsResult = {
  jsonPath: string;
  markdownPath: string;
};

export function buildRegressReport(flows: RegressFlowResult[], now: Date = new Date()): RegressReport {
  for (const flow of flows) {
    if (flow.total < 0 || flow.passed < 0 || flow.passed > flow.total) {
      throw new Error(`regress: invalid counts for flow ${flow.flow}`);
    }

    if (flow.selectorQuality < 0 || flow.selectorQuality > 1) {
      throw new Error(`regress: selectorQuality for ${flow.flow} must be between 0 and 1`);
    }
  }

  return {
    generatedAt: now.toISOString(),
    flows: [...flows],
  };
}

export function renderRegressMarkdown(report: RegressReport): string {
  const header = '# Regression summary\n';
  const meta = `\n_Generated ${report.generatedAt}_\n`;
  const tableHeader = '\n| flow | pass-rate | selector-quality |\n| --- | --- | --- |\n';

  if (report.flows.length === 0) {
    return `${header}${meta}\n_No flows recorded._\n`;
  }

  const rows = report.flows.map(flow => {
    const passRate = flow.total === 0 ? '0/0 (n/a)' : `${flow.passed}/${flow.total} (${formatPercent(flow.passed / flow.total)})`;
    const selectorQuality = formatPercent(flow.selectorQuality);
    return `| ${escapeCell(flow.flow)} | ${passRate} | ${selectorQuality} |`;
  });

  return `${header}${meta}${tableHeader}${rows.join('\n')}\n`;
}

export async function writeRegressArtifacts(
  report: RegressReport,
  options: WriteRegressArtifactsOptions,
): Promise<WriteRegressArtifactsResult> {
  const outputDir = resolve(options.outputDir);
  const jsonPath = join(outputDir, options.jsonFileName ?? 'regression.json');
  const markdownPath = join(outputDir, options.markdownFileName ?? 'regression-summary.md');

  await mkdir(dirname(jsonPath), {recursive: true});
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, renderRegressMarkdown(report), 'utf8');

  return {jsonPath, markdownPath};
}

function formatPercent(ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  return `${(clamped * 100).toFixed(1)}%`;
}

function escapeCell(value: string): string {
  return value.replaceAll('|', String.raw`\|`);
}
