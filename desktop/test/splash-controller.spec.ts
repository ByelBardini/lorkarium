// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { startSplash } from '../src/splash-controller';
import { splashElementsOf, type SplashElements } from '../src/splash-render';
import { ShellBridgeFake } from './support/shell-bridge-fake';
import { loadSplashDocument } from './support/splash-document';

describe('startSplash', () => {
  let bridge: ShellBridgeFake;
  let elements: SplashElements;
  let warnings: string[];

  beforeEach(async () => {
    bridge = new ShellBridgeFake();
    elements = splashElementsOf(loadSplashDocument());
    warnings = [];
    await startSplash(bridge, elements, (problem) => warnings.push(problem));
  });

  it('listens to the shell before asking it to start, so no event is lost', () => {
    expect(bridge.calls).toEqual(['listen', 'begin']);
  });

  it('opens on the update search', () => {
    expect(elements.title.textContent).toBe('Procurando atualizações…');
  });

  it('draws each event the shell emits', () => {
    bridge.emit({ kind: 'offline' });

    expect(elements.title.textContent).toBe('Sem conexão');
    expect(elements.retry.hidden).toBe(false);
  });

  it('keeps the screen and warns when the payload is unreadable', () => {
    bridge.emit({ kind: 'connecting' });
    bridge.emit({ kind: 'rebooting' });

    expect(elements.title.textContent).toBe('Conectando…');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('rebooting');
  });

  it('asks the shell to retry when the button is clicked', () => {
    bridge.emit({ kind: 'offline' });

    elements.retry.click();

    expect(bridge.calls).toEqual(['listen', 'begin', 'retry']);
  });
});
