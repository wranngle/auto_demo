// TTS provider abstraction. The narrate events in the event log carry the
// caption text + timestamp; this module turns them into per-clip WAV files
// that audio-compose mixes into the composed video.
//
// Providers:
//   - flite      : offline, via ffmpeg's libflite filter. Robotic but free.
//   - elevenlabs : POST to api.elevenlabs.io/v1/text-to-speech; reads
//                  ELEVENLABS_API_KEY from env. Requires network.
//   - openai     : POST to api.openai.com/v1/audio/speech; reads OPENAI_API_KEY.
//
// Tests can inject a custom provider so the audio plan can be exercised
// without spending network or fork()ing ffmpeg.
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {runFFmpeg} from '../video/ffmpeg.js';

export type TtsProviderName = 'flite' | 'elevenlabs' | 'openai';

export interface TtsRequest {
  text: string;
  outPath: string;
}

export interface TtsProvider {
  name: TtsProviderName;
  /** Synthesize `text` into a WAV at `outPath`. */
  synth(req: TtsRequest): Promise<void>;
}

/** Use ffmpeg's libflite to synthesize offline. Voice: slt (US English female). */
export function fliteProvider(voice = 'slt'): TtsProvider {
  return {
    name: 'flite',
    async synth({text, outPath}) {
      // Escape single quotes for the lavfi expression
      const escaped = text.replace(/'/g, "'\\''").replace(/:/g, '\\:');
      await runFFmpeg({
        input: `flite=text='${escaped}':voice=${voice}`,
        output: outPath,
        outputArgs: ['-ac', '1', '-ar', '22050'],
        inputArgs: ['-f', 'lavfi'],
      });
    },
  };
}

/** ElevenLabs HTTP provider. */
export function elevenLabsProvider(opts: {apiKey: string; voiceId?: string; modelId?: string}): TtsProvider {
  const voice = opts.voiceId ?? '21m00Tcm4TlvDq8ikWAM'; // default "Rachel"
  const model = opts.modelId ?? 'eleven_turbo_v2_5';
  return {
    name: 'elevenlabs',
    async synth({text, outPath}) {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
        method: 'POST',
        headers: {
          'xi-api-key': opts.apiKey,
          'content-type': 'application/json',
          accept: 'audio/mpeg',
        },
        body: JSON.stringify({text, model_id: model}),
      });
      if (!res.ok) {
        throw new Error(`ElevenLabs TTS failed: ${res.status} ${await res.text().catch(() => '')}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      // ElevenLabs returns MP3 — write as .mp3, compose-audio normalizes.
      writeFileSync(outPath, buf);
    },
  };
}

/** OpenAI HTTP provider. */
export function openAiProvider(opts: {apiKey: string; voice?: string; model?: string}): TtsProvider {
  const voice = opts.voice ?? 'alloy';
  const model = opts.model ?? 'tts-1';
  return {
    name: 'openai',
    async synth({text, outPath}) {
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${opts.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({model, voice, input: text, response_format: 'wav'}),
      });
      if (!res.ok) {
        throw new Error(`OpenAI TTS failed: ${res.status} ${await res.text().catch(() => '')}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(outPath, buf);
    },
  };
}

/** Resolve a provider by name, reading credentials from env when needed. */
export function resolveProvider(name: TtsProviderName): TtsProvider {
  switch (name) {
    case 'flite':
      return fliteProvider();
    case 'elevenlabs': {
      const apiKey = process.env['ELEVENLABS_API_KEY'];
      if (!apiKey) throw new Error('TTS provider "elevenlabs" requires ELEVENLABS_API_KEY in the environment.');
      return elevenLabsProvider({apiKey});
    }
    case 'openai': {
      const apiKey = process.env['OPENAI_API_KEY'];
      if (!apiKey) throw new Error('TTS provider "openai" requires OPENAI_API_KEY in the environment.');
      return openAiProvider({apiKey});
    }
  }
}

/** Synthesize a batch of clips. Returns the output paths actually written. */
export async function synthBatch(provider: TtsProvider, items: Array<{text: string; index: number}>, outDir: string): Promise<string[]> {
  const written: string[] = [];
  for (const item of items) {
    // flite is fast enough to do serially; remote APIs benefit from concurrency,
    // but we keep it simple here so per-clip errors fail loudly with context.
    const ext = provider.name === 'elevenlabs' ? 'mp3' : 'wav';
    const out = join(outDir, `narration-${String(item.index).padStart(3, '0')}.${ext}`);
    await provider.synth({text: item.text, outPath: out});
    written.push(out);
  }
  return written;
}
