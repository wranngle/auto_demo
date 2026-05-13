import type { RecordingEvent } from '../recording/types.js';

export interface Segment {
  start_s: number;
  end_s: number;
}

const BUFFER_BEFORE_S = 0.8;
const BUFFER_AFTER_S = 1.5;
const MIN_GAP_TO_TRIM_S = 3.0;

/**
 * Compute active segments from events, merging overlaps.
 * Any gap longer than MIN_GAP_TO_TRIM_S gets trimmed down.
 */
export function computeActiveSegments(
  events: RecordingEvent[],
  videoDuration_s: number
): Segment[] {
  if (events.length === 0) return [{ start_s: 0, end_s: videoDuration_s }];

  // Build raw segments around each event
  const raw: Segment[] = events.map((e) => ({
    start_s: Math.max(0, e.timestamp_ms / 1000 - BUFFER_BEFORE_S),
    end_s: Math.min(videoDuration_s, e.timestamp_ms / 1000 + BUFFER_AFTER_S),
  }));

  // Merge overlapping / close segments
  raw.sort((a, b) => a.start_s - b.start_s);
  const merged: Segment[] = [raw[0]!];

  for (let i = 1; i < raw.length; i++) {
    const prev = merged[merged.length - 1]!;
    const curr = raw[i]!;

    // If gap between segments is small, keep it continuous
    if (curr.start_s - prev.end_s < MIN_GAP_TO_TRIM_S) {
      prev.end_s = Math.max(prev.end_s, curr.end_s);
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}

/**
 * Build FFmpeg select + setpts filter to keep only active segments.
 */
export function buildTrimFilter(segments: Segment[]): string {
  if (segments.length === 0) return '';

  const selectParts = segments.map(
    (s) => `between(t,${s.start_s.toFixed(3)},${s.end_s.toFixed(3)})`
  );

  return `select='${selectParts.join('+')}',setpts=N/FRAME_RATE/TB`;
}

/**
 * Estimate the trimmed duration.
 */
export function estimateTrimmedDuration(segments: Segment[]): number {
  return segments.reduce((sum, s) => sum + (s.end_s - s.start_s), 0);
}
