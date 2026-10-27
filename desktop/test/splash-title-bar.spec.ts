// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { splashTitleBarOf, wireSplashTitleBar, type SplashTitleBar } from '../src/splash-title-bar';
import { ShellBridgeFake } from './support/shell-bridge-fake';
import { loadSplashDocument } from './support/splash-document';

const SPLASH_CSS = readFileSync(path.join(import.meta.dirname, '../src/splash.css'), 'utf8');

function ruleOf(selector: string): string {
  const start = SPLASH_CSS.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`splash.css sem a regra ${selector}; esperado "${selector} {"`);
  return SPLASH_CSS.slice(start, SPLASH_CSS.indexOf('}', start));
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('splash title bar', () => {
  let bridge: ShellBridgeFake;
  let titleBar: SplashTitleBar;
  let warnings: string[];

  beforeEach(() => {
    bridge = new ShellBridgeFake();
    titleBar = splashTitleBarOf(loadSplashDocument());
    warnings = [];
    wireSplashTitleBar(bridge, titleBar, (problem) => warnings.push(problem));
  });

  it('is the window bar, with the three window controls by name', () => {
    expect(titleBar.bar.getAttribute('aria-label')).toBe('Barra da janela');
    expect(titleBar.minimize.getAttribute('aria-label')).toBe('Minimizar');
    expect(titleBar.maximize.getAttribute('aria-label')).toBe('Maximizar');
    expect(titleBar.close.getAttribute('aria-label')).toBe('Fechar');
  });

  it.each([
    ['minimize', 'minimize'],
    ['maximize', 'toggle-maximize'],
    ['close', 'close'],
  ] as const)('the %s button asks the shell to %s the window', (button, call) => {
    titleBar[button].click();

    expect(bridge.calls).toEqual([call]);
  });

  it('keeps the window controls out of the Tab order, like the native ones', () => {
    const controls = [titleBar.minimize, titleBar.maximize, titleBar.close];

    expect(controls.map((control) => control.tabIndex)).toEqual([-1, -1, -1]);
  });

  it('warns instead of breaking when the shell refuses a control', async () => {
    bridge.refuseWindowControls('janela sumiu');

    titleBar.close.click();
    await settled();

    expect(warnings).toEqual(['controle da janela "close" falhou: janela sumiu']);
  });

  it('drags the window by the bar and never by its buttons', () => {
    expect(ruleOf('.splash-titlebar')).toMatch(/(^|[^-])app-region: drag/);
    expect(ruleOf('.splash-window-control')).toMatch(/(^|[^-])app-region: no-drag/);
  });

  it('measures 38 px, with 46 px wide controls', () => {
    expect(ruleOf('.splash-titlebar')).toContain('height: 38px');
    expect(ruleOf('.splash-window-control')).toContain('width: 46px');
  });
});
