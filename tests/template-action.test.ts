import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
// @ts-expect-error -- js-yaml is a transitive dep without bundled types; runtime parse is sufficient for this template smoke.
import yaml from 'js-yaml';
import {describe, expect, test} from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const templatePath = resolve(here, '..', 'templates', 'auto-demo-on-deploy.yml.template');

type WorkflowStep = {uses?: string; run?: string; with?: Record<string, unknown>};
type WorkflowJob = {steps?: WorkflowStep[]};
type Workflow = {
  on?: {push?: {branches?: string[]}};
  jobs?: Record<string, WorkflowJob>;
};

const SECRET_PATTERN = /(api[_-]?key|token|password|secret)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i;

describe('auto-demo-on-deploy.yml.template', () => {
  const raw = readFileSync(templatePath, 'utf8');
  const parsed = yaml.load(raw) as Workflow;

  test('parses as valid YAML', () => {
    expect(parsed).toBeTypeOf('object');
    expect(parsed).not.toBeNull();
  });

  test('triggers on push to main', () => {
    expect(parsed.on?.push?.branches).toContain('main');
  });

  test('uploads artifacts via actions/upload-artifact@v4', () => {
    const steps = Object.values(parsed.jobs ?? {}).flatMap((job) => job.steps ?? []);
    const uploadStep = steps.find((step) => step.uses === 'actions/upload-artifact@v4');
    expect(uploadStep, 'no actions/upload-artifact@v4 step found').toBeDefined();
  });

  test('contains no hardcoded credential literals', () => {
    const offending = raw
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .filter((line) => !line.includes('${{'))
      .find((line) => SECRET_PATTERN.test(line));
    expect(offending, `hardcoded credential suspected on line: ${offending ?? ''}`).toBeUndefined();
  });
});
