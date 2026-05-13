import {writeFileSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {RecordingEvent} from '../recording/types.js';
import {captureCommand, type CaptureOptions} from './capture.js';
import {eventsToFlow} from './events-to-flow.js';
import {eventsPath} from '../utils/paths.js';

export interface AuthorOptions extends CaptureOptions {
  flowName?: string;
  flowOut?: string;
}

export async function authorCommand(options: AuthorOptions): Promise<{
  flowPath: string;
  recordingDir: string;
  needsManualSelectorCount: number;
}> {
  const result = await captureCommand(options);

  const events = JSON.parse(
    readFileSync(eventsPath(result.recordingDir), 'utf8'),
  ) as RecordingEvent[];

  const flow = eventsToFlow({
    events,
    startUrl: options.url,
    viewport: options.viewport,
    flowName: options.flowName,
    prompt: options.prompt,
    model: options.model,
  });

  const flowPath = options.flowOut ?? join(result.recordingDir, 'flow.demo.json');
  writeFileSync(flowPath, JSON.stringify(flow, null, 2));

  const needsManual = flow.steps.filter((step) =>
    typeof step.label === 'string' && step.label.startsWith('TODO selector'),
  ).length;

  console.log('');
  console.log(`auto_demo author flow written`);
  console.log(`  flow:           ${flowPath}`);
  console.log(`  steps:          ${flow.steps.length}`);
  if (needsManual > 0) {
    console.log(`  needs editing:  ${needsManual} step(s) lack a stable selector — search for "TODO selector" in the flow`);
  } else {
    console.log(`  ready to replay: auto_demo run ${flowPath}`);
  }

  return {
    flowPath,
    recordingDir: result.recordingDir,
    needsManualSelectorCount: needsManual,
  };
}
