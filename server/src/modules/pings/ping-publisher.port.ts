import type { BoardPingedDto } from '@lorkarium/contracts';

/** Sends a ping to the room of its grid. Adapter in `server/src/infrastructure/ping-publisher/`. */
export interface PingPublisherPort {
  /** `board:pinged` to everyone in the grid's room but the connection that pinged (it already
   *  drew its own). */
  pinged(event: BoardPingedDto, exceptConnectionId: string): void;
}
