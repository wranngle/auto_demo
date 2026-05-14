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

  test('runs the auto_demo CLI in a recording step', () => {
    expect(raw).toMatch(/auto_demo\s+run\b/u);
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
