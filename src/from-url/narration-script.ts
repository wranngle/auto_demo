import type {FromUrlScript} from './types.js';

// Comfortable voiceover read rate (~165 wpm), plus a small breath gap
// between lines. Slots are paced by reading time — not by step-action
// heuristics — because the voice must finish each line before the next
// starts, in mock tone and real TTS alike.
const READ_WORDS_PER_SEC = 2.75;
const MIN_LINE_SEC = 1.2;
const BREATH_GAP_SEC = 0.35;

// Converts a from-url script into the `start | duration | text` narration
// format `narrate --script` consumes — the bridge that makes the README's
// "downstream run and narrate consume it" claim true. Deterministic: same
// script in, byte-identical narration out.
export function renderNarrationScript(script: FromUrlScript): string {
  const lines: string[] = [
    `# narration for ${script.name ?? script.startUrl}`,
    `# goal: ${script.goal}`,
  ];

  let cursorSec = 0;
  for (const step of script.steps) {
    const text = step.narration.trim();
    if (text === '') {
      continue;
    }

    const words = text.split(/\s+/gv).length;
    const durationSec = Math.max(MIN_LINE_SEC, roundTenth(words / READ_WORDS_PER_SEC));
    lines.push(`${cursorSec.toFixed(1)} | ${durationSec.toFixed(1)} | ${text}`);
    cursorSec = roundTenth(cursorSec + durationSec + BREATH_GAP_SEC);
  }

  return `${lines.join('\n')}\n`;
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
