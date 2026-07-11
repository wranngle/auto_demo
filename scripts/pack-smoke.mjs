#!/usr/bin/env node
// Packed-tarball smoke test: proves the artifact npm would publish actually
// installs and runs, not merely that it packs.
//
//   1. `npm pack` the repo into a scratch dir (prepare -> build runs first).
//   2. `npm install` the tarball into a bare temp project, so the bin is wired
//      through a real node_modules/.bin symlink exactly as a consumer gets it.
//   3. Execute the installed bin with --help and require exit 0 plus the `run`
//      subcommand in the output.
//
// No publish, no registry writes. Browsers are not needed for --help, so the
// Playwright download is skipped for the temp install.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const scratch = mkdtempSync(path.join(tmpdir(), 'ui-demo-runner-pack-smoke-'));

try {
  const packOutput = execFileSync('npm', ['pack', '--json', '--pack-destination', scratch], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const [{filename}] = JSON.parse(packOutput.slice(packOutput.indexOf('[')));
  const tarball = path.join(scratch, filename);

  const consumer = path.join(scratch, 'consumer');
  mkdirSync(consumer);
  writeFileSync(
    path.join(consumer, 'package.json'),
    JSON.stringify({name: 'pack-smoke-consumer', private: true}, null, 2) + '\n',
  );
  execFileSync('npm', ['install', tarball, '--no-audit', '--no-fund'], {
    cwd: consumer,
    encoding: 'utf8',
    env: {...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1'},
  });

  const bin = path.join(consumer, 'node_modules', '.bin', 'ui-demo-runner');
  if (!existsSync(bin)) {
    throw new Error(`installed bin missing at ${bin}`);
  }

  const help = execFileSync(bin, ['--help'], {encoding: 'utf8'});
  if (!help.includes('run')) {
    throw new Error('--help output does not list the run subcommand');
  }

  console.log(`pack smoke OK: ${filename} installs and node_modules/.bin/ui-demo-runner answers --help`);
} finally {
  rmSync(scratch, {recursive: true, force: true});
}
