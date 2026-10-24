import type { PingCommandDto } from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { MembershipReader } from '../campaigns/cached-memberships';
import { memberAccessOf } from '../campaigns/member-access';
import { SceneNotFoundError } from '../scenes/scenes.error';
import type { GridAudiencePort } from './grid-audience.port';
import type { PingPublisherPort } from './ping-publisher.port';

export type PingsServiceDeps = Readonly<{
  members: MembershipReader;
  audience: GridAudiencePort;
  publisher: PingPublisherPort;
  clock: ClockPort;
}>;

/** The ping of a spot on a grid: ephemeral, so it writes nothing and moves no version. */
export class PingsService {
  constructor(private readonly deps: PingsServiceDeps) {}

  /** Sends the ping to the grid's room, except the connection that pinged. Being in that room is
   *  the proof of reaching the grid (the server put the connection there and takes it out when
   *  the access changes), so no query runs; outside it is SCENE_NOT_FOUND, never FORBIDDEN.
   *
   *  Example: `await pingsService.ping(user.id, campaignId, command, socket.id)` */
  async ping(
    userId: string,
    campaignId: string,
    command: PingCommandDto,
    connectionId: string,
  ): Promise<void> {
    const { sceneId, x, y } = command;
    await memberAccessOf(this.deps.members, campaignId, userId);
    if (!this.deps.audience.reaches(connectionId, campaignId, sceneId)) {
      throw new SceneNotFoundError(campaignId, sceneId, userId);
    }
    const at = this.deps.clock.now().toISOString();
    this.deps.publisher.pinged({ campaignId, sceneId, userId, x, y, at }, connectionId);
  }
}
