#!/usr/bin/env node
/**
 * Tune the live demo agents in place (PATCH, no recreate): give each a
 * rich-markdown reply style and attach the per-scenario CLIENT tools so the real
 * agent visibly invokes them during a recording. Reads the scenario files for
 * agentId + clientTools; cloud is the source of truth.
 *
 * Run: node scripts/tune-agents.mjs [scenario-name ...]   (default: all)
 * Requires ELEVENLABS_API_KEY (env or ~/.agents/.env).
 */
import {readdir, readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {homedir} from 'node:os';

const API = 'https://api.elevenlabs.io/v1/convai/agents';
const MARKER = '\n\n[[demo-format]]';
const here = dirname(fileURLToPath(import.meta.url));
const scenarioDir = join(here, '..', 'examples', 'widget');

async function loadKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  const envPath = join(homedir(), '.agents', '.env');
  if (existsSync(envPath)) {
    const line = (await readFile(envPath, 'utf8')).split('\n').find(l => l.startsWith('ELEVENLABS_API_KEY='));
    if (line) return line.slice('ELEVENLABS_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('ELEVENLABS_API_KEY not set (env or ~/.agents/.env)');
}

function hostSlug(value) {
  return value.toLowerCase().replace(/[^a-z\d]+/g, '') || 'demo';
}

// Inline client-tool shape (ElevenLabs ConvAI): the handler runs in the page.
// `parameters` is an object JSON schema (ObjectJsonSchemaProperty), not an array.
function toClientTool(tool) {
  const properties = {};
  const required = [];
  for (const p of tool.params ?? []) {
    properties[p.name] = {type: 'string', description: p.description};
    if (p.required) required.push(p.name);
  }

  return {
    type: 'client',
    name: tool.name,
    description: tool.description,
    expects_response: true,
    response_timeout_secs: 10,
    parameters: {type: 'object', properties, required},
  };
}

function buildAddendum(scenario) {
  const host = (scenario.live.linkHosts?.[0]) ?? `${hostSlug(scenario.business.name)}.example.com`;
  const tools = scenario.live.clientTools ?? [];
  const toolLine = tools.length > 0
    ? ` You have tools: ${tools.map(t => t.name).join(', ')}. Call the relevant tool to look up or take the action BEFORE you confirm — never claim something is done without calling its tool.`
    : '';
  return `${MARKER} Reply in concise GitHub-flavored markdown: a short **bold heading**, then a bulleted list of the key details (date, party, price, status), and a clickable [confirmation link](https://${host}/ref/demo) when you confirm an action. Keep replies under 45 words.${toolLine}`;
}

async function tune(key, scenario) {
  const agentId = scenario.live?.agentId;
  if (!agentId) return `skip ${scenario.name} (no live.agentId)`;

  const getRes = await fetch(`${API}/${agentId}`, {headers: {'xi-api-key': key}});
  if (!getRes.ok) throw new Error(`get ${agentId} failed: ${getRes.status}`);
  const cur = await getRes.json();
  const prompt = cur.conversation_config?.agent?.prompt ?? {};
  const base = String(prompt.prompt ?? '').split(MARKER)[0].trimEnd();
  const tools = (scenario.live.clientTools ?? []).map(toClientTool);

  const body = {
    conversation_config: {
      agent: {
        prompt: {
          prompt: base + buildAddendum(scenario),
          llm: prompt.llm ?? 'gemini-2.5-flash',
          ...(tools.length > 0 ? {tools} : {}),
        },
      },
    },
  };

  const patchRes = await fetch(`${API}/${agentId}`, {
    method: 'PATCH',
    headers: {'xi-api-key': key, 'content-type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (!patchRes.ok) throw new Error(`patch ${scenario.name} failed: ${patchRes.status} ${await patchRes.text()}`);
  return `tuned ${scenario.name.padEnd(24)} markdown${tools.length ? ` + ${tools.length} client tools (${tools.map(t => t.name).join(', ')})` : ''}`;
}

async function main() {
  const key = await loadKey();
  const only = process.argv.slice(2);
  const files = (await readdir(scenarioDir)).filter(f => f.endsWith('.scenario.json')).sort();
  for (const file of files) {
    const scenario = JSON.parse(await readFile(join(scenarioDir, file), 'utf8'));
    if (only.length > 0 && !only.includes(scenario.name) && !only.includes(file.replace('.scenario.json', ''))) continue;
    console.log(await tune(key, scenario));
  }
}

await main();
