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
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {loadElevenLabsKey} from './_lib/load-elevenlabs-key.mjs';
import {ELEVENLABS_AGENTS_API as API, ELEVENLABS_TOOLS_API as TOOLS_API} from './_lib/elevenlabs-api.mjs';

const MARKER = '\n\n[[demo-format]]';
const here = dirname(fileURLToPath(import.meta.url));
const scenarioDir = join(here, '..', 'examples', 'widget');

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
  // Preflight workspace tool ids: a scenario can outlive a workspace tool
  // (e.g. the Cal.com book_demo webhook after a workspace wipe). Attaching a
  // dead id would 4xx the whole PATCH, so drop missing tools with a loud
  // warning and still tune the rest of the agent.
  const workspaceIds = [];
  for (const toolId of scenario.live.workspaceToolIds ?? []) {
    const toolRes = await fetch(`${TOOLS_API}/${toolId}`, {headers: {'xi-api-key': key}});
    if (toolRes.ok) {
      workspaceIds.push(toolId);
    } else {
      console.error(`!! ${scenario.name}: workspace tool ${toolId} not found (${toolRes.status}) — skipping attachment; recreate it and re-run`);
    }
  }
  // The ConvAI API rejects sending both `tools` (inline) and `tool_ids` in one
  // PATCH ("both_tools_and_tool_ids_provided"). Inline client-tool PATCHes
  // auto-promote to standalone tools whose ids appear in prompt.tool_ids on the
  // next GET. So when workspace tool_ids are added, we merge with whatever the
  // agent already has and send tool_ids ONLY (preserving the earlier client
  // tools by id); otherwise send the inline `tools` to create/replace them.
  const promptBody = {
    prompt: base + buildAddendum(scenario),
    llm: prompt.llm ?? 'gemini-2.5-flash',
  };
  if (workspaceIds.length > 0) {
    const existing = Array.isArray(prompt.tool_ids) ? prompt.tool_ids : [];
    promptBody.tool_ids = Array.from(new Set([...existing, ...workspaceIds]));
  } else if (tools.length > 0) {
    promptBody.tools = tools;
  }

  // Per-business widget branding (agent-level platform_settings.widget.text_contents).
  // The in-chat header is `chatting_status` — the widget-tag `text-contents` attribute
  // does NOT override it; this server-side path does. A focused subset keeps the
  // default UX everywhere else.
  const ag = scenario.agent;
  const biz = scenario.business;
  const branding = scenario.live.branding ?? {};
  const widgetText = {
    main_label: branding.mainLabel ?? biz.name,
    start_call: branding.startCall ?? `Talk to ${ag.name}`,
    start_chat: `Chat with ${ag.name}`,
    chatting_status: `Chatting with ${ag.name}`,
    listening_status: 'Listening…',
    speaking_status: `${ag.name} is replying…`,
    connecting_status: `Connecting to ${ag.name}…`,
    input_placeholder: `Message ${ag.name}…`,
  };

  const body = {
    conversation_config: {agent: {prompt: promptBody}},
    platform_settings: {widget: {text_contents: widgetText}},
  };

  const patchRes = await fetch(`${API}/${agentId}`, {
    method: 'PATCH',
    headers: {'xi-api-key': key, 'content-type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (!patchRes.ok) throw new Error(`patch ${scenario.name} failed: ${patchRes.status} ${await patchRes.text()}`);
  const toolsNote = workspaceIds.length === 0 && tools.length > 0
    ? ` + ${tools.length} inline client tools (${tools.map(t => t.name).join(', ')})`
    : '';
  const wsNote = workspaceIds.length > 0
    ? ` + tool_ids merged with ${workspaceIds.length} workspace tool(s) [${workspaceIds.join(', ')}]`
    : '';
  return `tuned ${scenario.name.padEnd(24)} markdown${toolsNote}${wsNote}`;
}

async function main() {
  const key = await loadElevenLabsKey();
  const only = process.argv.slice(2);
  const files = (await readdir(scenarioDir)).filter(f => f.endsWith('.scenario.json')).sort();
  // Per-scenario isolation (same contract as record-live-demos.mjs): one
  // agent's failure must not abort the remaining tunes.
  const ok = [];
  const failed = [];
  for (const file of files) {
    const scenario = JSON.parse(await readFile(join(scenarioDir, file), 'utf8'));
    if (only.length > 0 && !only.includes(scenario.name) && !only.includes(file.replace('.scenario.json', ''))) continue;
    try {
      console.log(await tune(key, scenario));
      ok.push(file);
    } catch (err) {
      console.error(`!! ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
      failed.push(file);
    }
  }

  console.log(`summary: ok=${ok.length} failed=${failed.length}`);
  if (failed.length > 0) {
    console.log(`failed scenarios:\n  ${failed.join('\n  ')}`);
    process.exitCode = 1;
  }
}

await main();
