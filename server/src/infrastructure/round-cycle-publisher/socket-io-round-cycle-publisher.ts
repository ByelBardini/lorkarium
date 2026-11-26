import type { RoundCyclesAnnouncedDto } from '@lorkarium/contracts';
import type {
  RoundCyclePublisherPort,
  RoundCyclesChange,
} from '../../modules/round-cycles/round-cycle-publisher.port';
import type { RealtimeServer } from '../../realtime/realtime-server';
import {
  campaignMastersRoom,
  campaignRoom,
  campaignUserRoom,
  sceneRoom,
} from '../../realtime/rooms';

/** Emits the table's round cycles to its rooms (spec §2.6, §3.16): the masters' list to the
 *  masters, each named member's list to their own room, and what everyone sees to the rest of
 *  the table. Every member gets one event per version. A spectator is in no user room, so they
 *  get the rest's list.
 *
 *  Example: `new SocketIoRoundCyclePublisher(realtime.io).roundCyclesChanged(change)` */
export class SocketIoRoundCyclePublisher implements RoundCyclePublisherPort {
  constructor(private readonly io: RealtimeServer) {}

  roundCyclesChanged(change: RoundCyclesChange): void {
    const { campaignId, version, at, cuts } = change;
    const base = { campaignId, version, at };
    const masters = campaignMastersRoom(campaignId);
    this.io.to(masters).emit('cycle:listChanged', { ...base, cycles: cuts.masters });
    const userRooms = cuts.members.map(({ userId }) => campaignUserRoom(campaignId, userId));
    cuts.members.forEach(({ cycles }, index) => {
      const room = userRooms[index] ?? '';
      this.io
        .to(room)
        .except(masters)
        .emit('cycle:listChanged', { ...base, cycles });
    });
    const rest = this.io.to(campaignRoom(campaignId)).except([masters, ...userRooms]);
    rest.emit('cycle:listChanged', { ...base, cycles: cuts.rest });
  }

  roundCyclesAnnounced(event: RoundCyclesAnnouncedDto): void {
    this.io.to(sceneRoom(event.campaignId, event.sceneId)).emit('cycle:announced', event);
  }
}
