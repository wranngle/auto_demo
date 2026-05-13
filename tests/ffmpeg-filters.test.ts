// Gap #4 in ROAST.md — ffmpeg filter expressions are stringly-typed and
// previously had zero coverage. These snapshot tests catch regressions in
// the strings we hand to ffmpeg before they make it into a recording.
import {describe, expect, test} from 'vitest';
import {buildCursorOverlay} from '../src/video/cursor.js';
import {generateZoomKeyframes, buildZoomFilterExpr} from '../src/video/zoom.js';
import {buildHighlightFilters} from '../src/video/highlight.js';
import {buildAnnotationFilters} from '../src/video/annotations.js';
import {buildFullFilterComplex} from '../src/video/compose.js';
import type {RecordingEvent} from '../src/recording/types.js';

const viewport = {width: 1280, height: 720};

function evt(partial: Partial<RecordingEvent> & {timestamp_ms: number; type: RecordingEvent['type']}): RecordingEvent {
  return {
    id: partial.timestamp_ms,
    description: '',
    viewport,
    ...partial,
  };
}

const fixtureEvents: RecordingEvent[] = [
  evt({timestamp_ms: 1500, type: 'click', bounding_box: {x: 100, y: 80, width: 120, height: 40}}),
  evt({timestamp_ms: 3500, type: 'type', value: 'voice automation', bounding_box: {x: 400, y: 200, width: 240, height: 36}}),
  evt({timestamp_ms: 7200, type: 'click', bounding_box: {x: 900, y: 300, width: 80, height: 30}}),
];

describe('cursor overlay filter', () => {
  test('emits a position-animated overlay or null when no events have bounding boxes', () => {
    const result = buildCursorOverlay(fixtureEvents, viewport);
    expect(result).not.toBeNull();
    expect(result!.overlay).toMatch(/^x='.+':y='.+':shortest=1$/);
    expect(result!.inputFilter).toBe('format=rgba,loop=-1:size=1:start=0');
  });

  test('returns null when there are zero events with bounding boxes', () => {
    const result = buildCursorOverlay(
      [evt({timestamp_ms: 1000, type: 'wait'})],
      viewport,
    );
    expect(result).toBeNull();
  });

  test('cursor overlay uses ffmpeg expression registers for bezier smoothing', () => {
    // The smoothstep encoding stores (t-t0)/dur in register 0 then squares it.
    const result = buildCursorOverlay(fixtureEvents, viewport)!;
    expect(result.overlay).toMatch(/st\(0,/);
    expect(result.overlay).toMatch(/st\(1,ld\(0\)\*ld\(0\)\*\(3-2\*ld\(0\)\)\)/);
  });
});

describe('zoom filter', () => {
  test('generates keyframes around clickable events and emits a zoompan expression', () => {
    const kfs = generateZoomKeyframes(fixtureEvents, viewport);
    expect(kfs.length).toBeGreaterThan(2);
    const expr = buildZoomFilterExpr(kfs, viewport);
    expect(expr).toMatch(/^zoompan=z='/);
    expect(expr).toContain(`s=${viewport.width}x${viewport.height}`);
    expect(expr).toContain('fps=25');
  });

  test('returns empty string when there are no keyframes', () => {
    expect(buildZoomFilterExpr([], viewport)).toBe('');
  });
});

describe('highlight filter', () => {
  test('one drawbox per click/type, enabled around the event timestamp', () => {
    const filters = buildHighlightFilters(fixtureEvents, viewport);
    expect(filters).toHaveLength(3);
    expect(filters[0]).toMatch(/drawbox=x=94:y=74:w=132:h=52:color=blue@0\.7:t=3:enable='between\(t,1\.500,2\.300\)'/);
    expect(filters[1]).toMatch(/color=green@0\.7/); // type → green
  });
});

describe('annotation filters', () => {
  test('callout produces drawbox + drawtext at the anchor', () => {
    const filters = buildAnnotationFilters([
      {kind: 'callout', x: 200, y: 300, text: 'Click here', startS: 1, durationS: 2},
    ]);
    expect(filters.some((f) => f.startsWith('drawbox') && f.includes('color=black@0.7'))).toBe(true);
    expect(filters.some((f) => f.startsWith('drawtext') && f.includes("text='Click here'"))).toBe(true);
    for (const f of filters) {
      expect(f).toContain("enable='between(t,1.000,3.000)'");
    }
  });

  test('arrow produces three drawbox calls (shaft + shaft + head) + optional label', () => {
    const filters = buildAnnotationFilters([
      {kind: 'arrow', x: 500, y: 400, text: 'Look here', startS: 0, durationS: 1.5},
    ]);
    const drawboxes = filters.filter((f) => f.startsWith('drawbox'));
    expect(drawboxes).toHaveLength(3);
    expect(filters.find((f) => f.startsWith('drawtext'))).toMatch(/text='Look here'/);
  });

  test('box produces one outline drawbox + optional label below', () => {
    const filters = buildAnnotationFilters([
      {kind: 'box', x: 100, y: 100, text: 'Important', startS: 5, durationS: 1, color: 'red'},
    ]);
    expect(filters.length).toBeGreaterThanOrEqual(2);
    expect(filters[0]).toContain('color=red');
  });

  test('escape: single quotes and colons in text are escaped', () => {
    const [filter] = buildAnnotationFilters([
      {kind: 'callout', x: 0, y: 0, text: "it's at 12:00", startS: 0, durationS: 1},
    ]);
    void filter;
    // We just need to assert no thrown error and that the resulting filter contains escaped chars.
    const all = buildAnnotationFilters([
      {kind: 'callout', x: 0, y: 0, text: "it's at 12:00", startS: 0, durationS: 1},
    ]).join('|');
    expect(all).toContain("it\\'s at 12\\:00");
  });

  test('returns an empty array when given no annotations', () => {
    expect(buildAnnotationFilters([])).toEqual([]);
  });
});

describe('full filter complex composition', () => {
  test('chains cursor → annotation → zoom in that order', () => {
    const result = buildFullFilterComplex(
      fixtureEvents,
      viewport,
      {
        rawVideoPath: '/tmp/raw.webm',
        events: fixtureEvents,
        outputPath: '/tmp/composed.mp4',
        viewport,
        cursor: true,
        highlight: false,
        zoom: true,
        annotations: [{kind: 'callout', x: 200, y: 200, text: 'x', startS: 1, durationS: 1}],
      },
    );
    // cursor inserts a [with_cursor] tag; annotation chain reads from [with_cursor]
    // and produces [annotated]; zoom reads from [annotated] → [zoomed].
    expect(result.filterComplex).toMatch(/\[with_cursor\][^;]+\[annotated\]/);
    expect(result.filterComplex).toMatch(/\[annotated\][^;]+\[zoomed\]/);
    expect(result.outputLabel).toBe('zoomed');
  });

  test('returns the bare video label when no effects are requested', () => {
    const result = buildFullFilterComplex(
      [],
      viewport,
      {
        rawVideoPath: '/tmp/raw.webm',
        events: [],
        outputPath: '/tmp/composed.mp4',
        viewport,
        cursor: false,
        highlight: false,
        zoom: false,
      },
    );
    expect(result.filterComplex).toBe('');
    expect(result.outputLabel).toBe('0:v');
  });
});
