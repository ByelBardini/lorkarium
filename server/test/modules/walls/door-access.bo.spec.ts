import { describe, expect, it } from 'vitest';
import {
  CampaignAccessBo,
  type CampaignRole,
} from '../../../src/modules/campaigns/campaign-access.bo';
import { DoorAccessBo } from '../../../src/modules/walls/door-access.bo';
import { placedWallOf } from '../../../src/modules/walls/walls.mapper';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { CELL_DOOR_ID, cellDoorPo, northWallPo } from '../../support/walls-factories';

function doorsFor(userId: string, role: CampaignRole): DoorAccessBo {
  return new DoorAccessBo(new CampaignAccessBo({ campaignId: VHARN_ID, userId, role }));
}

const CLOSED = placedWallOf(cellDoorPo());
const LOCKED = placedWallOf(cellDoorPo({ doorState: 'locked' }));

describe('DoorAccessBo', () => {
  it.each(['open', 'closed', 'locked'] as const)(
    'the master sets a door %s even out of sight',
    (state) => {
      expect(() => doorsFor(ANA_ID, 'master').requireSet(LOCKED, state, false)).not.toThrow();
    },
  );

  it.each(['open', 'closed'] as const)('a player sets a door they see %s', (state) => {
    expect(() => doorsFor(BIA_ID, 'player').requireSet(CLOSED, state, true)).not.toThrow();
  });

  it('a player opening a locked door is refused with DOOR_LOCKED citing the door', () => {
    expect(() => doorsFor(BIA_ID, 'player').requireSet(LOCKED, 'open', true)).toThrow(
      expect.objectContaining({
        code: 'DOOR_LOCKED',
        message: expect.stringContaining(CELL_DOOR_ID),
      }),
    );
  });

  it('a player locking a door is refused with FORBIDDEN (lock door X)', () => {
    expect(() => doorsFor(BIA_ID, 'player').requireSet(CLOSED, 'locked', true)).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: expect.stringContaining(`lock door ${CELL_DOOR_ID}`),
      }),
    );
  });

  it('a player setting a door none of their tokens sees is refused with FORBIDDEN (out of sight)', () => {
    expect(() => doorsFor(BIA_ID, 'player').requireSet(CLOSED, 'open', false)).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: expect.stringContaining(`door ${CELL_DOOR_ID} out of sight`),
      }),
    );
  });

  it('setting a wall that is not a door is INVALID_DOOR citing its kind, even for the master', () => {
    const plain = placedWallOf(northWallPo());
    expect(() => doorsFor(ANA_ID, 'master').requireSet(plain, 'open', true)).toThrow(
      expect.objectContaining({
        code: 'INVALID_DOOR',
        message: expect.stringContaining('is a wall'),
      }),
    );
  });
});
