import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, test} from 'vitest';
import {
  buildCaptionCues,
  formatTimestamp,
  parseLanguages,
  renderSrt,
  supportedLanguages,
  translateCaption,
  type CaptionLanguage,
} from '../src/captions/srt.js';
import type {DemoFlow} from '../src/types.js';

const sampleFlow: DemoFlow = {
  startUrl: './fixtures/smoke.html',
  steps: [
    {
      action: 'waitForText',
      text: 'Pipeline Console',
    },
    {
      action: 'caption',
      text: 'Open the working surface.',
      ms: 1000,
      label: 'opener',
    },
    {
      action: 'click',
      selector: '#nav-opportunities',
    },
    {
      action: 'caption',
      text: 'Search the table for voice automation.',
      ms: 1400,
    },
    {
      action: 'screenshot',
      name: 'final',
    },
  ],
};

describe('parseLanguages', () => {
  test('parses comma-separated lowercase codes and de-duplicates', () => {
    expect(parseLanguages('en,es,pt,fr')).toStrictEqual(['en', 'es', 'pt', 'fr']);
    expect(parseLanguages('EN, es , es, pt')).toStrictEqual(['en', 'es', 'pt']);
  });

  test('rejects unsupported codes', () => {
    expect(() => parseLanguages('en,xx')).toThrow(/Unsupported caption language/v);
  });

  test('requires at least one language', () => {
    expect(() => parseLanguages('')).toThrow(/at least one/v);
    expect(() => parseLanguages(',,')).toThrow(/at least one/v);
  });
});

describe('formatTimestamp', () => {
  test('renders SRT-style HH:MM:SS,mmm', () => {
    expect(formatTimestamp(0)).toBe('00:00:00,000');
    expect(formatTimestamp(1234)).toBe('00:00:01,234');
    expect(formatTimestamp((61 * 1000) + 500)).toBe('00:01:01,500');
    expect(formatTimestamp(-5)).toBe('00:00:00,000');
  });
});

describe('buildCaptionCues', () => {
  test('only emits cues for caption steps and indexes from 1', () => {
    const cues = buildCaptionCues(sampleFlow);
    expect(cues).toHaveLength(2);
    expect(cues[0]?.index).toBe(1);
    expect(cues[1]?.index).toBe(2);
    expect(cues[0]?.text).toBe('Open the working surface.');
    const firstEnd = cues[0]?.endMs ?? 0;
    expect(cues[1]?.startMs ?? 0).toBeGreaterThan(firstEnd);
  });

  test('returns empty cue list when flow has no caption steps', () => {
    const cues = buildCaptionCues({
      startUrl: './x',
      steps: [
        {
          action: 'click',
          selector: '#a',
        },
        {
          action: 'pause',
          ms: 500,
        },
      ],
    });
    expect(cues).toStrictEqual([]);
  });
});

describe('translateCaption', () => {
  test('returns the original string verbatim for en', () => {
    expect(translateCaption('Open the working surface.', 'en')).toBe('Open the working surface.');
  });

  test('translates known tokens for non-en supported languages', () => {
    for (const lang of supportedLanguages) {
      const translated = translateCaption('Open the working surface.', lang);
      if (lang === 'en') {
        expect(translated).toBe('Open the working surface.');
      } else {
        expect(translated).not.toBe('Open the working surface.');
        expect(translated.length).toBeGreaterThan(0);
      }
    }
  });

  test('preserves leading capitalization in the translated token', () => {
    const translated = translateCaption('Open', 'es');
    expect(translated.charAt(0)).toBe(translated.charAt(0).toUpperCase());
  });
});

describe('renderSrt', () => {
  test('produces well-formed SRT blocks separated by a blank line', () => {
    const cues = buildCaptionCues(sampleFlow);
    const body = renderSrt(cues, text => text);
    const blocks = body.split('\n\n').filter(block => block.length > 0);
    expect(blocks).toHaveLength(cues.length);
    for (const [i, block] of blocks.entries()) {
      const lines = block.split('\n');
      expect(lines[0]).toBe(String(i + 1));
      expect(lines[1]).toMatch(/^\d\d:\d\d:\d\d,\d\d\d --> \d\d:\d\d:\d\d,\d\d\d$/v);
      expect((lines[2] ?? '').length).toBeGreaterThan(0);
    }
  });

  test('cue counts match across languages and timestamps are byte-identical', () => {
    const cues = buildCaptionCues(sampleFlow);
    const renderings = new Map<CaptionLanguage, string>();
    for (const lang of supportedLanguages) {
      renderings.set(lang, renderSrt(cues, text => translateCaption(text, lang)));
    }

    const cueCount = (srt: string): number => srt.split('\n\n').filter(block => block.length > 0).length;
    const timestamps = (srt: string): string[] => srt.split('\n').filter(line => line.includes(' --> '));

    const enBody = renderings.get('en') ?? '';
    const enCount = cueCount(enBody);
    for (const lang of supportedLanguages) {
      const body = renderings.get(lang) ?? '';
      expect(cueCount(body)).toBe(enCount);
      expect(timestamps(body)).toStrictEqual(timestamps(enBody));
    }
  });
});

describe('caption tracks on disk', () => {
  test('one SRT file per requested language with the same cue count', async () => {
    const cues = buildCaptionCues(sampleFlow);
    const dir = await mkdtemp(join(tmpdir(), 'auto-demo-captions-'));
    const langs = supportedLanguages;

    const paths = await Promise.all(langs.map(async lang => {
      const body = renderSrt(cues, text => translateCaption(text, lang));
      const path = join(dir, `recording.${lang}.srt`);
      await writeFile(path, body);
      return path;
    }));

    const bodies = await Promise.all(paths.map(async path => readFile(path, 'utf8')));
    const cueCount = (srt: string): number => srt.split('\n\n').filter(block => block.length > 0).length;
    const baseline = cueCount(bodies[0] ?? '');
    expect(baseline).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(cueCount(body)).toBe(baseline);
    }
  });
});
