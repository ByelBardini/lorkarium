import type { ShellBridge } from './shell-bridge';
import { readShellEvent } from './shell-events';
import { renderSplash, type SplashElements } from './splash-render';
import { INITIAL_SPLASH_VIEW, splashViewOf, type SplashView } from './splash-state';

/** Wires the splash: listens before asking the shell to start, so no event is lost, and retries on click.
 *
 *  Example: `await startSplash(new TauriShellBridge(), splashElementsOf(document), console.warn)` */
export async function startSplash(
  bridge: ShellBridge,
  elements: SplashElements,
  warn: (problem: string) => void,
): Promise<void> {
  let view: SplashView = INITIAL_SPLASH_VIEW;
  renderSplash(elements, view);
  await bridge.onStartupEvent((payload) => {
    const reading = readShellEvent(payload);
    if (reading.problem !== null) warn(reading.problem);
    view = splashViewOf(view, reading.event);
    renderSplash(elements, view);
  });
  elements.retry.addEventListener('click', () => void bridge.retryConnection());
  await bridge.beginStartup();
}
