import type { ShellBridge } from '../../src/shell-bridge';

/** Records what the splash asked of the shell and lets the spec push payloads as if Rust emitted them. */
export class ShellBridgeFake implements ShellBridge {
  readonly calls: string[] = [];
  private receiver: ((payload: unknown) => void) | null = null;

  async onStartupEvent(receive: (payload: unknown) => void): Promise<void> {
    this.calls.push('listen');
    this.receiver = receive;
  }

  async beginStartup(): Promise<void> {
    this.calls.push('begin');
  }

  async retryConnection(): Promise<void> {
    this.calls.push('retry');
  }

  emit(payload: unknown): void {
    if (this.receiver === null)
      throw new Error('ShellBridgeFake: a splash ainda não escuta "startup"');
    this.receiver(payload);
  }
}
