import {createMockLlmClient} from './mock-llm.js';
import type {FromUrlScript, LlmClient} from './types.js';

export type GenerateOptions = {
  url: string;
  goal: string;
  client?: LlmClient;
};

export async function generateScriptFromUrl(options: GenerateOptions): Promise<FromUrlScript> {
  const {url, goal} = options;

  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('from-url: url is required');
  }

  if (typeof goal !== 'string' || goal.length === 0) {
    throw new Error('from-url: --goal is required');
  }

  const client = options.client ?? createMockLlmClient();
  const result = await client.generateScript({url, goal});

  const script: FromUrlScript = {
    startUrl: url,
    goal,
    steps: result.steps,
  };

  if (result.name !== undefined) {
    script.name = result.name;
  }

  return script;
}

export type {FromUrlScript, FromUrlStep, LlmClient} from './types.js';
export {createMockLlmClient} from './mock-llm.js';
