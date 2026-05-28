// Guards the drop-in CI template shipped to consumers.
// If this test breaks, a consumer's copy-pasted workflow breaks too.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {describe, expect, test} from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const templatePath = resolve(here, '..', 'templates', 'auto-demo-on-deploy.yml.template');
const raw = readFileSync(templatePath, 'utf8');

// We deliberately do not pull in a YAML parser as a dependency for a single
// smoke test. The template's structure is small and stable; line-anchored
// regex checks catch every regression class the brief calls out (trigger
// branch, upload-artifact action, hardcoded credential) without growing the
// devDependency surface.

describe('auto-demo-on-deploy.yml.template', () => {
  test('declares on.push.branches with main as a target', () => {
    expect(raw).toMatch(/on:\s*\n\s*push:\s*\n\s*branches:\s*\n\s*-\s*main\b/u);
  });

  test('uploads artifacts via actions/upload-artifact@v4', () => {
    expect(raw).toMatch(/uses:\s*actions\/upload-artifact@v4\b/u);
  });

  test('runs the ui-demo-runner CLI in a recording step', () => {
    expect(raw).toMatch(/ui-demo-runner\s+run\b/u);
  });

  // Doctrine drift: the per-run artifact set (recording.webm + manifest.json +
  // events.jsonl) is the consumer-facing contract. Each file lives in three
  // truth sources — runner output (src/runner.ts), README, and this template.
  // PR #19 shipped events.jsonl without updating the template, so consumers
  // copying the template lost the NDJSON ledger. Pin all three so the next
  // artifact addition fails CI until the template catches up.
  test('uploads every documented per-run artifact (recording.webm, manifest.json, events.jsonl)', () => {
    for (const filename of ['recording.webm', 'manifest.json', 'events.jsonl']) {
      expect(raw, `template upload step must include ${filename}`).toContain(filename);
    }
  });

  // Brand-rename drift coupling: the template is dropped into a consumer's
  // repo, where its artifact name and output paths become user-visible
  // strings in GitHub Actions UI and on the consumer's filesystem. The
  // pre-rename brand (`auto-demo`, `.auto_demo`) leaked here even after
  // PR #18 — caught and fixed alongside this test. Lock both spellings.
  // The template's *filename* is intentionally preserved (consumers may
  // already link by URL); the brand inside the body is what counts.
  test('no stale auto-demo / auto_demo brand strings in template body', () => {
    expect(raw, 'template body must not contain `.auto_demo` paths').not.toMatch(/\.auto_demo/u);
    expect(raw, 'template body must not contain `auto-demo-` artifact prefixes').not.toMatch(/auto-demo-\$\{\{/u);
  });

  // Doctrine drift: README's "## CI integration" section embeds a copy-paste
  // install snippet that names (a) the target workflow filename the consumer
  // creates, and (b) the artifact name pattern under which run outputs land.
  // Both are also written into the template body. PR #92 renamed both from
  // pre-rename strings to the current brand; this test locks them so a future
  // template edit that bumps the artifact name or path can't desync README.
  test('doctrine drift: README CI snippet target filename + artifact name match the template body', () => {
    const readme = readFileSync(resolve(here, '..', 'README.md'), 'utf8');

    // The template body declares an artifact name via `name: <prefix>-${{ github.sha }}`.
    // Pull the prefix and assert README's "Artifacts land under the workflow run as `<prefix>-<sha>`"
    // claim references the same one.
    const templatePrefix = /name:\s+([\w-]+)-\$\{\{\s+github\.sha\s+\}\}/u.exec(raw);
    expect(templatePrefix, 'template must declare an artifact `name: <prefix>-${{ github.sha }}`').not.toBeNull();
    const readmePrefix = /Artifacts land under the workflow run as `([\w-]+)-<sha>`/u.exec(readme);
    expect(readmePrefix, 'README must contain the "Artifacts land under the workflow run as `<prefix>-<sha>`" phrase').not.toBeNull();
    expect(readmePrefix![1], `README artifact prefix "${readmePrefix![1]}" must match template prefix "${templatePrefix![1]}"`).toBe(templatePrefix![1]);

    // The template's header comment suggests the target filename consumers
    // should use under .github/workflows/. Pull it and assert README's
    // copy-paste `cp ... .github/workflows/<name>` uses the same one.
    const templateTargetName = /Copy this file to `\.github\/workflows\/([\w.-]+\.yml)`/u.exec(raw);
    expect(templateTargetName, 'template header must suggest a `.github/workflows/<name>.yml` target').not.toBeNull();
    expect(readme, `README cp snippet must target the template-suggested filename "${templateTargetName![1]}"`)
      .toContain(`.github/workflows/${templateTargetName![1]}`);
  });

  test('contains no hardcoded credential literals', () => {
    const lines = raw.split('\n');
    const credentialKeyValue = /^(?!\s*#)[^#]*\b(api[_-]?key|token|password|secret)\b\s*[:=]\s*["']?[\w-]{16,}/iu;
    const obviousProviderKeys = [
      /\bsk-[\w-]{16,}\b/u, // OpenAI / Anthropic shapes
      /\bghp_[A-Za-z0-9]{20,}\b/u, // GitHub PAT
      /\bAKIA[0-9A-Z]{16}\b/u, // AWS access key
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
    ];

    for (const pattern of obviousProviderKeys) {
      expect(raw, `provider credential literal matched ${String(pattern)}`).not.toMatch(pattern);
    }

    const offender = lines.find(line => {
      // GitHub Actions's secrets context is the only safe way to surface a
      // credential — anything else is a literal baked into the file.
      if (line.includes('${{')) {
        return false;
      }

      return credentialKeyValue.test(line);
    });
    expect(offender, `suspected hardcoded credential: ${offender ?? ''}`).toBeUndefined();
  });
});
