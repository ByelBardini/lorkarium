import type { ShellBridge } from '../../src/shell-bridge';

/** Records what the splash asked of the shell and lets the spec push payloads as if Rust emitted them. */
export class ShellBridgeFake implements ShellBridge {
  readonly calls: string[] = [];
  private receiver: ((payload: unknown) => void) | null = null;
  private windowRefusal: string | null = null;

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

  minimizeWindow(): Promise<void> {
    return this.windowControl('minimize');
  }

  toggleMaximizeWindow(): Promise<void> {
    return this.windowControl('toggle-maximize');
  }

  closeWindow(): Promise<void> {
    return this.windowControl('close');
  }

  refuseWindowControls(reason: string): void {
    this.windowRefusal = reason;
  }

  emit(payload: unknown): void {
    if (this.receiver === null)
      throw new Error('ShellBridgeFake: a splash ainda não escuta "startup"');
    this.receiver(payload);
  }

  private async windowControl(call: string): Promise<void> {
    if (this.windowRefusal !== null) throw new Error(this.windowRefusal);
    this.calls.push(call);
  }
}
