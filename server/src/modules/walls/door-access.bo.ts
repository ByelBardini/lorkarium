import type { DoorState } from '@lorkarium/game-core';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { DoorLockedError, InvalidDoorError } from './walls.error';
import type { PlacedWall } from './walls.mapper';

/** Who may open, close and lock a door: the master any door to any state; a player only opens
 *  and closes an unlocked door one of their tokens sees (`seen`, worked out by the caller with
 *  the game-core sight).
 *
 *  Example: `new DoorAccessBo(access).requireSet(door, 'open', doorSeenBy(context, door.wall))` */
export class DoorAccessBo {
  constructor(private readonly access: CampaignAccessBo) {}

  requireSet(door: PlacedWall, next: DoorState, seen: boolean): void {
    if (door.wall.kind !== 'door') {
      throw new InvalidDoorError(door.id, `is a ${door.wall.kind}; only a door opens and closes`);
    }
    if (this.access.isMaster()) return;
    if (next === 'locked') this.access.forbid(`lock door ${door.id}`, 'the master role');
    if (door.wall.doorState === 'locked') throw new DoorLockedError(door.id);
    if (!seen) this.access.forbid(`set door ${door.id} out of sight`, 'a token that sees it');
  }
}
