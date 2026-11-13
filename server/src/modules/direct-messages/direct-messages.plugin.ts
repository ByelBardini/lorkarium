import type { FastifyBaseLogger } from 'fastify';
import type { CommandRateGuard } from '../../realtime/command-rate-guard';
import type { Realtime, RealtimeSocket } from '../../realtime/realtime-server';
import { createDirectMessagesGateway } from './direct-messages.gateway';
import { DirectMessagesService, type DirectMessagesServiceDeps } from './direct-messages.service';

export type DirectMessagesModuleOptions = DirectMessagesServiceDeps &
  Readonly<{
    realtime: Pick<Realtime, 'reauthenticate'>;
    /** Built with `DM_RATE`, never the board's shared guard. */
    sendRate: CommandRateGuard;
    /** Built with `DM_TYPING_RATE`. */
    typingRate: CommandRateGuard;
    log: FastifyBaseLogger;
  }>;

/** `service` is also a `FriendsChangedPort`: it forgets the friendships it remembers. */
export type DirectMessagesModule = Readonly<{
  gateway: (socket: RealtimeSocket) => void;
  service: DirectMessagesService;
}>;

/** Wires the direct messages: the service (no PO, nothing saved) and its Socket.IO edge.
 *
 *  Example: `realtime.onConnection(createDirectMessagesModule(options).gateway)` */
export function createDirectMessagesModule(
  options: DirectMessagesModuleOptions,
): DirectMessagesModule {
  const { realtime, sendRate, typingRate, log, ...serviceDeps } = options;
  const service = new DirectMessagesService(serviceDeps);
  const deps = { directMessages: service, realtime, sendRate, typingRate, log };
  return { gateway: createDirectMessagesGateway(deps), service };
}
