/**
 * Shared base URL for the ElevenLabs ConvAI agents API. Imported by
 * provision-agents.mjs (POST /create, GET ?page_size=N) and
 * tune-agents.mjs (GET /{id}, PATCH /{id}). Centralized here so a host
 * change (e.g. eu-region rollout) only requires one edit.
 */
export const ELEVENLABS_AGENTS_API = 'https://api.elevenlabs.io/v1/convai/agents';
