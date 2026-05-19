import type {DemoAction} from '../types.js';

export type FromUrlStep = {
  selector: string;
  action: DemoAction;
  narration: string;
  value?: string;
};

export type FromUrlScript = {
  name?: string;
  startUrl: string;
  goal: string;
  steps: FromUrlStep[];
};

export type LlmClient = {
  generateScript(input: {url: string; goal: string}): Promise<{
    name?: string;
    steps: FromUrlStep[];
  }>;
};
