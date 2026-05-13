import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { join } from 'node:path';
import { mkdtempSync, renameSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { BrowserError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { Viewport } from '../recording/types.js';

export interface BrowserSession {
  browser: Browser | null;
  context: BrowserContext;
  page: Page;
  close: () => Promise<string | undefined>;
}

export async function launchSession(options: {
  viewport: Viewport;
  headless: boolean;
  slowMo: number;
  recordDir: string;
  storageState?: string | object;
  /** Path to an unpacked MV3 extension dir. Forces headed mode + persistent context. */
  loadExtension?: string;
}): Promise<BrowserSession> {
  logger.info('Launching browser...');

  // MV3 extension support requires launchPersistentContext + headed.
  if (options.loadExtension) {
    if (!existsSync(options.loadExtension)) {
      throw new BrowserError(`--load-extension path not found: ${options.loadExtension}`);
    }
    const userDataDir = mkdtempSync(join(tmpdir(), 'auto_demo-extctx-'));
    logger.info(`Launching headed Chromium with extension: ${options.loadExtension}`);
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      slowMo: options.slowMo,
      viewport: options.viewport,
      recordVideo: {
        dir: options.recordDir,
        size: options.viewport,
      },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      args: [
        `--disable-extensions-except=${options.loadExtension}`,
        `--load-extension=${options.loadExtension}`,
      ],
      ...(options.storageState ? { storageState: options.storageState as any } : {}),
    });
    const page = context.pages()[0] ?? (await context.newPage());
    logger.info(`Browser launched (extension mode). Viewport: ${options.viewport.width}x${options.viewport.height}`);

    async function close(): Promise<string | undefined> {
      try {
        await context.close();
        const files = readdirSync(options.recordDir).filter((f) => f.endsWith('.webm'));
        if (files.length > 0) {
          const src = join(options.recordDir, files[0]!);
          const dest = join(options.recordDir, 'raw.webm');
          if (src !== dest) renameSync(src, dest);
          return dest;
        }
        return undefined;
      } catch (err) {
        logger.error('Error closing extension session', err);
        throw new BrowserError(`Failed to close browser: ${err}`);
      }
    }
    return { browser: null, context, page, close };
  }

  const browser = await chromium.launch({
    headless: options.headless,
    slowMo: options.slowMo,
  });

  const context = await browser.newContext({
    viewport: options.viewport,
    recordVideo: {
      dir: options.recordDir,
      size: options.viewport,
    },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    ...(options.storageState ? { storageState: options.storageState as any } : {}),
  });

  const page = await context.newPage();

  logger.info(`Browser launched. Viewport: ${options.viewport.width}x${options.viewport.height}`);

  async function close(): Promise<string | undefined> {
    try {
      // Must close context to finalize video
      await context.close();
      if (browser) await browser.close();

      // Playwright saves video as a random name in recordDir; find and rename it
      const files = readdirSync(options.recordDir).filter((f) => f.endsWith('.webm'));
      if (files.length > 0) {
        const src = join(options.recordDir, files[0]!);
        const dest = join(options.recordDir, 'raw.webm');
        if (src !== dest) {
          renameSync(src, dest);
        }
        return dest;
      }
      return undefined;
    } catch (err) {
      logger.error('Error closing browser session', err);
      throw new BrowserError(`Failed to close browser: ${err}`);
    }
  }

  return { browser, context, page, close };
}
