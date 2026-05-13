export function parseInteger(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Expected a non-negative integer, received ${value}`);
  }
  return Number.parseInt(value, 10);
}

export function parseSpeed(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 8) {
    throw new Error(`Expected speed > 0 and <= 8, received ${value}`);
  }
  return parsed;
}

export function parseViewport(value: string): {width: number; height: number} {
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) {
    throw new Error(`Invalid viewport "${value}" — expected format WxH e.g. 1280x720`);
  }
  const width = Number.parseInt(match[1]!, 10);
  const height = Number.parseInt(match[2]!, 10);
  if (width < 320 || height < 240) {
    throw new Error(`Viewport too small: ${width}x${height} — minimum 320x240`);
  }
  return {width, height};
}
