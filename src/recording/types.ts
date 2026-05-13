export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export type EventType =
  | 'click'
  | 'type'
  | 'scroll'
  | 'hover'
  | 'navigate'
  | 'wait'
  | 'press_key'
  | 'select_option'
  | 'narrate'
  | 'done';

export interface TargetMeta {
  role?: string;
  name?: string;
  text?: string;
  selector?: string;
  index?: number;
}

export interface RecordingEvent {
  id: number;
  timestamp_ms: number;
  type: EventType;
  bounding_box?: BoundingBox;
  viewport: Viewport;
  description: string;
  value?: string;
  url?: string;
  target_meta?: TargetMeta;
}

export interface Chapter {
  start_ms: number;
  end_ms: number;
  title: string;
}

export interface AgentStats {
  total_actions: number;
  input_tokens: number;
  output_tokens: number;
}

export interface RecordingMetadata {
  id: string;
  created_at: string;
  url: string;
  prompt: string;
  model: string;
  viewport: Viewport;
  duration_ms: number;
  raw_video_path: string;
  event_log_path: string;
  chapters: Chapter[];
  agent_stats: AgentStats;
}

export interface ExportPreset {
  name: string;
  aspect_ratio: [number, number];
  width: number;
  height: number;
  format: 'mp4' | 'webm' | 'gif';
  codec: string;
  fps: number;
  max_duration_s?: number;
  max_file_size_bytes?: number;
}

export interface RecordOptions {
  url: string;
  prompt: string;
  output: string;
  viewport: Viewport;
  model: string;
  headless: boolean;
  slowMo: number;
  maxSteps: number;
}

export interface BackgroundConfig {
  gradient: string;
  padding: number;
  cornerRadius: number;
  shadow: boolean;
}

export interface ExportOptions {
  recordingDir: string;
  preset: string;
  zoom: boolean;
  highlight: boolean;
  cursor: boolean;
  output?: string;
  background?: BackgroundConfig;
}
