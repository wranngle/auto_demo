#!/usr/bin/env node
// One-off recorder for the PinchGrab Chrome-extension demo. Bypasses
// auto_demo's Playwright-video pipeline so we can capture the *browser
// chrome* (side panel + toolbar), not just the page viewport.
//
// Pipeline:
//   1. Spawn ffmpeg -f x11grab against WSLg's :0 display, into raw.mp4.
//   2. Launch a headed Chromium via Playwright with the extension loaded.
//      Pin the window to 0,0 so x11grab's static region matches it.
//   3. Drive the page: navigate, Alt+click a few semantic targets,
//      open the side panel in a second tab (chrome-extension://<id>/sidepanel.html)
//      so the captures are visible on-screen.
//   4. Close Chromium, stop ffmpeg, exit.
//
// Output:
//   .work/pinchgrab-demo/raw.mp4   — OS-level screen capture (includes browser chrome)
//   .work/pinchgrab-demo/events.json — synthetic event log for auto_demo compose
//
// Re-run: node scripts/record-pinchgrab-demo.mjs

import {spawn} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const VIRTUAL_DISPLAY = ':99';

const EXT_DIR = '/mnt/c/Users/root/Documents/dev/visual_copy_design/extension';
const TARGET_URL = 'https://app.wranngle.com/console/';
const OUT_DIR = resolve(process.cwd(), '.work/pinchgrab-demo');
// WSLg's default virtual display caps at 1280x720; oversizing produces
// "Capture area outside the screen size" + ffmpeg exit code 234. The window
// size below is intentionally an inset to leave room for browser chrome
// (toolbar + tab bar) inside the same region.
const REGION = {w: 1280, h: 720, x: 0, y: 0};
const WINDOW = {w: 1280, h: 720};
const VIEWPORT = {w: 1280, h: 580}; // leave ~140 px for browser chrome

function log(msg) {
  console.error(`[record] ${msg}`);
}

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function startXvfb(display, w, h) {
  // -nolisten tcp keeps the X server local; +extension MIT-SHM allows the
  // shared-memory extension Chromium uses for fast rendering.
  const proc = spawn('Xvfb', [display, '-screen', '0', `${w}x${h}x24`, '-nolisten', 'tcp'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.on('exit', (code) => log(`Xvfb exited code=${code}`));
  return proc;
}

function startScreenRecord(outPath, region, display) {
  const args = [
    '-y',
    '-f', 'x11grab',
    '-framerate', '25',
    '-video_size', `${region.w}x${region.h}`,
    '-i', `${display}.0+${region.x},${region.y}`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    outPath,
  ];
  log(`ffmpeg ${args.join(' ')}`);
  const proc = spawn('ffmpeg', args, {stdio: ['pipe', 'pipe', 'pipe']});
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d.toString(); });
  proc.on('exit', (code) => log(`ffmpeg exited code=${code}`));
  return {
    proc,
    async stop() {
      // Send 'q' to ffmpeg for a graceful shutdown that writes the index.
      proc.stdin.write('q\n');
      proc.stdin.end();
      await new Promise((r) => proc.on('close', r));
      if (proc.exitCode !== 0 && proc.exitCode !== 255) {
        log(`ffmpeg stderr tail: ${stderr.slice(-400)}`);
      }
    },
  };
}

async function resolveExtensionId(context, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const sw of context.serviceWorkers()) {
      const m = /chrome-extension:\/\/([a-z]+)\//.exec(sw.url());
      if (m) return m[1];
    }
    await delay(150);
  }
  throw new Error('extension service worker never registered');
}

const events = [];
function recordEvent(type, description, extra = {}) {
  events.push({
    id: events.length + 1,
    timestamp_ms: Date.now() - startedAt,
    type,
    description,
    viewport: {width: REGION.w, height: REGION.h},
    ...extra,
  });
}

let startedAt = Date.now();

async function main() {
  mkdirSync(OUT_DIR, {recursive: true});
  const rawPath = resolve(OUT_DIR, 'raw.mp4');
  const eventsPath = resolve(OUT_DIR, 'events.json');
  const metadataPath = resolve(OUT_DIR, 'metadata.json');

  log(`output dir: ${OUT_DIR}`);
  // Start an isolated Xvfb so x11grab can actually see the Chromium window
  // (Playwright's headed Chromium under WSLg renders to Wayland by default,
  // invisible to x11grab on :0). Xvfb gives us a controlled X11 surface.
  log(`starting Xvfb on ${VIRTUAL_DISPLAY} ${REGION.w}x${REGION.h}`);
  const xvfb = startXvfb(VIRTUAL_DISPLAY, REGION.w, REGION.h);
  await delay(700); // give Xvfb a moment to bind the socket

  const recorder = startScreenRecord(rawPath, REGION, VIRTUAL_DISPLAY);
  // Let ffmpeg attach to the display before we open the browser.
  await delay(800);

  let userDataDir;
  let context;
  try {
    userDataDir = resolve(OUT_DIR, '_chromium-profile');
    mkdirSync(userDataDir, {recursive: true});
    log(`launching headed Chromium on DISPLAY=${VIRTUAL_DISPLAY}`);
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: {width: VIEWPORT.w, height: VIEWPORT.h},
      env: {...process.env, DISPLAY: VIRTUAL_DISPLAY},
      args: [
        `--disable-extensions-except=${EXT_DIR}`,
        `--load-extension=${EXT_DIR}`,
        `--window-position=${REGION.x},${REGION.y}`,
        `--window-size=${WINDOW.w},${WINDOW.h}`,
        '--ozone-platform=x11',
        '--no-first-run',
        '--no-default-browser-check',
        '--start-maximized',
      ],
    });

    const extId = await resolveExtensionId(context);
    log(`extension id resolved: ${extId}`);

    startedAt = Date.now();
    const page = context.pages()[0] ?? await context.newPage();

    log(`navigating to ${TARGET_URL}`);
    await page.goto(TARGET_URL, {waitUntil: 'domcontentloaded', timeout: 30_000});
    recordEvent('navigate', `Navigate to ${TARGET_URL}`, {url: TARGET_URL, value: TARGET_URL});
    await delay(1500);

    // Pick targets that exist in nearly every Wranngle console build.
    // Fall through to body bounding boxes if none of the semantic targets match.
    // Prefer interactable, non-overlapped targets: the H1 was getting blocked
    // by ph__actions in the prior run. Buttons + the page-title h1 itself are
    // hit-test-clean.
    const targets = [
      {label: 'page header title', selector: '#console-page-title, header h1, .ph__title'},
      {label: 'primary action button', selector: 'header button, .ph__actions button, [data-test="primary-action"]'},
      {label: 'first card heading', selector: '.card h2, .card h3, [data-test="card"] h2, main h2'},
    ];

    for (const t of targets) {
      try {
        const loc = page.locator(t.selector).first();
        await loc.waitFor({state: 'visible', timeout: 5_000});
        const box = await loc.boundingBox();
        if (!box) continue;
        log(`alt+click on: ${t.label}`);
        recordEvent('narrate', `Alt+Click ${t.label} to capture it via PinchGrab`, {
          value: `Alt+Click on ${t.label} fires PinchGrab's capture handler.`,
        });
        await loc.click({modifiers: ['Alt'], timeout: 5_000});
        recordEvent('click', `Alt+Click ${t.label}`, {
          bounding_box: {x: box.x, y: box.y, width: box.width, height: box.height},
          target_meta: {selector: t.selector, name: t.label},
        });
        await delay(1500);
      } catch (err) {
        log(`skipped ${t.label}: ${err.message}`);
      }
    }

    // Open the side panel content as a regular tab so it ends up on screen.
    // (Chrome's actual side panel position lives in browser chrome — without
    // xdotool we can't programmatically toggle the action button. Opening
    // sidepanel.html as a tab shows the user-visible UI in the recorded region.)
    const sidepanelUrl = `chrome-extension://${extId}/sidepanel.html`;
    log(`opening side panel as tab: ${sidepanelUrl}`);
    recordEvent('narrate', 'Open the PinchGrab side panel to review captures', {value: 'Open the PinchGrab side panel to review captures.'});
    const sidepanel = await context.newPage();
    await sidepanel.goto(sidepanelUrl, {waitUntil: 'domcontentloaded', timeout: 10_000});
    recordEvent('navigate', `Open ${sidepanelUrl}`, {url: sidepanelUrl, value: sidepanelUrl});
    await delay(3500);

    recordEvent('done', 'PinchGrab demo recorded', {});
    log('demo sequence complete');
  } catch (err) {
    log(`demo error: ${err.stack ?? err.message}`);
  } finally {
    try { await context?.close(); } catch (e) { log(`context close failed: ${e.message}`); }
    await delay(400);
    await recorder.stop();
    try { xvfb.kill('SIGTERM'); } catch { /* ignore */ }
  }

  writeFileSync(eventsPath, JSON.stringify(events, null, 2));
  writeFileSync(metadataPath, JSON.stringify({
    id: 'pinchgrab-demo',
    created_at: new Date().toISOString(),
    url: TARGET_URL,
    prompt: 'Demo of PinchGrab: Alt+click captures elements, side panel reviews them.',
    model: 'hand-authored',
    viewport: {width: REGION.w, height: REGION.h},
    duration_ms: Date.now() - startedAt,
    raw_video_path: rawPath,
    event_log_path: eventsPath,
    chapters: [],
    agent_stats: {total_actions: events.length, input_tokens: 0, output_tokens: 0},
  }, null, 2));
  log(`raw video: ${rawPath}`);
  log(`events: ${eventsPath}`);
}

main().catch((err) => {
  console.error(`[record] FATAL: ${err.stack ?? err.message}`);
  process.exit(1);
});
