// Selectors the mock must expose verbatim so the recorder drives it exactly as
// it drives the live `@elevenlabs/convai-widget-embed` in text-input mode. These
// aria-labels are the real widget's contract — the shipped hero flow-specs under
// docs/wranngle-hero-demo/flow-specs/ already target them. Changing one here
// silently breaks every flow written against the real widget, so widget.test.ts
// asserts these literals against those flow-specs (mock ↔ real-widget drift).

export const WIDGET_SELECTORS = {
  root: 'elevenlabs-convai',
  input: 'textarea[aria-label="Text message input"]',
  send: 'button[aria-label="Send"]',
} as const;

export const widgetSelector = (part: keyof typeof WIDGET_SELECTORS): string =>
  part === 'root' ? WIDGET_SELECTORS.root : `${WIDGET_SELECTORS.root} ${WIDGET_SELECTORS[part]}`;
