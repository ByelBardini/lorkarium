import type { BoardPingedDto } from '@lorkarium/contracts';
import type { GridAudiencePort } from '../../src/modules/pings/grid-audience.port';
import type { PingPublisherPort } from '../../src/modules/pings/ping-publisher.port';

/** The grid rooms each connection is in, as `<campaignId>:<sceneId>`; `asked` keeps each look.
 *
 *  Example: `new GridAudienceFake().join('socket-ana', VHARN_ID, VHARN_SCENE_ID)` */
export class GridAudienceFake implements GridAudiencePort {
  readonly asked: string[] = [];
  private readonly rooms = new Map<string, Set<string>>();

  join(connectionId: string, campaignId: string, sceneId: string): this {
    const rooms = this.rooms.get(connectionId) ?? new Set<string>();
    rooms.add(`${campaignId}:${sceneId}`);
    this.rooms.set(connectionId, rooms);
    return this;
  }

  reaches(connectionId: string, campaignId: string, sceneId: string): boolean {
    this.asked.push(connectionId);
    return this.rooms.get(connectionId)?.has(`${campaignId}:${sceneId}`) ?? false;
  }
}

/** Every `board:pinged` sent, with the connection left out of it. */
export class PingPublisherFake implements PingPublisherPort {
  readonly sent: Array<{ event: BoardPingedDto; exceptConnectionId: string }> = [];

  pinged(event: BoardPingedDto, exceptConnectionId: string): void {
    this.sent.push({ event, exceptConnectionId });
  }
}
