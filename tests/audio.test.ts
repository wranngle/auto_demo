// Gap #3 in ROAST.md — audio / narration. The TTS provider abstraction lets
// us unit-test the plan and mix-filter without spinning ffmpeg/flite per test.
import {describe, expect, test} from 'vitest';
import {planAudioFromEvents, buildAudioMixFilter} from '../src/audio/compose-audio.js';
import type {RecordingEvent} from '../src/recording/types.js';

const baseViewport = {width: 1280, height: 720};

function narrate(ms: number, text: string): RecordingEvent {
  return {
    id: ms,
    timestamp_ms: ms,
    type: 'narrate',
    description: text,
    value: text,
    viewport: baseViewport,
  };
}

describe('planAudioFromEvents', () => {
  test('returns empty plan when no narrate events are present', () => {
    const plan = planAudioFromEvents([]);
    expect(plan.clips).toEqual([]);
  });

  test('keeps narration timestamps and numbers clips in order', () => {
    const plan = planAudioFromEvents([
      narrate(500, 'one'),
      narrate(2500, 'two'),
      narrate(5000, 'three'),
    ]);
    expect(plan.clips).toEqual([
      {index: 0, text: 'one', startMs: 500},
      {index: 1, text: 'two', startMs: 2500},
      {index: 2, text: 'three', startMs: 5000},
    ]);
  });

  test('skips empty / whitespace-only narrate events', () => {
    const plan = planAudioFromEvents([
      narrate(100, 'real'),
      narrate(200, '   '),
      narrate(300, ''),
    ]);
    expect(plan.clips).toHaveLength(1);
    expect(plan.clips[0]!.text).toBe('real');
  });

  test('clamps negative timestamps to 0', () => {
    const event = narrate(-50, 'before zero');
    const plan = planAudioFromEvents([event]);
    expect(plan.clips[0]!.startMs).toBe(0);
  });
});

describe('buildAudioMixFilter', () => {
  test('returns null for empty plan', () => {
    expect(buildAudioMixFilter([])).toBeNull();
  });

  test('emits adelay per clip and a final amix node', () => {
    const filter = buildAudioMixFilter([
      {index: 0, text: 'a', startMs: 0},
      {index: 1, text: 'b', startMs: 2500},
    ]);
    expect(filter).toContain('[1:a]adelay=0|0,apad[d0]');
    expect(filter).toContain('[2:a]adelay=2500|2500,apad[d1]');
    expect(filter).toContain('[d0][d1]amix=inputs=2:duration=longest:dropout_transition=0[aout]');
  });

  test('produces N adelay nodes for N clips', () => {
    const plan = Array.from({length: 5}, (_, i) => ({index: i, text: `${i}`, startMs: i * 1000}));
    const filter = buildAudioMixFilter(plan)!;
    expect(filter.match(/adelay=/g)!.length).toBe(5);
    expect(filter).toContain('amix=inputs=5');
  });
});
