import { writeFileSync } from 'node:fs';
import type { RecordingEvent, EventType, BoundingBox, Viewport, TargetMeta } from './types.js';

export class EventLog {
  private events: RecordingEvent[] = [];
  private startTime: number;
  private nextId = 1;

  constructor(private filePath: string) {
    this.startTime = Date.now();
  }

  append(params: {
    type: EventType;
    description: string;
    bounding_box?: BoundingBox;
    viewport: Viewport;
    value?: string;
    url?: string;
    target_meta?: TargetMeta;
  }): RecordingEvent {
    const event: RecordingEvent = {
      id: this.nextId++,
      timestamp_ms: Date.now() - this.startTime,
      type: params.type,
      description: params.description,
      viewport: params.viewport,
      bounding_box: params.bounding_box,
      value: params.value,
      url: params.url,
      target_meta: params.target_meta,
    };
    this.events.push(event);
    return event;
  }

  getEvents(): RecordingEvent[] {
    return [...this.events];
  }

  getDurationMs(): number {
    if (this.events.length === 0) return 0;
    return this.events[this.events.length - 1]!.timestamp_ms;
  }

  flush(): void {
    writeFileSync(this.filePath, JSON.stringify(this.events, null, 2));
  }
}
