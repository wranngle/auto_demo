/**
 * Shared base URLs for the ElevenLabs ConvAI API. Imported by
 * provision-agents.mjs (POST /create, GET ?page_size=N) and
 * tune-agents.mjs (GET/PATCH /{id}, workspace-tool preflight GETs).
 * Centralized here so a host change (e.g. eu-region rollout) only
 * requires one edit.
 */
export const ELEVENLABS_AGENTS_API = 'https://api.elevenlabs.io/v1/convai/agents';
export const ELEVENLABS_TOOLS_API = 'https://api.elevenlabs.io/v1/convai/tools';
