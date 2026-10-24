import type { FastifyBaseLogger } from 'fastify';
import type { CommandRateGuard } from '../../realtime/command-rate-guard';
import type { Realtime, RealtimeSocket } from '../../realtime/realtime-server';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignsService } from '../campaigns/campaigns.service';
import type { SceneWatchService } from '../scenes/scene-watch.service';
import type { PresenceRegistryPort } from './presence-registry.port';
import type { SchedulerPort } from './scheduler.port';
import type { SessionPublisherPort } from './session-publisher.port';
import { createSessionsGateway } from './sessions.gateway';
import { TableSessionService } from './sessions.service';

export type SessionsModuleOptions = Readonly<{
  campaigns: Pick<CampaignsService, 'rosterOf' | 'campaignIdsOf'>;
  groupGrid: Pick<SceneWatchService, 'groupSceneIdOf' | 'castSceneIdOf'>;
  clock: ClockPort;
  registry: PresenceRegistryPort;
  scheduler: SchedulerPort;
  publisher: SessionPublisherPort;
  realtime: Pick<Realtime, 'reauthenticate'>;
  /** The same bucket per connection as the board commands. */
  rate: CommandRateGuard;
  log: FastifyBaseLogger;
}>;

/** `service` is also the profiles module's `ProfileChangedPort` (`session:memberUpdated`), the
 *  campaigns module's `CampaignChangedPort` (`session:campaignUpdated`/`campaignDeleted`) and
 *  its `MemberRoleChangedPort` (`session:memberUpdated` after moving the member's rooms). */
export type SessionsModule = Readonly<{
  gateway: (socket: RealtimeSocket) => void;
  service: TableSessionService;
}>;

/** Wires the live table session: the service over the presence ports, and its Socket.IO edge.
 *
 *  Example: `realtime.onConnection(createSessionsModule(options).gateway)` */
export function createSessionsModule(options: SessionsModuleOptions): SessionsModule {
  const { campaigns, clock, registry, scheduler, publisher } = options;
  const service = new TableSessionService({ campaigns, registry, scheduler, publisher, clock });
  const { groupGrid, realtime, rate, log } = options;
  const gateway = createSessionsGateway({ service, groupGrid, realtime, rate, log });
  return { gateway, service };
}
