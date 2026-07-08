import {readFile} from 'node:fs/promises';
import process from 'node:process';
import {createHash} from 'node:crypto';

export type WatchRunner = (context: {previousHash: string; nextHash: string}) => Promise<void> | void;

export type WatchOnceOptions = {
  fixture: string;
  next: string;
  logger?: (line: string) => void;
  runner?: WatchRunner;
};

export type WatchOnceResult = {
  previousHash: string;
  nextHash: string;
  changed: boolean;
  rerunCount: number;
};

const hashDom = (raw: string): string => {
  const normalized = raw
    .replaceAll(/<!--[\s\S]*?-->/gv, '')
    .replaceAll(/\s+/gv, ' ')
    .trim()
    .toLowerCase();
  return createHash('sha256').update(normalized).digest('hex');
};

export async function watchOnce(options: WatchOnceOptions): Promise<WatchOnceResult> {
  const {fixture, next} = options;
  const logger = options.logger ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });

  if (typeof fixture !== 'string' || fixture.length === 0) {
    throw new Error('watch: --fixture is required');
  }

  if (typeof next !== 'string' || next.length === 0) {
    throw new Error('watch: --next is required');
  }

  const [previousRaw, nextRaw] = await Promise.all([
    readFile(fixture, 'utf8'),
    readFile(next, 'utf8'),
  ]);

  const previousHash = hashDom(previousRaw);
  const nextHash = hashDom(nextRaw);
  const changed = previousHash !== nextHash;

  let rerunCount = 0;

  if (changed) {
    logger(`CHANGE_DETECTED previous=${previousHash.slice(0, 12)} next=${nextHash.slice(0, 12)}`);

    if (options.runner !== undefined) {
      await options.runner({previousHash, nextHash});
    }

    rerunCount = 1;
  } else {
    logger(`NO_CHANGE hash=${previousHash.slice(0, 12)}`);
  }

  return {
    previousHash, nextHash, changed, rerunCount,
  };
}

export {hashDom};
