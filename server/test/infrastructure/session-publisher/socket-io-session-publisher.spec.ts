import type { SessionMemberUpdatedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { SocketIoSessionPublisher } from '../../../src/infrastructure/session-publisher/socket-io-session-publisher';
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
import { BIA_ID, DUDA_ID, QUELM_ID, VHARN_ID } from '../../support/campaigns-factories';
import { RealtimeRoomsFake, TableSocketFake } from '../../support/realtime-rooms-fakes';

const ESTRADA_ID = '5f6a7b8c-9d0e-4f1a-8b2c-4d5e6f7a8b9c';
const SALAO_ID = '6a7b8c9d-0e1f-4a2b-8c3d-5e6f7a8b9c0d';
const PANTANO_ID = '7b8c9d0e-1f2a-4b3c-8d4e-6f7a8b9c0d1e';
const AT = '2026-10-24T21:00:00.000Z';

// The rooms of one table for `audience`, with the grids open in `sceneIds`.
function roomsAt(
  campaignId: string,
  userId: string,
  audience: TableAudience,
  sceneIds: readonly string[],
): string[] {
  const grids = sceneIds.flatMap((id) => sceneAudienceRooms(campaignId, id, userId, audience));
  const own = audience === 'spectator' ? [] : [campaignUserRoom(campaignId, userId)];
  const masters = audience === 'master' ? [campaignMastersRoom(campaignId)] : [];
  return [campaignRoom(campaignId), ...own, ...masters, ...grids];
}

function memberUpdated(userId: string, role: TableAudience): SessionMemberUpdatedDto {
  const member = {
    ...{ userId, name: userId, username: userId, color: 'gold' as const, avatarId: null },
    ...{ bio: null, role, juggernaut: false, online: true, awaySince: null },
  };
  return { campaignId: VHARN_ID, version: 4, member, at: AT };
}

function publisherOver(sockets: readonly TableSocketFake[], journal: string[] = []) {
  const io = new RealtimeRoomsFake(sockets, journal);
  return { io, publisher: new SocketIoSessionPublisher(io as unknown as RealtimeServer) };
}

describe('SocketIoSessionPublisher.memberRoleChanged', () => {
  it('Duda promoted enters her room at Vharn and in each open grid of it (Estrada and Salão)', async () => {
    const rooms = roomsAt(VHARN_ID, DUDA_ID, 'spectator', [ESTRADA_ID, SALAO_ID]);
    const duda = new TableSocketFake(DUDA_ID, new Set(rooms));
    const { publisher } = publisherOver([duda]);

    const move = {
      campaignId: VHARN_ID,
      userId: DUDA_ID,
      audience: 'player' as const,
      closedSceneIds: [],
    };
    await publisher.memberRoleChanged(memberUpdated(DUDA_ID, 'player'), move);

    expect([...duda.rooms].sort()).toEqual(
      roomsAt(VHARN_ID, DUDA_ID, 'player', [ESTRADA_ID, SALAO_ID]).sort(),
    );
  });

  it('Duda promoted at Vharn keeps her rooms at Quelm as they were', async () => {
    const atQuelm = roomsAt(QUELM_ID, DUDA_ID, 'spectator', [PANTANO_ID]);
    const atVharn = roomsAt(VHARN_ID, DUDA_ID, 'spectator', [ESTRADA_ID]);
    const duda = new TableSocketFake(DUDA_ID, new Set([...atVharn, ...atQuelm]));
    const { publisher } = publisherOver([duda]);

    const move = {
      campaignId: VHARN_ID,
      userId: DUDA_ID,
      audience: 'player' as const,
      closedSceneIds: [],
    };
    await publisher.memberRoleChanged(memberUpdated(DUDA_ID, 'player'), move);

    expect(duda.rooms.has(campaignUserRoom(QUELM_ID, DUDA_ID))).toBe(false);
    expect(duda.rooms.has(sceneUserRoom(QUELM_ID, PANTANO_ID, DUDA_ID))).toBe(false);
    expect(duda.rooms.has(sceneRoom(QUELM_ID, PANTANO_ID))).toBe(true);
  });

  it('Bia moved to the spectators leaves her own rooms at Vharn, every tab of hers, and keeps the grids', async () => {
    const rooms = roomsAt(VHARN_ID, BIA_ID, 'player', [ESTRADA_ID, SALAO_ID]);
    const tabs = [
      new TableSocketFake(BIA_ID, new Set(rooms)),
      new TableSocketFake(BIA_ID, new Set(rooms)),
    ];
    const { publisher } = publisherOver(tabs);

    const move = {
      campaignId: VHARN_ID,
      userId: BIA_ID,
      audience: 'spectator' as const,
      closedSceneIds: [],
    };
    await publisher.memberRoleChanged(memberUpdated(BIA_ID, 'spectator'), move);

    const spectator = roomsAt(VHARN_ID, BIA_ID, 'spectator', [ESTRADA_ID, SALAO_ID]).sort();
    expect(tabs.map((tab) => [...tab.rooms].sort())).toEqual([spectator, spectator]);
  });

  it('the connections of others at the table stay in their rooms', async () => {
    const biaRooms = roomsAt(VHARN_ID, BIA_ID, 'player', [ESTRADA_ID]);
    const bia = new TableSocketFake(BIA_ID, new Set(biaRooms));
    const duda = new TableSocketFake(
      DUDA_ID,
      new Set(roomsAt(VHARN_ID, DUDA_ID, 'spectator', [ESTRADA_ID])),
    );
    const { publisher } = publisherOver([bia, duda]);

    const move = {
      campaignId: VHARN_ID,
      userId: DUDA_ID,
      audience: 'player' as const,
      closedSceneIds: [],
    };
    await publisher.memberRoleChanged(memberUpdated(DUDA_ID, 'player'), move);

    expect([...bia.rooms].sort()).toEqual([...biaRooms].sort());
  });

  it('the rooms move before the table hears memberUpdated, which goes to the room of Vharn', async () => {
    const journal: string[] = [];
    const rooms = roomsAt(VHARN_ID, DUDA_ID, 'spectator', [ESTRADA_ID]);
    const duda = new TableSocketFake(DUDA_ID, new Set(rooms), [], journal);
    const { io, publisher } = publisherOver([duda], journal);
    const event = memberUpdated(DUDA_ID, 'player');

    const move = {
      campaignId: VHARN_ID,
      userId: DUDA_ID,
      audience: 'player' as const,
      closedSceneIds: [],
    };
    await publisher.memberRoleChanged(event, move);

    expect(journal).toEqual([
      `join:${campaignUserRoom(VHARN_ID, DUDA_ID)}`,
      `join:${sceneUserRoom(VHARN_ID, ESTRADA_ID, DUDA_ID)}`,
      `emit:${campaignRoom(VHARN_ID)}:session:memberUpdated`,
    ]);
    expect(io.emitted).toEqual([
      { room: campaignRoom(VHARN_ID), name: 'session:memberUpdated', payload: event },
    ]);
  });
});

describe('SocketIoSessionPublisher.memberRoleChanged to and from the masters', () => {
  const CRIPTA_ID = '8c9d0e1f-2a3b-4c4d-8e5f-7a8b9c0d1e2f';

  function move(userId: string, audience: TableAudience, closedSceneIds: string[] = []) {
    return { campaignId: VHARN_ID, userId, audience, closedSceneIds };
  }

  it('Bia promoted to master enters the masters rooms of Vharn and of each open grid', async () => {
    const bia = new TableSocketFake(
      BIA_ID,
      new Set(roomsAt(VHARN_ID, BIA_ID, 'player', [ESTRADA_ID])),
    );
    const { publisher } = publisherOver([bia]);

    await publisher.memberRoleChanged(memberUpdated(BIA_ID, 'master'), move(BIA_ID, 'master'));

    expect([...bia.rooms].sort()).toEqual(roomsAt(VHARN_ID, BIA_ID, 'master', [ESTRADA_ID]).sort());
    expect(bia.rooms.has(sceneMastersRoom(VHARN_ID, ESTRADA_ID))).toBe(true);
  });

  it('Duda promoted from spectator to master enters her own rooms and the masters ones', async () => {
    const rooms = roomsAt(VHARN_ID, DUDA_ID, 'spectator', [ESTRADA_ID, SALAO_ID]);
    const duda = new TableSocketFake(DUDA_ID, new Set(rooms));
    const { publisher } = publisherOver([duda]);

    await publisher.memberRoleChanged(memberUpdated(DUDA_ID, 'master'), move(DUDA_ID, 'master'));

    const master = roomsAt(VHARN_ID, DUDA_ID, 'master', [ESTRADA_ID, SALAO_ID]);
    expect([...duda.rooms].sort()).toEqual(master.sort());
  });

  it('Bia demoted from master to player leaves only the masters rooms and keeps her own', async () => {
    const bia = new TableSocketFake(
      BIA_ID,
      new Set(roomsAt(VHARN_ID, BIA_ID, 'master', [ESTRADA_ID])),
    );
    const { publisher } = publisherOver([bia]);

    await publisher.memberRoleChanged(memberUpdated(BIA_ID, 'player'), move(BIA_ID, 'player'));

    expect([...bia.rooms].sort()).toEqual(roomsAt(VHARN_ID, BIA_ID, 'player', [ESTRADA_ID]).sort());
  });

  it('Bia demoted from master to spectator leaves her own rooms and the masters ones', async () => {
    const bia = new TableSocketFake(
      BIA_ID,
      new Set(roomsAt(VHARN_ID, BIA_ID, 'master', [ESTRADA_ID])),
    );
    const { publisher } = publisherOver([bia]);

    await publisher.memberRoleChanged(
      memberUpdated(BIA_ID, 'spectator'),
      move(BIA_ID, 'spectator'),
    );

    const spectator = roomsAt(VHARN_ID, BIA_ID, 'spectator', [ESTRADA_ID]).sort();
    expect([...bia.rooms].sort()).toEqual(spectator);
  });

  it('Bia demoted with the Cripta, a private grid, open as a tab: the tab closes as private', async () => {
    const rooms = roomsAt(VHARN_ID, BIA_ID, 'master', [ESTRADA_ID, CRIPTA_ID]);
    const bia = new TableSocketFake(BIA_ID, new Set(rooms), [CRIPTA_ID]);
    const { publisher } = publisherOver([bia]);

    const demotion = move(BIA_ID, 'player', [CRIPTA_ID]);
    await publisher.memberRoleChanged(memberUpdated(BIA_ID, 'player'), demotion);

    expect([...bia.rooms].sort()).toEqual(roomsAt(VHARN_ID, BIA_ID, 'player', [ESTRADA_ID]).sort());
    expect(bia.data.watchedSceneIds.get(VHARN_ID)?.has(CRIPTA_ID) ?? false).toBe(false);
    expect(bia.told).toEqual([
      {
        name: 'scene:closed',
        payload: { campaignId: VHARN_ID, sceneId: CRIPTA_ID, reason: 'private', at: AT },
      },
    ]);
  });

  it('a private grid that is not a tab of the connection (the group grid) is never closed', async () => {
    const bia = new TableSocketFake(
      BIA_ID,
      new Set(roomsAt(VHARN_ID, BIA_ID, 'master', [ESTRADA_ID])),
    );
    const { publisher } = publisherOver([bia]);

    const demotion = move(BIA_ID, 'player', [ESTRADA_ID]);
    await publisher.memberRoleChanged(memberUpdated(BIA_ID, 'player'), demotion);

    expect(bia.rooms.has(sceneRoom(VHARN_ID, ESTRADA_ID))).toBe(true);
    expect(bia.told).toEqual([]);
  });

  it('Bia promoted at Vharn keeps her rooms at Quelm as they were', async () => {
    const atQuelm = roomsAt(QUELM_ID, BIA_ID, 'player', [PANTANO_ID]);
    const bia = new TableSocketFake(
      BIA_ID,
      new Set([...roomsAt(VHARN_ID, BIA_ID, 'player', []), ...atQuelm]),
    );
    const { publisher } = publisherOver([bia]);

    await publisher.memberRoleChanged(memberUpdated(BIA_ID, 'master'), move(BIA_ID, 'master'));

    expect(bia.rooms.has(campaignMastersRoom(QUELM_ID))).toBe(false);
    expect(bia.rooms.has(sceneMastersRoom(QUELM_ID, PANTANO_ID))).toBe(false);
    expect(atQuelm.every((room) => bia.rooms.has(room))).toBe(true);
  });
});

describe('SocketIoSessionPublisher.memberRemoved', () => {
  const ROOT_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  const removed = { campaignId: VHARN_ID, at: AT };
  const left = { campaignId: VHARN_ID, version: 5, userId: ROOT_ID, at: AT };

  function rootTab(): TableSocketFake {
    const rooms = [
      ...roomsAt(VHARN_ID, ROOT_ID, 'master', [ESTRADA_ID]),
      ...roomsAt(QUELM_ID, ROOT_ID, 'player', []),
    ];
    return new TableSocketFake(ROOT_ID, new Set(rooms), [ESTRADA_ID]);
  }

  it('each tab of Root hears removedFromTable, leaves every room of Vharn and forgets it', async () => {
    const tabs = [rootTab(), rootTab()];
    for (const tab of tabs) tab.data.campaignIds = new Set([VHARN_ID, QUELM_ID]);
    const { publisher } = publisherOver(tabs);

    await publisher.memberRemoved({ userId: ROOT_ID, removed, left });

    for (const tab of tabs) {
      expect(tab.told).toEqual([{ name: 'session:removedFromTable', payload: removed }]);
      expect([...tab.rooms].sort()).toEqual(roomsAt(QUELM_ID, ROOT_ID, 'player', []).sort());
      expect([...tab.data.campaignIds]).toEqual([QUELM_ID]);
      expect(tab.data.watchedSceneIds.has(VHARN_ID)).toBe(false);
    }
  });

  it('then the room of Vharn hears memberLeft; Ana stays in her rooms', async () => {
    const journal: string[] = [];
    const ana = new TableSocketFake(
      DUDA_ID,
      new Set(roomsAt(VHARN_ID, DUDA_ID, 'player', [])),
      [],
      journal,
    );
    const root = rootTab();
    const { io, publisher } = publisherOver([ana, root], journal);

    await publisher.memberRemoved({ userId: ROOT_ID, removed, left });

    expect(journal.at(-1)).toBe(`emit:${campaignRoom(VHARN_ID)}:session:memberLeft`);
    expect(io.emitted).toEqual([
      { room: campaignRoom(VHARN_ID), name: 'session:memberLeft', payload: left },
    ]);
    expect(ana.rooms.has(campaignRoom(VHARN_ID))).toBe(true);
  });

  it('without a memberLeft (Root was offline) the room hears nothing', async () => {
    const { io, publisher } = publisherOver([]);

    await publisher.memberRemoved({ userId: ROOT_ID, removed, left: null });

    expect(io.emitted).toEqual([]);
  });
});
