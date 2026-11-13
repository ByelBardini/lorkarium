import type { FastifyBaseLogger } from 'fastify';
import type { CommandRateGuard } from '../../realtime/command-rate-guard';
import type { Realtime, RealtimeSocket } from '../../realtime/realtime-server';
import { createAccountPresenceGateway } from './account-presence.gateway';
import {
  AccountPresenceService,
  type AccountPresenceServiceDeps,
} from './account-presence.service';

export type AccountPresenceModuleOptions = Omit<AccountPresenceServiceDeps, 'announceFailed'> &
  Readonly<{
    realtime: Pick<Realtime, 'reauthenticate'>;
    /** The same bucket per connection as the session and board commands. */
    rate: CommandRateGuard;
    log: FastifyBaseLogger;
  }>;

/** `service` is also the sessions module's `TableOpenedPort` and what the direct messages read
 *  to know whether someone is visibly online. */
export type AccountPresenceModule = Readonly<{
  gateway: (socket: RealtimeSocket) => void;
  service: AccountPresenceService;
}>;

/** Wires the account's presence: the service over its registry and its Socket.IO edge.
 *
 *  Example: `realtime.onConnection(createAccountPresenceModule(options).gateway)` */
export function createAccountPresenceModule(
  options: AccountPresenceModuleOptions,
): AccountPresenceModule {
  const { realtime, rate, log, ...serviceDeps } = options;
  const announceFailed = (error: unknown): void => {
    log.error({ err: error }, 'a presence change did not reach the friends');
  };
  const service = new AccountPresenceService({ ...serviceDeps, announceFailed });
  const gateway = createAccountPresenceGateway({ presence: service, realtime, rate, log });
  return { gateway, service };
}
