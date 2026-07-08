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
  // Strip comments toward a fixpoint: a single pass can splice two
  // fragments into a fresh `<!--` (e.g. `<!<!--- -->-- x -->`), which
  // CodeQL rightly flags as incomplete multi-character sanitization. The
  // pass count is BOUNDED: adversarially nested splices otherwise force
  // one full-regex pass per layer — measured O(n^2), ~1 min on a 1 MB
  // snapshot. Ten layers covers any real DOM; residue past that is simply
  // hashed as-is (this is a change detector, not a sanitizer — both
  // snapshots get identical treatment, so comparisons stay sound).
  let withoutComments = raw;
  for (let pass = 0; pass < 10; pass++) {
    const previous = withoutComments;
    withoutComments = withoutComments.replaceAll(/<!--[\s\S]*?-->/gv, '');
    if (withoutComments === previous) {
      break;
    }
  }

  const normalized = withoutComments
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
