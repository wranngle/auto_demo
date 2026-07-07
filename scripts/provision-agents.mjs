#!/usr/bin/env node
/**
 * Idempotently provision the ElevenLabs ConvAI agents that back the live widget
 * demo scenarios. Cloud is the source of truth; this writes a snapshot to
 * examples/widget/agents.json (snapshot only — never hand-edited as source)
 * AND syncs each freshly minted agent_id back into its scenario file's
 * live.agentId, so a re-provision after workspace loss cannot strand the
 * scenarios (and their drift tests) on dead ids.
 *
 * Each agent's first_message is read from its scenario's agent.greeting —
 * the scenario file is the single source for what the agent opens with.
 *
 * Reuses any agent already present by name (the trattoria/dental/salon agents
 * shared with wranngle_com) and creates the rest. Run:
 *   node scripts/provision-agents.mjs
 * Requires ELEVENLABS_API_KEY (env, or auto-loaded from ~/.agents/.env).
 */
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {loadElevenLabsKey} from './_lib/load-elevenlabs-key.mjs';
import {ELEVENLABS_AGENTS_API as API} from './_lib/elevenlabs-api.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const scenarioDir = join(repoRoot, 'examples', 'widget');

const SPECS = [
  {
    id: 'trattoria', brand: 'Bella Vista Trattoria', scenario: 'restaurant-trattoria',
    name: 'wranngle-demo - Bella Vista Trattoria host',
    voiceId: 'EXAVITQu4vr4xnSDxMaL', orb1: '#c08a2e', orb2: '#7c1d1d',
    prompt: 'You are Gia, the front-of-house host for Bella Vista Trattoria, an upscale-casual Italian restaurant. Handle reservations, party size, patio vs. dining-room seating, dietary notes, and private events. Be warm, concise, and decisive — confirm the booking in one or two short sentences and offer a confirmation text. Never invent menu prices. Keep replies under 30 words.',
  },
  {
    id: 'dental', brand: 'Tidewater Family Dental', scenario: 'dental-emergency',
    name: 'wranngle-demo - Tidewater Family Dental front desk',
    voiceId: 'pFZP5JQG7iQjIQuC4Bku', orb1: '#3fd0dd', orb2: '#0a5b66',
    prompt: 'You are Maya, the front-desk coordinator for Tidewater Family Dental. Triage emergencies (cracked filling, pain, swelling) to same-day slots, otherwise book cleanings, whitening, and checkups. Confirm whether insurance is on file and give a rough copay. Be calm, reassuring, and efficient — propose a specific provider and time, then confirm. Keep replies under 30 words.',
  },
  {
    id: 'salon', brand: 'Atlas Hair Co.', scenario: 'salon-recovery',
    name: 'wranngle-demo - Atlas Hair Co. booking',
    voiceId: 'XB0fDUnXU5powFXDhCwa', orb1: '#ff5fae', orb2: '#8a0f4d',
    prompt: 'You are Robin, the booking voice for Atlas Hair Co., a modern hair studio. Handle new bookings, reschedules, service recovery (a faded color under our 30-day guarantee), and color-formula continuity ("same as last time"). Match stylists to services. Be upbeat and quick — offer a specific stylist and time, confirm the change at no charge when it is a correction. Keep replies under 30 words.',
  },
  {
    id: 'ecommerce', brand: 'Northwind Supply', scenario: 'ecommerce-returns',
    name: 'wranngle-demo - Northwind Supply support',
    voiceId: 'cjVigY5qzO86Huf0OWal', orb1: '#a78bfa', orb2: '#4c1d95',
    prompt: 'You are Nova, support for Northwind Supply, an online outdoor-gear store. Track orders by number, start returns with a prepaid label, and process refunds to card or store credit within policy. Be quick and reassuring — give a concrete status and the next step, then confirm the action. Keep replies under 30 words.',
  },
  {
    id: 'medspa', brand: 'Lumen Aesthetics', scenario: 'medspa-consult',
    name: 'wranngle-demo - Lumen Aesthetics concierge',
    voiceId: 'cgSgspJ2msm6clMCkdW9', orb1: '#2dd4bf', orb2: '#0b4f49',
    prompt: 'You are Vera, the concierge for Lumen Aesthetics, a modern med-spa. Book consults and treatments (Botox, facials, laser), quote package and membership pricing, and handle reschedules. Be polished and discreet — propose a provider and time, confirm. Never give medical advice or promise medical outcomes. Keep replies under 30 words.',
  },
  {
    id: 'hvac', brand: 'Cardinal Heating & Air', scenario: 'hvac-dispatch',
    name: 'wranngle-demo - Cardinal Heating & Air dispatch',
    voiceId: 'bIHbv24MWmeRgasZH58o', orb1: '#fb923c', orb2: '#7c2d12',
    prompt: 'You are Sam, the dispatcher for Cardinal Heating & Air. Triage no-heat/no-cool emergencies to the next available technician, schedule routine maintenance windows, and give a ballpark service-call price. Be calm and fast — offer a specific arrival window and confirm the dispatch. Keep replies under 30 words.',
  },
  {
    id: 'wranngle', brand: 'Wranngle', scenario: 'wranngle-scheduling',
    name: 'wranngle-demo - Wranngle scheduling',
    voiceId: 'SAz9YHcvj6GT2YYXdXww', orb1: '#38bdf8', orb2: '#1e293b',
    prompt: 'You are Sage, scheduling assistant for Wranngle (an AI voice-agent platform). Your ONLY job is to book a Wranngle product demo on Cal.com using the book_demo tool. As soon as the caller has provided their name, email, time zone, and a specific date/time, IMMEDIATELY call book_demo with those four fields — do NOT ask for company name, role, or any additional information. After booking confirms, tell them they will get a Cal.com confirmation email. Keep replies under 30 words.',
  },
];

// The scenario file is the single source for the agent's opening line: the
// mock widget renders agent.greeting verbatim, so the live agent must open
// with the same words or the two modes drift apart.
async function loadGreeting(spec) {
  const raw = await readFile(join(scenarioDir, `${spec.scenario}.scenario.json`), 'utf8');
  const greeting = JSON.parse(raw)?.agent?.greeting;
  if (typeof greeting !== 'string' || greeting.length === 0) {
    throw new Error(`${spec.scenario}.scenario.json has no agent.greeting`);
  }
  return greeting;
}

// Format-preserving update of live.agentId in a scenario file: targeted
// string replacement instead of re-serialization, so the hand-formatted
// JSON (compact orb/branding lines) keeps its exact shape.
async function syncScenarioAgentId(spec, agentId) {
  const path = join(scenarioDir, `${spec.scenario}.scenario.json`);
  const raw = await readFile(path, 'utf8');
  const current = JSON.parse(raw)?.live?.agentId;
  if (current === undefined || current === agentId) return false;
  const updated = raw.replace(`"agentId": "${current}"`, `"agentId": "${agentId}"`);
  if (updated === raw) {
    throw new Error(`could not sync live.agentId in ${path} (pattern not found)`);
  }
  await writeFile(path, updated);
  return true;
}

async function listExisting(key) {
  const res = await fetch(`${API}?page_size=100`, {headers: {'xi-api-key': key}});
  if (!res.ok) throw new Error(`list agents failed: ${res.status}`);
  const data = await res.json();
  return new Map((data.agents ?? []).map(a => [a.name, a.agent_id]));
}

async function createAgent(key, spec) {
  const body = {
    name: spec.name,
    conversation_config: {
      agent: {
        first_message: await loadGreeting(spec),
        language: 'en',
        prompt: {prompt: spec.prompt, llm: 'gemini-2.5-flash'},
      },
      tts: {voice_id: spec.voiceId},
    },
    platform_settings: {overrides: {conversation_config_override: {conversation: {text_only: true}}}},
    tags: ['wranngle-demo', 'ui-demo-runner-suite'],
  };
  const res = await fetch(`${API}/create`, {
    method: 'POST',
    headers: {'xi-api-key': key, 'content-type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`create ${spec.id} failed: ${res.status} ${await res.text()}`);
  return (await res.json()).agent_id;
}

async function main() {
  const key = await loadElevenLabsKey();
  const existing = await listExisting(key);
  const out = [];
  for (const spec of SPECS) {
    const found = existing.get(spec.name);
    const agentId = found ?? await createAgent(key, spec);
    const synced = await syncScenarioAgentId(spec, agentId);
    console.log(`${found ? 'reuse ' : 'create'} ${spec.id.padEnd(11)} -> ${agentId}${synced ? `  (synced ${spec.scenario}.scenario.json)` : ''}`);
    out.push({id: spec.id, brand: spec.brand, agentId, orb1: spec.orb1, orb2: spec.orb2, voiceId: spec.voiceId});
  }

  const snapshot = join(repoRoot, 'examples', 'widget', 'agents.json');
  await writeFile(snapshot, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`snapshot -> ${snapshot}`);
}

await main();
