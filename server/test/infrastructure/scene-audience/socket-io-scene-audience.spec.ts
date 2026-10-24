import { describe, expect, it } from 'vitest';
import { SocketIoSceneAudience } from '../../../src/infrastructure/scene-audience/socket-io-scene-audience';
import type { RealtimeServer } from '../../../src/realtime/realtime-server';
import {
  campaignMastersRoom,
  campaignRoom,
  campaignUserRoom,
  sceneAudienceRooms,
  sceneMastersRoom,
  sceneRoom,
  sceneUserRoom,
  type TableAudience,
} from '../../../src/realtime/rooms';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, DUDA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { TORRE_ID } from '../../support/library-factories';
import { RealtimeRoomsFake, TableSocketFake } from '../../support/realtime-rooms-fakes';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';

const ESTRADA_ID = '5f6a7b8c-9d0e-4f1a-8b2c-4d5e6f7a8b9c';
const AT = '2026-10-23T20:00:00.000Z';

// The rooms the session:join gives each audience at Vharn, with `groupSceneId` as the group grid.
function at(userId: string, audience: TableAudience, groupSceneId: string): Set<string> {
  const rooms = [
    campaignRoom(VHARN_ID),
    ...sceneAudienceRooms(VHARN_ID, groupSceneId, userId, audience),
  ];
  if (audience !== 'spectator') rooms.push(campaignUserRoom(VHARN_ID, userId));
  if (audience === 'master') rooms.push(campaignMastersRoom(VHARN_ID));
  return new Set(rooms);
}

// The Torre opened as a tab on top of the group grid of Vharn.
function torreRooms(userId: string, audience: TableAudience): Set<string> {
  return new Set([
    ...at(userId, audience, VHARN_SCENE_ID),
    ...sceneAudienceRooms(VHARN_ID, TORRE_ID, userId, audience),
  ]);
}

function audienceOver(sockets: readonly TableSocketFake[]): SocketIoSceneAudience {
  return new SocketIoSceneAudience(new RealtimeRoomsFake(sockets) as unknown as RealtimeServer);
}

function moveToEstrada(playersKeepTabs: boolean) {
  const previous = { sceneId: VHARN_SCENE_ID, playersKeepTabs };
  return { campaignId: VHARN_ID, sceneId: ESTRADA_ID, previous, at: AT };
}

describe('SocketIoSceneAudience', () => {
  it('moveTable puts Ana and Bia in the Estrada rooms (Ana in its masters room) and out of the Salão', async () => {
    const ana = new TableSocketFake(ANA_ID, at(ANA_ID, 'master', VHARN_SCENE_ID));
    const bia = new TableSocketFake(BIA_ID, at(BIA_ID, 'player', VHARN_SCENE_ID));

    await audienceOver([ana, bia]).moveTable(moveToEstrada(false));

    expect([...ana.rooms].sort()).toEqual([...at(ANA_ID, 'master', ESTRADA_ID)].sort());
    expect([...bia.rooms].sort()).toEqual([...at(BIA_ID, 'player', ESTRADA_ID)].sort());
    expect([...ana.told, ...bia.told]).toEqual([]);
  });

  it('a master keeps the old group grid she opened as a tab even when it is private', async () => {
    const ana = new TableSocketFake(ANA_ID, at(ANA_ID, 'master', VHARN_SCENE_ID), [VHARN_SCENE_ID]);

    await audienceOver([ana]).moveTable(moveToEstrada(false));

    expect(ana.rooms.has(sceneMastersRoom(VHARN_ID, VHARN_SCENE_ID))).toBe(true);
    expect(ana.told).toEqual([]);
  });

  it('a player keeps the old group grid she opened as a tab while it is public', async () => {
    const bia = new TableSocketFake(BIA_ID, at(BIA_ID, 'player', VHARN_SCENE_ID), [VHARN_SCENE_ID]);

    await audienceOver([bia]).moveTable(moveToEstrada(true));

    expect(bia.rooms.has(sceneRoom(VHARN_ID, VHARN_SCENE_ID))).toBe(true);
    expect(bia.rooms.has(sceneRoom(VHARN_ID, ESTRADA_ID))).toBe(true);
  });

  it('a player loses the private old group grid she opened as a tab, told scene:closed private', async () => {
    const bia = new TableSocketFake(BIA_ID, at(BIA_ID, 'player', VHARN_SCENE_ID), [VHARN_SCENE_ID]);

    await audienceOver([bia]).moveTable(moveToEstrada(false));

    expect(bia.rooms.has(sceneRoom(VHARN_ID, VHARN_SCENE_ID))).toBe(false);
    expect(bia.data.watchedSceneIds.has(VHARN_ID)).toBe(false);
    expect(bia.told).toEqual([
      {
        name: 'scene:closed',
        payload: { campaignId: VHARN_ID, sceneId: VHARN_SCENE_ID, reason: 'private', at: AT },
      },
    ]);
  });

  it('a table with no group grid before only enters the new one', async () => {
    const bia = new TableSocketFake(BIA_ID, new Set([campaignRoom(VHARN_ID)]));

    await audienceOver([bia]).moveTable({
      campaignId: VHARN_ID,
      sceneId: ESTRADA_ID,
      previous: null,
      at: AT,
    });

    expect(bia.rooms.has(sceneRoom(VHARN_ID, ESTRADA_ID))).toBe(true);
  });

  it('evict of the players leaves Ana in the Torre and takes Bia out, forgetting her tab', async () => {
    const ana = new TableSocketFake(ANA_ID, torreRooms(ANA_ID, 'master'), [TORRE_ID]);
    const bia = new TableSocketFake(BIA_ID, torreRooms(BIA_ID, 'player'), [TORRE_ID]);
    const eviction = { campaignId: VHARN_ID, sceneId: TORRE_ID, at: AT };

    await audienceOver([ana, bia]).evict({ ...eviction, audience: 'players', reason: 'private' });

    expect(ana.rooms.has(sceneRoom(VHARN_ID, TORRE_ID))).toBe(true);
    expect(bia.rooms.has(sceneRoom(VHARN_ID, TORRE_ID))).toBe(false);
    expect(bia.rooms.has(sceneRoom(VHARN_ID, VHARN_SCENE_ID))).toBe(true);
    expect(bia.data.watchedSceneIds.get(VHARN_ID)).toBeUndefined();
    expect(bia.told).toEqual([
      { name: 'scene:closed', payload: { ...eviction, reason: 'private' } },
    ]);
    expect(ana.told).toEqual([]);
  });

  it('evict of everyone takes the master out of the deleted Torre too', async () => {
    const rooms = new Set([
      ...at(ANA_ID, 'master', VHARN_SCENE_ID),
      ...sceneAudienceRooms(VHARN_ID, TORRE_ID, ANA_ID, 'master'),
    ]);
    const ana = new TableSocketFake(ANA_ID, rooms, [TORRE_ID]);

    await audienceOver([ana]).evict({
      campaignId: VHARN_ID,
      sceneId: TORRE_ID,
      audience: 'everyone',
      reason: 'deleted',
      at: AT,
    });

    expect([...ana.rooms].some((room) => room.startsWith(sceneRoom(VHARN_ID, TORRE_ID)))).toBe(
      false,
    );
    expect(ana.told).toMatchObject([{ name: 'scene:closed', payload: { reason: 'deleted' } }]);
  });

  describe('a spectator, told apart by the rooms of the join', () => {
    it('moveTable puts Duda only in the Estrada room, never in her own room there', async () => {
      const duda = new TableSocketFake(DUDA_ID, at(DUDA_ID, 'spectator', VHARN_SCENE_ID));

      await audienceOver([duda]).moveTable(moveToEstrada(false));

      expect([...duda.rooms].sort()).toEqual([...at(DUDA_ID, 'spectator', ESTRADA_ID)].sort());
      expect(duda.rooms.has(sceneUserRoom(VHARN_ID, ESTRADA_ID, DUDA_ID))).toBe(false);
    });

    it('evict of the players takes Duda out of the Torre, told scene:closed private', async () => {
      const duda = new TableSocketFake(DUDA_ID, torreRooms(DUDA_ID, 'spectator'), [TORRE_ID]);
      const eviction = { campaignId: VHARN_ID, sceneId: TORRE_ID, at: AT };

      await audienceOver([duda]).evict({ ...eviction, audience: 'players', reason: 'private' });

      expect(duda.rooms.has(sceneRoom(VHARN_ID, TORRE_ID))).toBe(false);
      expect(duda.told).toEqual([
        { name: 'scene:closed', payload: { ...eviction, reason: 'private' } },
      ]);
    });
  });
});
