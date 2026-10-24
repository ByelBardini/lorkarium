import type { SessionMemberUpdatedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { SocketIoSessionPublisher } from '../../../src/infrastructure/session-publisher/socket-io-session-publisher';
import type { RealtimeServer } from '../../../src/realtime/realtime-server';
import {
  campaignRoom,
  campaignUserRoom,
  sceneAudienceRooms,
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
  return [campaignRoom(campaignId), ...own, ...grids];
}

function memberUpdated(userId: string, role: 'player' | 'spectator'): SessionMemberUpdatedDto {
  const member = {
    ...{ userId, name: userId, username: userId, color: 'gold' as const, avatarId: null },
    ...{ bio: null, role, online: true, awaySince: null },
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

    const move = { campaignId: VHARN_ID, userId: DUDA_ID, audience: 'player' as const };
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

    const move = { campaignId: VHARN_ID, userId: DUDA_ID, audience: 'player' as const };
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

    const move = { campaignId: VHARN_ID, userId: BIA_ID, audience: 'spectator' as const };
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

    const move = { campaignId: VHARN_ID, userId: DUDA_ID, audience: 'player' as const };
    await publisher.memberRoleChanged(memberUpdated(DUDA_ID, 'player'), move);

    expect([...bia.rooms].sort()).toEqual([...biaRooms].sort());
  });

  it('the rooms move before the table hears memberUpdated, which goes to the room of Vharn', async () => {
    const journal: string[] = [];
    const rooms = roomsAt(VHARN_ID, DUDA_ID, 'spectator', [ESTRADA_ID]);
    const duda = new TableSocketFake(DUDA_ID, new Set(rooms), [], journal);
    const { io, publisher } = publisherOver([duda], journal);
    const event = memberUpdated(DUDA_ID, 'player');

    const move = { campaignId: VHARN_ID, userId: DUDA_ID, audience: 'player' as const };
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
