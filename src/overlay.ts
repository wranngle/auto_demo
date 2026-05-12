import type {Page} from 'playwright';

const overlayScript = String.raw`
(() => {
  const key = '__uiDemoRunnerOverlay';
  if (globalThis[key]) {
    return;
  }

  globalThis[key] = true;

  function mount() {
    if (document.getElementById('ui-demo-runner-cursor')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'ui-demo-runner-style';
    style.textContent = [
      '#ui-demo-runner-cursor {',
      '  position: fixed;',
      '  left: 0;',
      '  top: 0;',
      '  z-index: 2147483647;',
      '  width: 22px;',
      '  height: 22px;',
      '  pointer-events: none;',
      '  transform: translate3d(-80px, -80px, 0);',
      '  transition: transform 180ms ease;',
      '  filter: drop-shadow(0 2px 8px rgb(0 0 0 / 0.28));',
      '}',
      '#ui-demo-runner-cursor::before {',
      "  content: '';",
      '  position: absolute;',
      '  left: 0;',
      '  top: 0;',
      '  width: 0;',
      '  height: 0;',
      '  border-left: 18px solid white;',
      '  border-top: 12px solid transparent;',
      '  border-bottom: 12px solid transparent;',
      '}',
      '#ui-demo-runner-cursor::after {',
      "  content: '';",
      '  position: absolute;',
      '  left: 4px;',
      '  top: 4px;',
      '  width: 34px;',
      '  height: 34px;',
      '  border: 3px solid rgb(34 211 238 / 0.9);',
      '  border-radius: 999px;',
      '  opacity: 0;',
      '  transform: scale(0.45);',
      '}',
      '#ui-demo-runner-cursor.ui-demo-runner-pulse::after {',
      '  animation: ui-demo-runner-pulse 520ms ease-out;',
      '}',
      '@keyframes ui-demo-runner-pulse {',
      '  0% { opacity: 0.95; transform: scale(0.35); }',
      '  100% { opacity: 0; transform: scale(1.35); }',
      '}'
    ].join('\\n');

    const cursor = document.createElement('div');
    cursor.id = 'ui-demo-runner-cursor';
    document.documentElement.append(style, cursor);
  }

  globalThis.__uiDemoRunnerMove = (x, y) => {
    mount();
    document.getElementById('ui-demo-runner-cursor').style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0)';
  };

  globalThis.__uiDemoRunnerPulse = (x, y) => {
    mount();
    const cursor = document.getElementById('ui-demo-runner-cursor');
    cursor.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0)';
    cursor.classList.remove('ui-demo-runner-pulse');
    void cursor.offsetWidth;
    cursor.classList.add('ui-demo-runner-pulse');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, {once: true});
  } else {
    mount();
  }
})();
`;

export async function installOverlay(page: Page): Promise<void> {
  await page.addInitScript(overlayScript);
}

export async function moveCursor(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(({x, y}) => {
    const move: unknown = Reflect.get(globalThis, '__uiDemoRunnerMove');
    const isMoveCallback = (value: unknown): value is ((left: number, top: number) => void) => typeof value === 'function';
    if (isMoveCallback(move)) {
      move(x, y);
    }
  }, {x, y});
}

export async function pulseCursor(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(({x, y}) => {
    const pulse: unknown = Reflect.get(globalThis, '__uiDemoRunnerPulse');
    const isPulseCallback = (value: unknown): value is ((left: number, top: number) => void) => typeof value === 'function';
    if (isPulseCallback(pulse)) {
      pulse(x, y);
    }
  }, {x, y});
}
