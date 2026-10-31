import type { SheetHostMessageDto } from '@lorkarium/contracts';
import type { SheetHostPort } from '@/sheet-sandbox/sheet-bridge-host';

type Listener = (event: { data: unknown }) => void;

/** The host's end of the sheet's `MessageChannel`: `fromFrame(data)` plays the frame's SDK,
 *  `sent` keeps what the host posted, `ofType` filters it.
 *
 *  Example: `port.fromFrame({ type: 'ready', requestId: '1' }); port.ofType('state')` */
export class SheetHostPortFake implements SheetHostPort {
  readonly sent: SheetHostMessageDto[] = [];
  started = false;
  closed = false;
  private readonly listeners = new Set<Listener>();

  postMessage(message: SheetHostMessageDto): void {
    this.sent.push(message);
  }
  addEventListener(_type: 'message', listener: Listener): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'message', listener: Listener): void {
    this.listeners.delete(listener);
  }
  start(): void {
    this.started = true;
  }
  close(): void {
    this.closed = true;
  }

  fromFrame(data: unknown): void {
    for (const listener of this.listeners) listener({ data });
  }

  ofType<T extends SheetHostMessageDto['type']>(
    type: T,
  ): Extract<SheetHostMessageDto, { type: T }>[] {
    return this.sent.filter(
      (message): message is Extract<SheetHostMessageDto, { type: T }> => message.type === type,
    );
  }
}
