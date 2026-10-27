import { describe, expect, it } from 'vitest';
import {
  campaignRoom,
  sceneAudienceRooms,
  sceneRoom,
  sceneUserRoom,
} from '../../src/realtime/rooms';
import { closeTab, hasTab, leaveGrid, type TableSocket } from '../../src/realtime/scene-tabs';
import { BIA_ID, VHARN_ID } from '../support/campaigns-factories';
import { TableSocketFake } from '../support/realtime-rooms-fakes';

const TORRE_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const ESTRADA_ID = '5f6a7b8c-9d0e-4f1a-8b2c-4d5e6f7a8b9c';
const AT = '2026-10-26T21:00:00.000Z';

// Bia at Vharn as a master, with the Estrada (the group grid) and the Torre (a tab) open.
function biaWithTorreTab(): TableSocketFake {
  const rooms = [
    campaignRoom(VHARN_ID),
    ...sceneAudienceRooms(VHARN_ID, ESTRADA_ID, BIA_ID, 'master'),
    ...sceneAudienceRooms(VHARN_ID, TORRE_ID, BIA_ID, 'master'),
  ];
  return new TableSocketFake(BIA_ID, new Set(rooms), [TORRE_ID]);
}

function asSocket(fake: TableSocketFake): TableSocket {
  return fake as unknown as TableSocket;
}

describe('scene tabs of a connection', () => {
  it('closeTab takes Bia out of every room of the Torre, forgets the tab and tells her why', () => {
    const bia = biaWithTorreTab();

    closeTab(asSocket(bia), { campaignId: VHARN_ID, sceneId: TORRE_ID, reason: 'private', at: AT });

    expect([...bia.rooms].some((room) => room.includes(TORRE_ID))).toBe(false);
    expect(bia.rooms.has(sceneRoom(VHARN_ID, ESTRADA_ID))).toBe(true);
    expect(hasTab(asSocket(bia), VHARN_ID, TORRE_ID)).toBe(false);
    expect(bia.told).toEqual([
      {
        name: 'scene:closed',
        payload: { campaignId: VHARN_ID, sceneId: TORRE_ID, reason: 'private', at: AT },
      },
    ]);
  });

  it('leaveGrid takes Bia out of the rooms of the Estrada and tells her nothing', () => {
    const bia = biaWithTorreTab();

    leaveGrid(asSocket(bia), VHARN_ID, ESTRADA_ID);

    expect(bia.rooms.has(sceneUserRoom(VHARN_ID, ESTRADA_ID, BIA_ID))).toBe(false);
    expect(bia.rooms.has(sceneRoom(VHARN_ID, TORRE_ID))).toBe(true);
    expect(bia.told).toEqual([]);
  });

  it('hasTab tells the Torre (a tab) from the Estrada (the group grid, open but no tab)', () => {
    const bia = asSocket(biaWithTorreTab());

    expect([hasTab(bia, VHARN_ID, TORRE_ID), hasTab(bia, VHARN_ID, ESTRADA_ID)]).toEqual([
      true,
      false,
    ]);
  });
});
