import type {Page} from 'playwright';
import type {DemoPolish} from './types.js';

type OverlayConfig = {
  cursorStyle: 'modern' | 'classic' | 'none';
  accentColor: string;
  moveMs: number;
  pulseMs: number;
  actionRailEnabled: boolean;
  captionsEnabled: boolean;
  captionPosition: 'top' | 'bottom';
};

type ZoomOptions = {
  x: number;
  y: number;
  scale: number;
  durationMs: number;
};

type AnnotationOptions = {
  kind: 'arrow' | 'callout' | 'box';
  x: number;
  y: number;
  text?: string;
  color?: string;
};

const defaultOverlayConfig: OverlayConfig = {
  cursorStyle: 'modern',
  accentColor: '#ff5f00',
  moveMs: 220,
  pulseMs: 460,
  actionRailEnabled: false,
  captionsEnabled: true,
  captionPosition: 'bottom',
};

export async function installOverlay(page: Page, polish: DemoPolish | undefined): Promise<void> {
  const config = normalizeOverlayConfig(polish);

  await page.addInitScript((runtimeConfig: OverlayConfig) => {
    const key = '__uiDemoRunnerOverlay';
    if (Reflect.get(globalThis, key)) {
      return;
    }

    Reflect.set(globalThis, key, true);

    const svgCursor = `
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M5 3.5 26.5 17 17.2 19.2 12.4 29 9.4 27.5 13.7 18.4 5 23.5Z"
          fill="#12111a" stroke="#fcfaf5" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M17.2 19.2 12.4 29" stroke="${runtimeConfig.accentColor}" stroke-width="2.3" stroke-linecap="round"/>
      </svg>`;

    const classicCursor = `
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M4 3 25 16 16 18 11 29 8 27 12.6 17.6 4 22Z"
          fill="#fcfaf5" stroke="#12111a" stroke-width="2" stroke-linejoin="round"/>
      </svg>`;

    function mount() {
      if (document.querySelector('#ui-demo-runner-style')) {
        return;
      }

      const style = document.createElement('style');
      style.id = 'ui-demo-runner-style';
      style.textContent = [
        ':root {',
        `  --ui-demo-runner-accent: ${runtimeConfig.accentColor};`,
        `  --ui-demo-runner-move-ms: ${runtimeConfig.moveMs}ms;`,
        `  --ui-demo-runner-pulse-ms: ${runtimeConfig.pulseMs}ms;`,
        '}',
        '#ui-demo-runner-cursor {',
        '  position: fixed;',
        '  left: 0;',
        '  top: 0;',
        '  z-index: 2147483647;',
        '  width: 30px;',
        '  height: 30px;',
        '  pointer-events: none;',
        '  transform: translate3d(-96px, -96px, 0);',
        '  transition: transform var(--ui-demo-runner-move-ms) cubic-bezier(.16, 1, .3, 1);',
        '  filter: drop-shadow(0 10px 18px rgb(0 0 0 / .24));',
        '}',
        '#ui-demo-runner-cursor svg {',
        '  display: block;',
        '  width: 100%;',
        '  height: 100%;',
        '}',
        '#ui-demo-runner-cursor::after {',
        '  content: \'\';',
        '  position: absolute;',
        '  left: 7px;',
        '  top: 7px;',
        '  width: 28px;',
        '  height: 28px;',
        '  border: 2px solid color-mix(in srgb, var(--ui-demo-runner-accent) 80%, white 20%);',
        '  border-radius: 999px;',
        '  box-shadow: 0 0 0 5px color-mix(in srgb, var(--ui-demo-runner-accent) 18%, transparent);',
        '  opacity: 0;',
        '  transform: scale(.45);',
        '}',
        '#ui-demo-runner-cursor.ui-demo-runner-pulse::after {',
        '  animation: ui-demo-runner-pulse var(--ui-demo-runner-pulse-ms) ease-out;',
        '}',
        '#ui-demo-runner-cursor.ui-demo-runner-hidden {',
        '  display: none;',
        '}',
        '@keyframes ui-demo-runner-pulse {',
        '  0% { opacity: .96; transform: scale(.34); }',
        '  100% { opacity: 0; transform: scale(1.55); }',
        '}',
        '#ui-demo-runner-caption {',
        '  position: fixed;',
        runtimeConfig.captionPosition === 'top' ? '  top: 18px;' : '  bottom: 18px;',
        '  left: 50%;',
        '  z-index: 2147483646;',
        '  max-width: min(920px, calc(100vw - 48px));',
        '  transform: translate3d(-50%, 12px, 0);',
        '  opacity: 0;',
        '  pointer-events: none;',
        '  padding: 10px 14px;',
        '  border: 1px solid rgb(252 250 245 / .2);',
        '  border-radius: 9px;',
        '  background: rgb(18 17 26 / .86);',
        '  color: #fcfaf5;',
        '  box-shadow: 0 18px 50px rgb(0 0 0 / .24);',
        '  font: 500 14px/1.45 Inter, system-ui, sans-serif;',
        '  letter-spacing: 0;',
        '  transition: opacity 180ms ease, transform 220ms cubic-bezier(.16, 1, .3, 1);',
        '}',
        '#ui-demo-runner-caption.ui-demo-runner-visible {',
        '  opacity: 1;',
        '  transform: translate3d(-50%, 0, 0);',
        '}',
        '#ui-demo-runner-rail {',
        '  position: fixed;',
        '  left: 14px;',
        '  right: 14px;',
        '  top: 14px;',
        '  z-index: 2147483645;',
        '  display: flex;',
        '  flex-wrap: wrap;',
        '  gap: 5px;',
        '  align-items: flex-start;',
        '  max-height: 54px;',
        '  overflow: hidden;',
        '  pointer-events: none;',
        '  font: 600 10px/1.2 \'JetBrains Mono\', ui-monospace, monospace;',
        '  letter-spacing: 0;',
        '}',
        '#ui-demo-runner-rail.ui-demo-runner-hidden {',
        '  display: none;',
        '}',
        '.ui-demo-runner-chip {',
        '  max-width: 150px;',
        '  overflow: hidden;',
        '  text-overflow: ellipsis;',
        '  white-space: nowrap;',
        '  padding: 5px 7px;',
        '  border: 1px solid rgb(252 250 245 / .14);',
        '  border-radius: 6px;',
        '  background: rgb(18 17 26 / .52);',
        '  color: rgb(252 250 245 / .72);',
        '  box-shadow: 0 10px 24px rgb(0 0 0 / .16);',
        '}',
        '.ui-demo-runner-chip.ui-demo-runner-active {',
        '  border-color: color-mix(in srgb, var(--ui-demo-runner-accent) 72%, white 28%);',
        '  background: color-mix(in srgb, var(--ui-demo-runner-accent) 72%, #12111a 28%);',
        '  color: #fcfaf5;',
        '}',
        'body.ui-demo-runner-zoomable {',
        '  transform-origin: 50% 50%;',
        '  will-change: transform;',
        '}',
      ].join('\n');

      const cursor = document.createElement('div');
      cursor.id = 'ui-demo-runner-cursor';
      cursor.className = runtimeConfig.cursorStyle === 'none' ? 'ui-demo-runner-hidden' : '';
      cursor.innerHTML = runtimeConfig.cursorStyle === 'classic' ? classicCursor : svgCursor;

      const caption = document.createElement('div');
      caption.id = 'ui-demo-runner-caption';

      const rail = document.createElement('div');
      rail.id = 'ui-demo-runner-rail';
      rail.className = runtimeConfig.actionRailEnabled ? '' : 'ui-demo-runner-hidden';

      document.documentElement.append(style, rail, caption, cursor);
      document.body?.classList.add('ui-demo-runner-zoomable');
    }

    Reflect.set(globalThis, '__uiDemoRunnerMove', (x: number, y: number) => {
      mount();
      const cursor = document.querySelector<HTMLElement>('#ui-demo-runner-cursor');
      if (cursor !== null) {
        cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
    });

    Reflect.set(globalThis, '__uiDemoRunnerPulse', (x: number, y: number) => {
      mount();
      const cursor = document.querySelector<HTMLElement>('#ui-demo-runner-cursor');
      if (cursor === null) {
        return;
      }

      cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      cursor.classList.remove('ui-demo-runner-pulse');
      void cursor.offsetWidth;
      cursor.classList.add('ui-demo-runner-pulse');
    });

    Reflect.set(globalThis, '__uiDemoRunnerCaption', (text: string) => {
      mount();
      if (!runtimeConfig.captionsEnabled) {
        return;
      }

      const caption = document.querySelector<HTMLElement>('#ui-demo-runner-caption');
      if (caption === null) {
        return;
      }

      caption.textContent = text;
      caption.classList.toggle('ui-demo-runner-visible', text.length > 0);
    });

    Reflect.set(globalThis, '__uiDemoRunnerRail', (labels: string[]) => {
      mount();
      const rail = document.querySelector<HTMLElement>('#ui-demo-runner-rail');
      if (rail === null || !runtimeConfig.actionRailEnabled) {
        return;
      }

      rail.replaceChildren(...labels.map((label, index) => {
        const chip = document.createElement('div');
        chip.className = 'ui-demo-runner-chip';
        chip.dataset.index = String(index);
        chip.textContent = `${index + 1}. ${label}`;
        return chip;
      }));
    });

    Reflect.set(globalThis, '__uiDemoRunnerActive', (index: number) => {
      mount();
      for (const chip of document.querySelectorAll('.ui-demo-runner-chip')) {
        chip.classList.toggle('ui-demo-runner-active', chip instanceof HTMLElement && chip.dataset.index === String(index));
      }
    });

    Reflect.set(globalThis, '__uiDemoRunnerZoom', ({x, y, scale, durationMs}: ZoomOptions) => {
      mount();
      document.body.classList.add('ui-demo-runner-zoomable');
      document.body.style.transition = `transform ${durationMs}ms cubic-bezier(.16, 1, .3, 1)`;
      document.body.style.transformOrigin = `${x}px ${y}px`;
      document.body.style.transform = `scale(${scale})`;
    });

    Reflect.set(globalThis, '__uiDemoRunnerResetZoom', (durationMs: number) => {
      mount();
      document.body.style.transition = `transform ${durationMs}ms cubic-bezier(.16, 1, .3, 1)`;
      document.body.style.transformOrigin = '50% 50%';
      document.body.style.transform = 'scale(1)';
    });

    Reflect.set(globalThis, '__uiDemoRunnerAnnotate', (options: AnnotationOptions) => {
      mount();
      let layer = document.querySelector<HTMLElement>('#ui-demo-runner-annotation-layer');
      if (layer === null) {
        layer = document.createElement('div');
        layer.id = 'ui-demo-runner-annotation-layer';
        layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483644;';
        document.documentElement.append(layer);
      }
      layer.replaceChildren();
      const accent = options.color ?? runtimeConfig.accentColor;

      if (options.kind === 'arrow') {
        // 80x80 SVG with a diagonal arrow pointing to its bottom-right corner.
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        arrow.setAttribute('width', '120');
        arrow.setAttribute('height', '120');
        arrow.setAttribute('viewBox', '0 0 120 120');
        arrow.style.cssText = `position:fixed;left:${options.x - 100}px;top:${options.y - 100}px;`;
        arrow.innerHTML =
          `<defs><marker id="ah" markerWidth="14" markerHeight="14" refX="6" refY="6" orient="auto">` +
          `<path d="M0,0 L12,6 L0,12 Z" fill="${accent}"/></marker></defs>` +
          `<line x1="10" y1="10" x2="100" y2="100" stroke="${accent}" stroke-width="5" marker-end="url(#ah)" />`;
        layer.append(arrow);
        if (options.text) {
          const label = document.createElement('div');
          label.textContent = options.text;
          label.style.cssText =
            `position:fixed;left:${Math.max(0, options.x - 280)}px;top:${Math.max(0, options.y - 110)}px;` +
            `padding:8px 12px;background:rgb(18 17 26 / .9);color:#fcfaf5;` +
            `border:1px solid ${accent};border-radius:6px;font:600 14px/1.2 Inter,system-ui,sans-serif;`;
          layer.append(label);
        }
        return;
      }

      if (options.kind === 'box') {
        const box = document.createElement('div');
        box.style.cssText =
          `position:fixed;left:${options.x - 60}px;top:${options.y - 32}px;width:120px;height:64px;` +
          `border:3px solid ${accent};border-radius:6px;box-shadow:0 0 0 2px rgb(0 0 0 / .25);`;
        layer.append(box);
        if (options.text) {
          const label = document.createElement('div');
          label.textContent = options.text;
          label.style.cssText =
            `position:fixed;left:${options.x - 60}px;top:${options.y + 38}px;padding:6px 10px;` +
            `background:rgb(18 17 26 / .88);color:#fcfaf5;border-radius:4px;` +
            `font:500 13px/1.3 Inter,system-ui,sans-serif;max-width:240px;`;
          layer.append(label);
        }
        return;
      }

      // callout
      const callout = document.createElement('div');
      callout.style.cssText =
        `position:fixed;left:${options.x}px;top:${Math.max(0, options.y - 76)}px;` +
        `max-width:240px;padding:12px 14px;` +
        `background:rgb(18 17 26 / .92);color:#fcfaf5;border:2px solid ${accent};border-radius:8px;` +
        `box-shadow:0 12px 36px rgb(0 0 0 / .35);` +
        `font:500 14px/1.4 Inter,system-ui,sans-serif;`;
      callout.textContent = options.text ?? '';
      layer.append(callout);
    });

    Reflect.set(globalThis, '__uiDemoRunnerHideAnnotation', () => {
      mount();
      const layer = document.querySelector<HTMLElement>('#ui-demo-runner-annotation-layer');
      if (layer !== null) layer.replaceChildren();
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, {once: true});
    } else {
      mount();
    }
  }, config);
}

export async function setActionRail(page: Page, labels: string[]): Promise<void> {
  await page.evaluate(stepLabels => {
    const rail: unknown = Reflect.get(globalThis, '__uiDemoRunnerRail');
    const isRailCallback = (value: unknown): value is ((labels: string[]) => void) => typeof value === 'function';
    if (isRailCallback(rail)) {
      rail(stepLabels);
    }
  }, labels);
}

export async function setActiveAction(page: Page, index: number): Promise<void> {
  await page.evaluate(activeIndex => {
    const active: unknown = Reflect.get(globalThis, '__uiDemoRunnerActive');
    const isActiveCallback = (value: unknown): value is ((index: number) => void) => typeof value === 'function';
    if (isActiveCallback(active)) {
      active(activeIndex);
    }
  }, index);
}

export async function showCaption(page: Page, text: string): Promise<void> {
  await page.evaluate(captionText => {
    const caption: unknown = Reflect.get(globalThis, '__uiDemoRunnerCaption');
    const isCaptionCallback = (value: unknown): value is ((text: string) => void) => typeof value === 'function';
    if (isCaptionCallback(caption)) {
      caption(captionText);
    }
  }, text);
}

export async function clearCaption(page: Page): Promise<void> {
  await showCaption(page, '');
}

export async function smoothZoom(page: Page, options: ZoomOptions): Promise<void> {
  await page.evaluate(zoomOptions => {
    const zoom: unknown = Reflect.get(globalThis, '__uiDemoRunnerZoom');
    const isZoomCallback = (value: unknown): value is ((options: ZoomOptions) => void) => typeof value === 'function';
    if (isZoomCallback(zoom)) {
      zoom(zoomOptions);
    }
  }, options);
}

export async function resetZoom(page: Page, durationMs: number): Promise<void> {
  await page.evaluate(resetDurationMs => {
    const reset: unknown = Reflect.get(globalThis, '__uiDemoRunnerResetZoom');
    const isResetCallback = (value: unknown): value is ((durationMs: number) => void) => typeof value === 'function';
    if (isResetCallback(reset)) {
      reset(resetDurationMs);
    }
  }, durationMs);
}

export async function moveCursor(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(({x, y}) => {
    const move: unknown = Reflect.get(globalThis, '__uiDemoRunnerMove');
    const isMoveCallback = (value: unknown): value is ((x: number, y: number) => void) => typeof value === 'function';
    if (isMoveCallback(move)) {
      move(x, y);
    }
  }, {x, y});
}

export async function pulseCursor(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(({x, y}) => {
    const pulse: unknown = Reflect.get(globalThis, '__uiDemoRunnerPulse');
    const isPulseCallback = (value: unknown): value is ((x: number, y: number) => void) => typeof value === 'function';
    if (isPulseCallback(pulse)) {
      pulse(x, y);
    }
  }, {x, y});
}

export async function showAnnotation(page: Page, options: AnnotationOptions): Promise<void> {
  await page.evaluate(annotationOptions => {
    const show: unknown = Reflect.get(globalThis, '__uiDemoRunnerAnnotate');
    const isShowCallback = (value: unknown): value is ((options: AnnotationOptions) => void) => typeof value === 'function';
    if (isShowCallback(show)) {
      show(annotationOptions);
    }
  }, options);
}

export async function hideAnnotation(page: Page): Promise<void> {
  await page.evaluate(() => {
    const hide: unknown = Reflect.get(globalThis, '__uiDemoRunnerHideAnnotation');
    const isHideCallback = (value: unknown): value is (() => void) => typeof value === 'function';
    if (isHideCallback(hide)) {
      hide();
    }
  });
}

function normalizeOverlayConfig(polish: DemoPolish | undefined): OverlayConfig {
  return {
    cursorStyle: polish?.cursor?.style ?? defaultOverlayConfig.cursorStyle,
    accentColor: polish?.cursor?.accentColor ?? defaultOverlayConfig.accentColor,
    moveMs: polish?.cursor?.moveMs ?? defaultOverlayConfig.moveMs,
    pulseMs: polish?.cursor?.pulseMs ?? defaultOverlayConfig.pulseMs,
    actionRailEnabled: polish?.actionRail?.enabled ?? defaultOverlayConfig.actionRailEnabled,
    captionsEnabled: polish?.captions?.enabled ?? defaultOverlayConfig.captionsEnabled,
    captionPosition: polish?.captions?.position ?? defaultOverlayConfig.captionPosition,
  };
}
