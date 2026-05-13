#!/usr/bin/env node
// Compose + audio pass over the raw screen recording made by
// record-pinchgrab-demo.mjs. Produces composed.mp4 (with cursor overlay +
// rounded corners + background) and composed-audio.mp4 (with flite-narrated
// audio mixed in).
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {composeVideo, generateThumbnail} from '../dist/video/compose.js';
import {fliteProvider, synthBatch} from '../dist/audio/tts.js';
import {planAudioFromEvents, muxAudioIntoVideo} from '../dist/audio/compose-audio.js';

const DIR = resolve(process.cwd(), '.work/pinchgrab-demo');
const RAW = resolve(DIR, 'raw.mp4');
const EVENTS = resolve(DIR, 'events.json');
const COMPOSED = resolve(DIR, 'composed.mp4');
const COMPOSED_AUDIO = resolve(DIR, 'composed-audio.mp4');

async function main() {
  const events = JSON.parse(readFileSync(EVENTS, 'utf8'));
  console.log(`events: ${events.length}`);

  console.log('composing with cursor + ember background...');
  await composeVideo({
    rawVideoPath: RAW,
    events,
    outputPath: COMPOSED,
    viewport: {width: 1280, height: 720},
    cursor: true,
    highlight: false,
    zoom: false, // zoom math expects bounding_box on every click; our log has one, so leave off
    background: {gradient: 'ember', padding: 6, cornerRadius: 14, shadow: true},
  });
  console.log(`composed: ${COMPOSED}`);

  try {
    await generateThumbnail(COMPOSED, resolve(DIR, 'thumbnail.jpg'));
  } catch (err) {
    console.warn(`thumbnail skipped: ${err.message}`);
  }

  console.log('synthesizing narration with flite...');
  const plan = planAudioFromEvents(events);
  if (plan.clips.length === 0) {
    console.log('no narrate events — skipping audio.');
    return;
  }
  const audioDir = resolve(DIR, 'audio');
  mkdirSync(audioDir, {recursive: true});
  const clipPaths = await synthBatch(
    fliteProvider(),
    plan.clips.map((c) => ({text: c.text, index: c.index})),
    audioDir,
  );
  console.log(`clips: ${clipPaths.length}`);
  await muxAudioIntoVideo({
    videoPath: COMPOSED,
    outputPath: COMPOSED_AUDIO,
    clipPaths,
    plan,
  });
  console.log(`composed (audio): ${COMPOSED_AUDIO}`);
}

main().catch((err) => {
  console.error(`finish failed: ${err.stack ?? err.message}`);
  process.exit(1);
});
