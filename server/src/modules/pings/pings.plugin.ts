import type { ClockPort } from '../auth/clock.port';
import type { MembershipReader } from '../campaigns/cached-memberships';
import type { GridAudiencePort } from './grid-audience.port';
import type { PingPublisherPort } from './ping-publisher.port';
import { PingsService } from './pings.service';

export type PingsModuleOptions = Readonly<{
  /** Shared by the board modules: the memberships remembered by the campaigns module. */
  members: MembershipReader;
  audience: GridAudiencePort;
  publisher: PingPublisherPort;
  clock: ClockPort;
}>;

export type PingsModule = Readonly<{ service: PingsService }>;

/** Wires the pings module; its edge is the board gateway, which receives this service.
 *
 *  Example: `const pings = createPingsModule({ members, audience, publisher, clock }).service` */
export function createPingsModule(options: PingsModuleOptions): PingsModule {
  return { service: new PingsService(options) };
}
