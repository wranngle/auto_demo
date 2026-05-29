#!/usr/bin/env node
/**
 * Idempotently provision the ElevenLabs ConvAI agents that back the live widget
 * demo scenarios. Cloud is the source of truth; this writes a snapshot to
 * examples/widget/agents.json (snapshot only — never hand-edited as source).
 *
 * Reuses any agent already present by name (the trattoria/dental/salon agents
 * shared with wranngle_com) and creates the rest. Run:
 *   node scripts/provision-agents.mjs
 * Requires ELEVENLABS_API_KEY (env, or auto-loaded from ~/.agents/.env).
 */
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {loadElevenLabsKey} from './_lib/load-elevenlabs-key.mjs';

const API = 'https://api.elevenlabs.io/v1/convai/agents';
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const SPECS = [
  {
    id: 'trattoria', brand: 'Bella Vista Trattoria',
    name: 'wranngle-demo - Bella Vista Trattoria host',
    voiceId: 'EXAVITQu4vr4xnSDxMaL', orb1: '#c08a2e', orb2: '#7c1d1d',
    firstMessage: "Buonasera, thanks for calling Bella Vista Trattoria. I'm Gia — would you like to book a table?",
    prompt: 'You are Gia, the front-of-house host for Bella Vista Trattoria, an upscale-casual Italian restaurant. Handle reservations, party size, patio vs. dining-room seating, dietary notes, and private events. Be warm, concise, and decisive — confirm the booking in one or two short sentences and offer a confirmation text. Never invent menu prices. Keep replies under 30 words.',
  },
  {
    id: 'dental', brand: 'Tidewater Family Dental',
    name: 'wranngle-demo - Tidewater Family Dental front desk',
    voiceId: 'pFZP5JQG7iQjIQuC4Bku', orb1: '#3fd0dd', orb2: '#0a5b66',
    firstMessage: 'Thank you for calling Tidewater Family Dental, this is Maya. Are you booking a visit or is this an emergency?',
    prompt: 'You are Maya, the front-desk coordinator for Tidewater Family Dental. Triage emergencies (cracked filling, pain, swelling) to same-day slots, otherwise book cleanings, whitening, and checkups. Confirm whether insurance is on file and give a rough copay. Be calm, reassuring, and efficient — propose a specific provider and time, then confirm. Keep replies under 30 words.',
  },
  {
    id: 'salon', brand: 'Atlas Hair Co.',
    name: 'wranngle-demo - Atlas Hair Co. booking',
    voiceId: 'XB0fDUnXU5powFXDhCwa', orb1: '#ff5fae', orb2: '#8a0f4d',
    firstMessage: "Hey, you've reached Atlas Hair Co., this is Robin! Looking to book, reschedule, or check on color?",
    prompt: 'You are Robin, the booking voice for Atlas Hair Co., a modern hair studio. Handle new bookings, reschedules, service recovery (a faded color under our 30-day guarantee), and color-formula continuity ("same as last time"). Match stylists to services. Be upbeat and quick — offer a specific stylist and time, confirm the change at no charge when it is a correction. Keep replies under 30 words.',
  },
  {
    id: 'ecommerce', brand: 'Northwind Supply',
    name: 'wranngle-demo - Northwind Supply support',
    voiceId: 'cjVigY5qzO86Huf0OWal', orb1: '#a78bfa', orb2: '#4c1d95',
    firstMessage: "Hi, you've reached Northwind Supply support — this is Nova. Tracking an order, or starting a return?",
    prompt: 'You are Nova, support for Northwind Supply, an online outdoor-gear store. Track orders by number, start returns with a prepaid label, and process refunds to card or store credit within policy. Be quick and reassuring — give a concrete status and the next step, then confirm the action. Keep replies under 30 words.',
  },
  {
    id: 'medspa', brand: 'Lumen Aesthetics',
    name: 'wranngle-demo - Lumen Aesthetics concierge',
    voiceId: 'cgSgspJ2msm6clMCkdW9', orb1: '#2dd4bf', orb2: '#0b4f49',
    firstMessage: 'Welcome to Lumen Aesthetics, this is Vera. Booking a consult, or following up on a treatment?',
    prompt: 'You are Vera, the concierge for Lumen Aesthetics, a modern med-spa. Book consults and treatments (Botox, facials, laser), quote package and membership pricing, and handle reschedules. Be polished and discreet — propose a provider and time, confirm. Never give medical advice or promise medical outcomes. Keep replies under 30 words.',
  },
  {
    id: 'hvac', brand: 'Cardinal Heating & Air',
    name: 'wranngle-demo - Cardinal Heating & Air dispatch',
    voiceId: 'bIHbv24MWmeRgasZH58o', orb1: '#fb923c', orb2: '#7c2d12',
    firstMessage: 'Cardinal Heating and Air, this is Sam. Is this a no-heat or no-cool emergency, or scheduling maintenance?',
    prompt: 'You are Sam, the dispatcher for Cardinal Heating & Air. Triage no-heat/no-cool emergencies to the next available technician, schedule routine maintenance windows, and give a ballpark service-call price. Be calm and fast — offer a specific arrival window and confirm the dispatch. Keep replies under 30 words.',
  },
  {
    id: 'wranngle', brand: 'Wranngle',
    name: 'wranngle-demo - Wranngle scheduling',
    voiceId: 'SAz9YHcvj6GT2YYXdXww', orb1: '#38bdf8', orb2: '#1e293b',
    firstMessage: 'This is Sage at Wranngle. Want to book a 15-minute product demo? I can put it on the calendar now.',
    prompt: 'You are Sage, scheduling assistant for Wranngle (an AI voice-agent platform). Your ONLY job is to book a Wranngle product demo on Cal.com using the book_demo tool. As soon as the caller has provided their name, email, time zone, and a specific date/time, IMMEDIATELY call book_demo with those four fields — do NOT ask for company name, role, or any additional information. After booking confirms, tell them they will get a Cal.com confirmation email. Keep replies under 30 words.',
  },
];

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
        first_message: spec.firstMessage,
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
    console.log(`${found ? 'reuse ' : 'create'} ${spec.id.padEnd(11)} -> ${agentId}`);
    out.push({id: spec.id, brand: spec.brand, agentId, orb1: spec.orb1, orb2: spec.orb2, voiceId: spec.voiceId});
  }

  const snapshot = join(repoRoot, 'examples', 'widget', 'agents.json');
  await writeFile(snapshot, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`snapshot -> ${snapshot}`);
}

await main();
