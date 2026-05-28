// Selectors the mock must expose verbatim so the recorder drives it exactly as
// it drives the live `@elevenlabs/convai-widget-embed` in text-input mode. These
// aria-labels are the real widget's contract — the shipped hero flow-specs under
// docs/wranngle-hero-demo/flow-specs/ already target them. Changing one here
// silently breaks every flow written against the real widget, so widget.test.ts
// asserts these literals against those flow-specs (mock ↔ real-widget drift).

// The aria-label strings. Imported by widget-asset.ts's mock runtime so the
// SET (attribute assignment) and READ (querySelector) sides derive from one
// source — eliminating the four-place duplication that was previously a
// silent drift risk.
export const WIDGET_ARIA_LABELS = {
  input: 'Text message input',
  send: 'Send',
} as const;

export const WIDGET_SELECTORS = {
  root: 'elevenlabs-convai',
  input: `textarea[aria-label="${WIDGET_ARIA_LABELS.input}"]`,
  send: `button[aria-label="${WIDGET_ARIA_LABELS.send}"]`,
} as const;

export const widgetSelector = (part: keyof typeof WIDGET_SELECTORS): string =>
  part === 'root' ? WIDGET_SELECTORS.root : `${WIDGET_SELECTORS.root} ${WIDGET_SELECTORS[part]}`;
