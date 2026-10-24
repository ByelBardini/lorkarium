import type { BoardPingedDto } from '@lorkarium/contracts';

/** The pings that reach one grid tab: ephemeral events, so nothing is kept — whoever listens
 *  now hears them, and a ping with no listener is gone (it is not board state). */
export type PingFeed = Readonly<{
  push: (ping: BoardPingedDto) => void;
  /** Starts listening; the function returned stops it. */
  subscribe: (listener: (ping: BoardPingedDto) => void) => () => void;
}>;

/** One feed per tab, created beside its board and interaction.
 *
 *  Example: `const stop = tab.pings.subscribe((ping) => renderer.showPing(markOf(ping)))` */
export function createPingFeed(): PingFeed {
  const listeners = new Set<(ping: BoardPingedDto) => void>();
  return {
    push: (ping) => {
      for (const listener of [...listeners]) listener(ping);
    },
    subscribe: (listener) => {
      const own = (ping: BoardPingedDto): void => listener(ping);
      listeners.add(own);
      return () => void listeners.delete(own);
    },
  };
}
