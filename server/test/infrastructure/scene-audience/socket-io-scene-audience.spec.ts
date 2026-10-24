import { describe, expect, it } from 'vitest';
import { SocketIoSceneAudience } from '../../../src/infrastructure/scene-audience/socket-io-scene-audience';
import type { RealtimeServer, RealtimeSocketData } from '../../../src/realtime/realtime-server';
import {
  campaignMastersRoom,
  campaignRoom,
  sceneAudienceRooms,
  sceneMastersRoom,
  sceneRoom,
} from '../../../src/realtime/rooms';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { TORRE_ID } from '../../support/library-factories';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';

const ESTRADA_ID = '5f6a7b8c-9d0e-4f1a-8b2c-4d5e6f7a8b9c';
const AT = '2026-10-23T20:00:00.000Z';

/** One connection as the adapter sees it: its rooms, its data and what it was told. */
class TableSocketFake {
  readonly told: Array<Readonly<{ name: string; payload: unknown }>> = [];
  readonly data: Pick<RealtimeSocketData, 'user' | 'watchedSceneIds'>;

  constructor(
    userId: string,
    readonly rooms: Set<string>,
    watched: readonly string[] = [],
  ) {
    const user = { id: userId, email: `${userId}@vharn.test`, name: userId, role: 'user' as const };
    this.data = { user, watchedSceneIds: new Map([[VHARN_ID, new Set(watched)]]) };
  }

  join(rooms: string | string[]): void {
    for (const room of [rooms].flat()) this.rooms.add(room);
  }

  leave(room: string): void {
    this.rooms.delete(room);
  }

  emit(name: string, payload: unknown): void {
    this.told.push({ name, payload });
  }
}

/** The `io.in(room).fetchSockets()` of the adapter over in-memory sockets. */
class RealtimeRoomsFake {
  constructor(private readonly sockets: readonly TableSocketFake[]) {}

  in(room: string) {
    return { fetchSockets: async () => this.sockets.filter((socket) => socket.rooms.has(room)) };
  }
}

function at(userId: string, isMaster: boolean, groupSceneId: string): Set<string> {
  const rooms = [
    campaignRoom(VHARN_ID),
    ...sceneAudienceRooms(VHARN_ID, groupSceneId, userId, isMaster),
  ];
  if (isMaster) rooms.push(campaignMastersRoom(VHARN_ID));
  return new Set(rooms);
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
    const ana = new TableSocketFake(ANA_ID, at(ANA_ID, true, VHARN_SCENE_ID));
    const bia = new TableSocketFake(BIA_ID, at(BIA_ID, false, VHARN_SCENE_ID));

    await audienceOver([ana, bia]).moveTable(moveToEstrada(false));

    expect([...ana.rooms].sort()).toEqual(
      [
        campaignRoom(VHARN_ID),
        campaignMastersRoom(VHARN_ID),
        ...sceneAudienceRooms(VHARN_ID, ESTRADA_ID, ANA_ID, true),
      ].sort(),
    );
    expect([...bia.rooms].sort()).toEqual(
      [campaignRoom(VHARN_ID), ...sceneAudienceRooms(VHARN_ID, ESTRADA_ID, BIA_ID, false)].sort(),
    );
    expect([...ana.told, ...bia.told]).toEqual([]);
  });

  it('a master keeps the old group grid she opened as a tab even when it is private', async () => {
    const ana = new TableSocketFake(ANA_ID, at(ANA_ID, true, VHARN_SCENE_ID), [VHARN_SCENE_ID]);

    await audienceOver([ana]).moveTable(moveToEstrada(false));

    expect(ana.rooms.has(sceneMastersRoom(VHARN_ID, VHARN_SCENE_ID))).toBe(true);
    expect(ana.told).toEqual([]);
  });

  it('a player keeps the old group grid she opened as a tab while it is public', async () => {
    const bia = new TableSocketFake(BIA_ID, at(BIA_ID, false, VHARN_SCENE_ID), [VHARN_SCENE_ID]);

    await audienceOver([bia]).moveTable(moveToEstrada(true));

    expect(bia.rooms.has(sceneRoom(VHARN_ID, VHARN_SCENE_ID))).toBe(true);
    expect(bia.rooms.has(sceneRoom(VHARN_ID, ESTRADA_ID))).toBe(true);
  });

  it('a player loses the private old group grid she opened as a tab, told scene:closed private', async () => {
    const bia = new TableSocketFake(BIA_ID, at(BIA_ID, false, VHARN_SCENE_ID), [VHARN_SCENE_ID]);

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
    const torreRooms = (userId: string, isMaster: boolean): Set<string> =>
      new Set([
        ...at(userId, isMaster, VHARN_SCENE_ID),
        ...sceneAudienceRooms(VHARN_ID, TORRE_ID, userId, isMaster),
      ]);
    const ana = new TableSocketFake(ANA_ID, torreRooms(ANA_ID, true), [TORRE_ID]);
    const bia = new TableSocketFake(BIA_ID, torreRooms(BIA_ID, false), [TORRE_ID]);
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
      ...at(ANA_ID, true, VHARN_SCENE_ID),
      ...sceneAudienceRooms(VHARN_ID, TORRE_ID, ANA_ID, true),
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
});
