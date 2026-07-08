import type {ViewportSize} from '../types.js';

export type ToolBeat = {
  tool: string;
  args?: Record<string, unknown>;
  result: string;
};

export type ActionBeat = {
  type: 'toast' | 'summary';
  text: string;
};

// One step inside an agent's scripted reply, played in order: a spoken line, a
// tool invocation card, or a visible action on the host page.
export type ReplyBeat
  = | {say: string}
    | ToolBeat
    | {do: ActionBeat};

export type ScenarioTurn = {
  user: string;
  caption?: string;
  reply: ReplyBeat[];
};

export type ScenarioBusiness = {
  name: string;
  tagline: string;
  accent: string;
  vertical?: string;
};

export type ScenarioAgent = {
  name: string;
  greeting: string;
  subtitle?: string;
};

// Present → "live" mode: the page embeds the real <elevenlabs-convai> widget
// bound to this ElevenLabs agent and the recorder drives a real conversation.
// Absent → "mock" mode: the deterministic scripted widget plays the reply beats.
export type ScenarioClientToolParameter = {
  name: string;
  description: string;
  required?: boolean;
};

// A browser-side tool the real agent can invoke during the recording. The agent's
// LLM decides to call it; the handler runs in the page and returns `result` (no
// backend), which the agent then speaks — a visible, deterministic tool call.
export type ScenarioClientTool = {
  name: string;
  description: string;
  params?: ScenarioClientToolParameter[];
  result: unknown;
};

export type ScenarioBranding = {
  mainLabel?: string;
  startCall?: string;
};

export type ScenarioLiveWidget = {
  agentId: string;
  orb1?: string;
  orb2?: string;
  /** URL for the widget's avatar image (replaces the orb when set). */
  avatarImage?: string;
  replyWaitMs?: number;
  branding?: ScenarioBranding;
  linkHosts?: string[];
  clientTools?: ScenarioClientTool[];
  // Existing ElevenLabs workspace tool ids to attach via prompt.tool_ids (e.g. the
  // native cal.com `book_demo` webhook). These take REAL actions when invoked —
  // real Cal.com bookings, real SMS — so attach only where that's the intent.
  workspaceToolIds?: string[];
};

export type WidgetScenario = {
  name: string;
  business: ScenarioBusiness;
  agent: ScenarioAgent;
  capability?: string;
  intro?: string;
  outro?: string;
  viewport?: ViewportSize;
  live?: ScenarioLiveWidget;
  turns: ScenarioTurn[];
};

export type WidgetBuildResult = {
  name: string;
  mode: 'mock' | 'live';
  htmlPath: string;
  flowPath: string;
  turnCount: number;
  toolCount: number;
  recording?: {
    videoPath?: string;
    manifestPath: string;
  };
};

export const isSayBeat = (beat: ReplyBeat): beat is {say: string} =>
  Object.hasOwn(beat, 'say');
