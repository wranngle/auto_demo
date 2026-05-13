import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import type { Viewport } from '../recording/types.js';
import { logger } from '../utils/logger.js';

const AUTH_DIR = join(homedir(), '.screencli', 'auth');

export function authStatePath(name: string): string {
  return join(AUTH_DIR, `${name}.json`);
}

export function hasAuthState(name: string): boolean {
  return existsSync(authStatePath(name));
}

export function saveAuthState(name: string, state: object): void {
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(authStatePath(name), JSON.stringify(state, null, 2));
  logger.info(`Auth state saved to ${authStatePath(name)}`);
}

export function loadAuthState(name: string): object | null {
  const path = authStatePath(name);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/**
 * Open a visible browser for the user to log in manually.
 * Returns the Playwright storageState (cookies, localStorage, sessionStorage)
 * after the user presses Enter in the terminal.
 */
export async function runLoginFlow(url: string, viewport: Viewport): Promise<object> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  await waitForEnter();

  const state = await context.storageState();
  await context.close();
  await browser.close();

  return state;
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('', () => {
      rl.close();
      resolve();
    });
  });
}
