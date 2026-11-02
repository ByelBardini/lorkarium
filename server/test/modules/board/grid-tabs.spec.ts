import type { BoardStateDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { unwatchGrid, watchGrid, type GridTabsDeps } from '../../../src/modules/board/grid-tabs';
import type { EnterGridRooms } from '../../../src/modules/scenes/scene-watch.service';
import { SceneNotFoundError } from '../../../src/modules/scenes/scenes.error';
import type { RealtimeSocket, RealtimeSocketData } from '../../../src/realtime/realtime-server';
import { sceneRoom } from '../../../src/realtime/rooms';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { TORRE_ID } from '../../support/library-factories';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';

/** The rooms and data of one connection; only what the tab handlers touch. */
class GridTabsSocketFake {
  readonly rooms = new Set<string>();
  data = { watchedSceneIds: new Map() } as unknown as RealtimeSocketData;

  async join(rooms: string[]): Promise<void> {
    for (const room of rooms) this.rooms.add(room);
  }

  async leave(room: string): Promise<void> {
    this.rooms.delete(room);
  }
}

/** The watch lets everyone in as a player; the snapshot answers, or refuses once `goesPrivate`. */
class GridTabsServicesFake {
  goesPrivate = false;

  readonly deps: GridTabsDeps = {
    sceneWatch: {
      watch: async (_userId, _campaignId, _sceneId, enter: EnterGridRooms) => enter('player'),
      groupSceneIdOf: async () => VHARN_SCENE_ID,
    },
    board: {
      snapshotFor: async (userId, campaignId, sceneId) => {
        if (this.goesPrivate) throw new SceneNotFoundError(campaignId, sceneId ?? '', userId);
        return { campaignId } as BoardStateDto;
      },
    },
  };
}

const WATCH_TORRE = { actionId: 'a1', campaignId: VHARN_ID, sceneId: TORRE_ID };

describe('grid tabs of a connection', () => {
  let socket: GridTabsSocketFake;
  let services: GridTabsServicesFake;

  beforeEach(() => {
    socket = new GridTabsSocketFake();
    services = new GridTabsServicesFake();
  });

  const asSocket = (): RealtimeSocket => socket as unknown as RealtimeSocket;

  it('watching the Torre enters its rooms, remembers the tab and answers the snapshot', async () => {
    const ack = await watchGrid(services.deps, asSocket(), BIA_ID, WATCH_TORRE);

    expect(ack).toEqual({ ok: true, state: { campaignId: VHARN_ID } });
    expect(socket.rooms.has(sceneRoom(VHARN_ID, TORRE_ID))).toBe(true);
    expect([...(socket.data.watchedSceneIds.get(VHARN_ID) ?? [])]).toEqual([TORRE_ID]);
  });

  it('a Torre gone private before the snapshot rethrows SCENE_NOT_FOUND and keeps no room nor tab', async () => {
    services.goesPrivate = true;

    const watch = watchGrid(services.deps, asSocket(), BIA_ID, WATCH_TORRE);

    await expect(watch).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' });
    expect([...socket.rooms]).toEqual([]);
    expect(socket.data.watchedSceneIds.size).toBe(0);
  });

  it('unwatching the group grid forgets the tab but keeps its rooms', async () => {
    const watchGroup = { ...WATCH_TORRE, sceneId: VHARN_SCENE_ID };
    await watchGrid(services.deps, asSocket(), BIA_ID, watchGroup);

    expect(await unwatchGrid(services.deps, asSocket(), BIA_ID, watchGroup)).toEqual({ ok: true });
    expect(socket.rooms.has(sceneRoom(VHARN_ID, VHARN_SCENE_ID))).toBe(true);
    expect(socket.data.watchedSceneIds.size).toBe(0);
  });

  it('unwatching a grid never watched keeps its rooms', async () => {
    const neverWatchedId = '8e4d3c2b-1a0f-4e9d-a8b7-6f5e4d3c2b1a';
    const room = sceneRoom(VHARN_ID, neverWatchedId);
    socket.rooms.add(room);

    const unwatch = { ...WATCH_TORRE, sceneId: neverWatchedId };
    expect(await unwatchGrid(services.deps, asSocket(), BIA_ID, unwatch)).toEqual({ ok: true });
    expect(socket.rooms.has(room)).toBe(true);
  });
});
