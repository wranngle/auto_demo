import type { RecordingEvent, Viewport } from '../recording/types.js';

const HIGHLIGHT_DURATION_S = 0.8;
const HIGHLIGHT_THICKNESS = 3;
const HIGHLIGHT_PADDING = 6;
const CLICK_COLOR = 'blue@0.7';
const TYPE_COLOR = 'green@0.7';

export function buildHighlightFilters(events: RecordingEvent[], _viewport: Viewport): string[] {
  const filters: string[] = [];

  const highlightEvents = events.filter(
    (e) => (e.type === 'click' || e.type === 'type') && e.bounding_box
  );

  for (const event of highlightEvents) {
    const box = event.bounding_box!;
    const t = event.timestamp_ms / 1000;
    const color = event.type === 'click' ? CLICK_COLOR : TYPE_COLOR;

    const x = Math.max(0, Math.round(box.x - HIGHLIGHT_PADDING));
    const y = Math.max(0, Math.round(box.y - HIGHLIGHT_PADDING));
    const w = Math.round(box.width + HIGHLIGHT_PADDING * 2);
    const h = Math.round(box.height + HIGHLIGHT_PADDING * 2);

    filters.push(
      `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${color}:t=${HIGHLIGHT_THICKNESS}:enable='between(t,${t.toFixed(3)},${(t + HIGHLIGHT_DURATION_S).toFixed(3)})'`
    );
  }

  return filters;
}
