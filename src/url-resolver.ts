import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function resolveTarget(reference: string, flowDir: string, baseUrl?: string): string {
  if (isUrl(reference)) {
    return reference;
  }

  if (baseUrl !== undefined && baseUrl.length > 0) {
    return new URL(reference, ensureTrailingSlash(baseUrl)).toString();
  }

  const candidate = resolve(flowDir, reference);
  if (existsSync(candidate)) {
    return pathToFileURL(candidate).toString();
  }

  return reference;
}

function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol.length > 0;
  } catch {
    return false;
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}
