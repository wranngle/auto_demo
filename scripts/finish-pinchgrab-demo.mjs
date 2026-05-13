#!/usr/bin/env node
// Compose + audio pass over the raw screen recording made by
// record-pinchgrab-demo.mjs. Produces composed + composed-audio at the
// keyed paths under <cwd>/.auto_demo/.
import {mkdirSync} from 'node:fs';
import {composeVideo, generateThumbnail} from '../dist/video/compose.js';
import {fliteProvider, synthBatch} from '../dist/audio/tts.js';
import {planAudioFromEvents, muxAudioIntoVideo} from '../dist/audio/compose-audio.js';
import {readEventLog} from '../dist/recording/event-log.js';
import {resolveOutputs} from '../dist/utils/paths.js';
import {RuntimeLog} from '../dist/utils/runtime-log.js';

const PATHS = resolveOutputs({key: 'pinchgrab'});
const runtimeLog = new RuntimeLog(PATHS.log);

async function main() {
  const events = readEventLog(PATHS.events);
  console.log(`events: ${events.length} (from ${PATHS.events})`);
  runtimeLog.event({action: 'finish.start', events: events.length, source: PATHS.events});

  console.log('composing with cursor + ember background...');
  await runtimeLog.time('ffmpeg.compose', async () => composeVideo({
    rawVideoPath: PATHS.rawVideo,
    events,
    outputPath: PATHS.composedVideo,
    viewport: {width: 1280, height: 720},
    cursor: true,
    highlight: false,
    zoom: false,
    background: {gradient: 'ember', padding: 6, cornerRadius: 14, shadow: true},
  }), {output: PATHS.composedVideo});
  console.log(`composed: ${PATHS.composedVideo}`);

  try {
    await generateThumbnail(PATHS.composedVideo, PATHS.thumbnail);
    runtimeLog.event({action: 'ffmpeg.thumbnail', output: PATHS.thumbnail});
  } catch (err) {
    console.warn(`thumbnail skipped: ${err.message}`);
    runtimeLog.event({action: 'ffmpeg.thumbnail', outcome: 'failure', level: 'warn', message: err.message});
  }

  console.log('synthesizing narration with flite...');
  const plan = planAudioFromEvents(events);
  if (plan.clips.length === 0) {
    console.log('no narrate events — skipping audio.');
    runtimeLog.event({action: 'tts.skip', reason: 'no narrate events'});
    runtimeLog.close();
    return;
  }
  mkdirSync(PATHS.audioDir, {recursive: true});
  const clipPaths = await synthBatch(
    fliteProvider(),
    plan.clips.map((c) => ({text: c.text, index: c.index})),
    PATHS.audioDir,
  );
  console.log(`clips: ${clipPaths.length}`);
  runtimeLog.event({action: 'tts.synth', clips: clipPaths.length, dir: PATHS.audioDir});

  await runtimeLog.time('ffmpeg.audio-mix', async () => muxAudioIntoVideo({
    videoPath: PATHS.composedVideo,
    outputPath: PATHS.composedAudioVideo,
    clipPaths,
    plan,
  }), {output: PATHS.composedAudioVideo});
  console.log(`composed (audio): ${PATHS.composedAudioVideo}`);
  runtimeLog.event({action: 'finish.complete', composed: PATHS.composedVideo, audio: PATHS.composedAudioVideo});
  runtimeLog.close();
}

main().catch((err) => {
  console.error(`finish failed: ${err.stack ?? err.message}`);
  runtimeLog.event({action: 'finish.error', outcome: 'failure', level: 'error', message: err.message});
  runtimeLog.close();
  process.exit(1);
});
