import type { DiceRolledDto, DiceRolledSecretlyDto } from '@lorkarium/contracts';
import type { DicePublisherPort } from '../../modules/dice/dice-publisher.port';
import type { DiceAudience } from '../../modules/dice/dice-roll.bo';
import type { RealtimeServer } from '../../realtime/realtime-server';
import { campaignMastersRoom, campaignRoom, campaignUserRoom } from '../../realtime/rooms';

/** The dice events over the table's rooms: a public roll to the table; a masters-only one to the
 *  masters' room and the roller's own, and the notice to the table except those rooms (a socket
 *  in several of them still gets each event once).
 *
 *  Example: `new SocketIoDicePublisher(realtime.io).rolled(event, { kind: 'table' })` */
export class SocketIoDicePublisher implements DicePublisherPort {
  constructor(private readonly io: RealtimeServer) {}

  rolled(event: DiceRolledDto, audience: DiceAudience): void {
    this.io.to(roomsOf(event.campaignId, audience)).emit('dice:rolled', event);
  }

  rolledSecretly(notice: DiceRolledSecretlyDto, audience: DiceAudience): void {
    const { campaignId } = notice;
    const told = this.io.to(campaignRoom(campaignId)).except(roomsOf(campaignId, audience));
    told.emit('dice:rolledSecretly', notice);
  }
}

function roomsOf(campaignId: string, audience: DiceAudience): string[] {
  if (audience.kind === 'table') return [campaignRoom(campaignId)];
  const own = audience.userIds.map((userId) => campaignUserRoom(campaignId, userId));
  return [campaignMastersRoom(campaignId), ...own];
}
