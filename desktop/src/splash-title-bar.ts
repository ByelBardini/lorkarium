import type { ShellBridge } from './shell-bridge';
import { requireElement } from './splash-render';

export type SplashTitleBar = {
  bar: HTMLElement;
  minimize: HTMLButtonElement;
  maximize: HTMLButtonElement;
  close: HTMLButtonElement;
};

type WindowControl = 'minimize' | 'maximize' | 'close';

/** The splash's own title bar (the window has no native frame), looked up by id from `index.html`.
 *
 *  Example: `const titleBar = splashTitleBarOf(document)` */
export function splashTitleBarOf(root: Document): SplashTitleBar {
  return {
    bar: requireElement(root, 'splash-titlebar'),
    minimize: requireElement(root, 'splash-minimize') as HTMLButtonElement,
    maximize: requireElement(root, 'splash-maximize') as HTMLButtonElement,
    close: requireElement(root, 'splash-close') as HTMLButtonElement,
  };
}

/** Sends each window control to the shell; a refused one is only reported, the splash keeps working.
 *
 *  Example: `wireSplashTitleBar(new TauriShellBridge(), splashTitleBarOf(document), console.warn)` */
export function wireSplashTitleBar(
  bridge: ShellBridge,
  titleBar: SplashTitleBar,
  warn: (problem: string) => void,
): void {
  const commands: Record<WindowControl, () => Promise<void>> = {
    minimize: () => bridge.minimizeWindow(),
    maximize: () => bridge.toggleMaximizeWindow(),
    close: () => bridge.closeWindow(),
  };
  for (const control of Object.keys(commands) as WindowControl[]) {
    bindControl(titleBar[control], control, commands[control], warn);
  }
}

function bindControl(
  button: HTMLButtonElement,
  control: WindowControl,
  command: () => Promise<void>,
  warn: (problem: string) => void,
): void {
  const report = (problem: unknown): void =>
    warn(`controle da janela "${control}" falhou: ${reasonOf(problem)}`);
  button.addEventListener('click', () => void command().catch(report));
}

function reasonOf(problem: unknown): string {
  return problem instanceof Error ? problem.message : String(problem);
}
