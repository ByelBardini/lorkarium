import type { DesktopWindow } from '@/services/desktop-window';

type WindowCall = 'minimize' | 'toggleMaximize' | 'close';

/** The shell's window in specs: records the commands, and a spec maximizes it by hand
 *  (`resize(true)`) or makes every command refuse (`new DesktopWindowFake(true)`). */
export class DesktopWindowFake implements DesktopWindow {
  readonly calls: WindowCall[] = [];
  private maximized = false;
  private readonly listeners = new Set<(maximized: boolean) => void>();

  constructor(private readonly refusing = false) {}

  minimize(): Promise<void> {
    return this.record('minimize');
  }

  toggleMaximize(): Promise<void> {
    return this.record('toggleMaximize');
  }

  close(): Promise<void> {
    return this.record('close');
  }

  isMaximized(): Promise<boolean> {
    return Promise.resolve(this.maximized);
  }

  onMaximizedChange(listener: (maximized: boolean) => void): Promise<() => void> {
    this.listeners.add(listener);
    return Promise.resolve(() => this.listeners.delete(listener));
  }

  /** The window was resized into (`true`) or out of the maximized state. */
  resize(maximized: boolean): void {
    this.maximized = maximized;
    for (const listener of this.listeners) listener(maximized);
  }

  private record(call: WindowCall): Promise<void> {
    this.calls.push(call);
    if (this.refusing) return Promise.reject(new Error(`window refused ${call}`));
    return Promise.resolve();
  }
}
