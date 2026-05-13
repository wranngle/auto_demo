import type { RecordingEvent, Chapter } from './types.js';

export function deriveChapters(events: RecordingEvent[]): Chapter[] {
  if (events.length === 0) return [];

  const chapters: Chapter[] = [];
  const narrations = events.filter((e) => e.type === 'narrate');

  if (narrations.length === 0) {
    // No narrations — create one chapter per navigation event, or a single chapter
    const navigations = events.filter((e) => e.type === 'navigate');
    if (navigations.length <= 1) {
      return [
        {
          start_ms: 0,
          end_ms: events[events.length - 1]!.timestamp_ms,
          title: events[0]?.description ?? 'Recording',
        },
      ];
    }

    for (let i = 0; i < navigations.length; i++) {
      const start = navigations[i]!.timestamp_ms;
      const end =
        i < navigations.length - 1
          ? navigations[i + 1]!.timestamp_ms
          : events[events.length - 1]!.timestamp_ms;
      chapters.push({ start_ms: start, end_ms: end, title: navigations[i]!.description });
    }
    return chapters;
  }

  // Use narration events as chapter boundaries
  for (let i = 0; i < narrations.length; i++) {
    const start = narrations[i]!.timestamp_ms;
    const end =
      i < narrations.length - 1
        ? narrations[i + 1]!.timestamp_ms
        : events[events.length - 1]!.timestamp_ms;
    chapters.push({ start_ms: start, end_ms: end, title: narrations[i]!.value ?? narrations[i]!.description });
  }

  return chapters;
}
