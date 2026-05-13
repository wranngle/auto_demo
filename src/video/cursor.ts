import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { RecordingEvent, BoundingBox, Viewport } from '../recording/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function findPackageRoot(): string {
  let dir = __dirname;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    dir = dirname(dir);
  }
  return __dirname;
}

/** Path to the cursor pointer PNG asset. */
export function cursorImagePath(): string {
  return join(findPackageRoot(), 'assets', 'cursor.png');
}

// ── Timing: cursor leads the zoom ──
const TRAVEL_S = 0.7;
const ARRIVE_BEFORE_S = 1.0;

// ── Deterministic PRNG (LCG) for reproducible paths ──
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

// ── Segment types for the FFmpeg expression builder ──
type CursorSegment =
  | { type: 'hold'; t0: number; t1: number; x: number; y: number }
  | { type: 'bezier'; t0: number; t1: number; x0: number; y0: number; cp1x: number; cp1y: number; cp2x: number; cp2y: number; x1: number; y1: number }
  | { type: 'linear'; t0: number; t1: number; x0: number; y0: number; x1: number; y1: number };

/**
 * Pick a landing point within a bounding box — not the exact center.
 * Offset is subtle: up to +/-min(10, dimension/4) px from center.
 */
function landingPoint(bbox: BoundingBox, rand: () => number): { x: number; y: number } {
  const maxOffX = Math.min(10, bbox.width / 4);
  const maxOffY = Math.min(10, bbox.height / 4);
  return {
    x: Math.round(bbox.x + bbox.width / 2 + (rand() * 2 - 1) * maxOffX),
    y: Math.round(bbox.y + bbox.height / 2 + (rand() * 2 - 1) * maxOffY),
  };
}

/**
 * Generate cursor segments: holds between actions, Bezier curves for movements,
 * and linear overshoot+settle at the end of each movement.
 *
 * Each Bezier movement is a single segment — FFmpeg evaluates the cubic Bezier
 * per-frame using expression registers, so we get perfect smooth curves without
 * generating hundreds of intermediate keyframes.
 */
function generateCursorSegments(events: RecordingEvent[]): CursorSegment[] {
  const rand = seededRandom(42);

  const positions: { time_s: number; x: number; y: number }[] = [];
  for (const event of events) {
    if (event.bounding_box) {
      const { x, y } = landingPoint(event.bounding_box, rand);
      positions.push({ time_s: event.timestamp_ms / 1000, x, y });
    }
  }

  if (positions.length === 0) return [];

  const segments: CursorSegment[] = [];

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i]!;
    const arriveAt = pos.time_s - ARRIVE_BEFORE_S;
    const startMoveAt = arriveAt - TRAVEL_S;

    if (i === 0) {
      // Hold at first position from start
      segments.push({ type: 'hold', t0: Math.max(0, startMoveAt), t1: pos.time_s, x: pos.x, y: pos.y });
    } else {
      const prev = positions[i - 1]!;
      const holdUntil = Math.max(prev.time_s, startMoveAt);

      // Hold at previous position
      if (holdUntil > prev.time_s) {
        // Already have a hold from the previous iteration's action hold, extend it if needed
      }
      // The previous segment's hold covers up to prev.time_s, we may need a gap fill
      segments.push({ type: 'hold', t0: prev.time_s, t1: holdUntil, x: prev.x, y: prev.y });

      if (holdUntil < arriveAt) {
        const dx = pos.x - prev.x;
        const dy = pos.y - prev.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 8) {
          // Very short movement: just linear ease (FFmpeg does linear, easing not needed)
          segments.push({ type: 'linear', t0: holdUntil, t1: arriveAt, x0: prev.x, y0: prev.y, x1: pos.x, y1: pos.y });
        } else {
          // Bezier curve with control points
          const nx = -dy / dist;
          const ny = dx / dist;
          const curvature = dist * (0.10 + rand() * 0.15);
          const side = rand() > 0.5 ? 1 : -1;

          const cp1x = prev.x + dx * 0.25 + nx * curvature * side;
          const cp1y = prev.y + dy * 0.25 + ny * curvature * side;
          const cp2x = prev.x + dx * 0.75 + nx * curvature * side * 0.4;
          const cp2y = prev.y + dy * 0.75 + ny * curvature * side * 0.4;

          const hasOvershoot = dist > 30;

          if (hasOvershoot) {
            const mainEnd = holdUntil + (arriveAt - holdUntil) * 0.85;
            const overshootEnd = holdUntil + (arriveAt - holdUntil) * 0.93;

            // Main Bezier curve (85% of travel time)
            segments.push({
              type: 'bezier', t0: holdUntil, t1: mainEnd,
              x0: prev.x, y0: prev.y, cp1x, cp1y, cp2x, cp2y, x1: pos.x, y1: pos.y,
            });

            // Overshoot: linear to overshoot point
            const overshootPx = 2 + rand() * 4;
            const dirX = dx / dist;
            const dirY = dy / dist;
            const ovX = Math.round(pos.x + dirX * overshootPx);
            const ovY = Math.round(pos.y + dirY * overshootPx);

            segments.push({ type: 'linear', t0: mainEnd, t1: overshootEnd, x0: pos.x, y0: pos.y, x1: ovX, y1: ovY });

            // Settle: linear back to target
            segments.push({ type: 'linear', t0: overshootEnd, t1: arriveAt, x0: ovX, y0: ovY, x1: pos.x, y1: pos.y });
          } else {
            // Full Bezier, no overshoot
            segments.push({
              type: 'bezier', t0: holdUntil, t1: arriveAt,
              x0: prev.x, y0: prev.y, cp1x, cp1y, cp2x, cp2y, x1: pos.x, y1: pos.y,
            });
          }
        }
      }

      // Hold at target through the action
      segments.push({ type: 'hold', t0: arriveAt, t1: pos.time_s, x: pos.x, y: pos.y });
    }
  }

  // Hold at last position for 2 more seconds
  const last = positions[positions.length - 1]!;
  segments.push({ type: 'hold', t0: last.time_s, t1: last.time_s + 2.0, x: last.x, y: last.y });

  // Remove zero-duration segments
  return segments.filter(s => s.t1 > s.t0 + 0.001);
}

// ── FFmpeg expression builders ──

const F = (n: number) => n.toFixed(3);
const V = (n: number) => n.toFixed(1);

/**
 * Build a Bezier+easing expression for one axis using FFmpeg registers.
 *
 * reg0 = raw progress (0..1)
 * reg1 = eased progress via smoothstep: t²(3-2t)
 * result = cubic Bezier evaluated at eased progress
 */
function bezierExpr(
  t0: number, t1: number,
  p0: number, cp1: number, cp2: number, p1: number,
): string {
  const dur = F(t1 - t0);
  // st(N, expr) stores expr in register N and returns it; multiply by 0 to discard
  // ld(N) retrieves the register value
  return (
    `0*st(0,(t-${F(t0)})/${dur})+` +
    `0*st(1,ld(0)*ld(0)*(3-2*ld(0)))+` +
    `(1-ld(1))*(1-ld(1))*(1-ld(1))*${V(p0)}+` +
    `3*(1-ld(1))*(1-ld(1))*ld(1)*${V(cp1)}+` +
    `3*(1-ld(1))*ld(1)*ld(1)*${V(cp2)}+` +
    `ld(1)*ld(1)*ld(1)*${V(p1)}`
  );
}

function buildExprForProp(segments: CursorSegment[], prop: 'x' | 'y'): string {
  if (segments.length === 0) return '0';

  let expr = '';
  let depth = 0;

  for (const seg of segments) {
    let value: string;

    switch (seg.type) {
      case 'hold':
        value = V(seg[prop]);
        break;
      case 'linear': {
        const v0 = seg[`${prop}0` as 'x0' | 'y0'];
        const v1 = seg[`${prop}1` as 'x1' | 'y1'];
        value = `${V(v0)}+(${V(v1 - v0)})*(t-${F(seg.t0)})/${F(seg.t1 - seg.t0)}`;
        break;
      }
      case 'bezier': {
        const p0 = seg[`${prop}0` as 'x0' | 'y0'];
        const p1 = seg[`${prop}1` as 'x1' | 'y1'];
        const c1 = seg[`cp1${prop}` as 'cp1x' | 'cp1y'];
        const c2 = seg[`cp2${prop}` as 'cp2x' | 'cp2y'];
        value = bezierExpr(seg.t0, seg.t1, p0, c1, c2, p1);
        break;
      }
    }

    const segment = `if(between(t,${F(seg.t0)},${F(seg.t1)}),${value}`;
    expr = expr ? `${expr},${segment}` : segment;
    depth++;
  }

  // Default: last segment's final value
  const last = segments[segments.length - 1]!;
  const defaultVal = last.type === 'hold' ? last[prop] : last[`${prop}1` as 'x1' | 'y1'];
  return `${expr},${V(defaultVal)}${')'.repeat(depth)}`;
}

export interface CursorOverlayResult {
  /** Path to the cursor pointer image (added as extra FFmpeg input). */
  imagePath: string;
  /** Filter to prep the cursor input (loop + format). */
  inputFilter: string;
  /** The overlay filter expression with animated x/y. */
  overlay: string;
}

/**
 * Build cursor overlay using a pointer PNG image with animated position.
 * The hotspot is at the top-left (tip of the arrow).
 */
export function buildCursorOverlay(
  events: RecordingEvent[],
  viewport: Viewport
): CursorOverlayResult | null {
  const segments = generateCursorSegments(events);
  if (segments.length === 0) return null;

  const xExpr = buildExprForProp(segments, 'x');
  const yExpr = buildExprForProp(segments, 'y');

  return {
    imagePath: cursorImagePath(),
    inputFilter: 'format=rgba,loop=-1:size=1:start=0',
    overlay: `x='${xExpr}':y='${yExpr}':shortest=1`,
  };
}

// Legacy exports
export function extractCursorPositions(events: RecordingEvent[]) {
  const positions: { time_s: number; x: number; y: number }[] = [];
  for (const event of events) {
    if (event.bounding_box) {
      positions.push({
        time_s: event.timestamp_ms / 1000,
        x: Math.round(event.bounding_box.x + event.bounding_box.width / 2),
        y: Math.round(event.bounding_box.y + event.bounding_box.height / 2),
      });
    }
  }
  return positions;
}

export function buildCursorFilter(_events: RecordingEvent[], _viewport: Viewport): string[] {
  return [];
}
