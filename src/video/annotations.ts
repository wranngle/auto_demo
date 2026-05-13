// Annotation overlays — arrows, callouts, and boxes drawn over the video.
// Two surfaces:
//   1. Flow schema: `annotate` action with type/x/y/text/durationMs.
//   2. Capture-mode: derived from `narrate` events that include hints.
//
// Implementation here produces ffmpeg drawbox/drawtext expressions that
// the compose step can append to its filter graph.

export type AnnotationKind = 'arrow' | 'callout' | 'box';

export interface Annotation {
  kind: AnnotationKind;
  /** Anchor point in viewport coords (pixels). For 'arrow', the tip lands here. */
  x: number;
  y: number;
  /** Visible label / callout text. */
  text?: string;
  /** Start time in seconds (relative to composed-video clock). */
  startS: number;
  /** Visible duration in seconds. */
  durationS: number;
  /** Optional color. Defaults to the accent orange used elsewhere. */
  color?: string;
}

const DEFAULT_COLOR = 'orangered@0.85';
const BOX_PAD = 12;
const CALLOUT_W = 220;
const CALLOUT_H = 56;

/** ffmpeg-safe text escape: backslash, colon, single quote. */
function escapeDrawText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
}

function enableExpr(start: number, end: number): string {
  return `between(t,${start.toFixed(3)},${end.toFixed(3)})`;
}

/**
 * Build one chain of ffmpeg filter expressions per annotation. The caller
 * appends them into a chain on `[with_cursor]` / `[zoomed]` before the
 * background composite.
 *
 * Returns an array of `drawbox=...` / `drawtext=...` filter strings.
 */
export function buildAnnotationFilters(annotations: Annotation[]): string[] {
  const out: string[] = [];
  for (const a of annotations) {
    const endS = a.startS + a.durationS;
    const color = a.color ?? DEFAULT_COLOR;

    if (a.kind === 'box') {
      const w = 120;
      const h = 64;
      const x = Math.max(0, Math.round(a.x - w / 2));
      const y = Math.max(0, Math.round(a.y - h / 2));
      out.push(
        `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${color}:t=3:enable='${enableExpr(a.startS, endS)}'`,
      );
      if (a.text) {
        out.push(
          `drawtext=text='${escapeDrawText(a.text)}':fontcolor=white:fontsize=18:` +
            `box=1:boxcolor=black@0.65:boxborderw=8:` +
            `x=${x}:y=${y + h + 6}:enable='${enableExpr(a.startS, endS)}'`,
        );
      }
      continue;
    }

    if (a.kind === 'callout') {
      const x = Math.max(0, Math.round(a.x));
      const y = Math.max(0, Math.round(a.y - CALLOUT_H - 8));
      out.push(
        `drawbox=x=${x}:y=${y}:w=${CALLOUT_W}:h=${CALLOUT_H}:color=black@0.7:t=fill:enable='${enableExpr(a.startS, endS)}'`,
      );
      out.push(
        `drawbox=x=${x}:y=${y}:w=${CALLOUT_W}:h=${CALLOUT_H}:color=${color}:t=2:enable='${enableExpr(a.startS, endS)}'`,
      );
      if (a.text) {
        out.push(
          `drawtext=text='${escapeDrawText(a.text)}':fontcolor=white:fontsize=18:` +
            `x=${x + BOX_PAD}:y=${y + 14}:enable='${enableExpr(a.startS, endS)}'`,
        );
      }
      continue;
    }

    if (a.kind === 'arrow') {
      // ffmpeg doesn't have a native arrow primitive — we build one out of three
      // drawbox segments: shaft, head-top, head-bottom. The arrow points to
      // (a.x, a.y); the shaft extends 80px up-and-left into clear space.
      const tipX = Math.round(a.x);
      const tipY = Math.round(a.y);
      const shaftLen = 80;
      const shaftStartX = Math.max(0, tipX - shaftLen);
      const shaftStartY = Math.max(0, tipY - shaftLen);
      out.push(
        // Shaft: thin diagonal box rendered as a 4-px-thick line from start → tip.
        // We approximate with a vertical+horizontal pair so the math stays cheap.
        `drawbox=x=${shaftStartX}:y=${shaftStartY}:w=${shaftLen}:h=4:color=${color}:t=fill:enable='${enableExpr(a.startS, endS)}'`,
        `drawbox=x=${shaftStartX + shaftLen - 4}:y=${shaftStartY}:w=4:h=${shaftLen}:color=${color}:t=fill:enable='${enableExpr(a.startS, endS)}'`,
        // Arrowhead: small filled rectangle at the tip.
        `drawbox=x=${tipX - 8}:y=${tipY - 8}:w=16:h=16:color=${color}:t=fill:enable='${enableExpr(a.startS, endS)}'`,
      );
      if (a.text) {
        // Label sits to the left of the shaft start.
        out.push(
          `drawtext=text='${escapeDrawText(a.text)}':fontcolor=white:fontsize=18:` +
            `box=1:boxcolor=black@0.65:boxborderw=8:` +
            `x=${Math.max(0, shaftStartX - 220)}:y=${shaftStartY}:enable='${enableExpr(a.startS, endS)}'`,
        );
      }
    }
  }
  return out;
}
