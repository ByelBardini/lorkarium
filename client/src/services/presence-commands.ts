import { PRESENCE_EVENTS, type PresenceVisibilityDto } from '@lorkarium/contracts';
import type { RealtimeTransport } from './realtime-transport';

// Same patience as every realtime command.
const ACK_TIMEOUT_MS = 5000;

/** The account's own status over its socket.
 *
 *  Example: `presence.setVisibility('invisible')` */
export interface PresenceCommands {
  /** Fire and forget: a refusal or a lost ack is fixed by the next connection sending it again. */
  setVisibility(visibility: PresenceVisibilityDto): void;
}

/** `PresenceCommands` over the realtime transport; with the socket down it sends nothing.
 *
 *  Example: `new RealtimePresenceCommands(transport, () => crypto.randomUUID())` */
export class RealtimePresenceCommands implements PresenceCommands {
  constructor(
    private readonly transport: RealtimeTransport,
    private readonly newActionId: () => string,
  ) {}

  setVisibility(visibility: PresenceVisibilityDto): void {
    if (!this.transport.isConnected()) return;
    const command = { actionId: this.newActionId(), visibility };
    this.transport
      .emitWithAck(PRESENCE_EVENTS.setVisibility, command, ACK_TIMEOUT_MS)
      .catch(() => undefined);
  }
}
