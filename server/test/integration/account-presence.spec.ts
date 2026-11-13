import {
  presenceFriendChangedDto,
  presenceSetVisibilityAckDto,
  presenceSyncAckDto,
  type PresenceFriendChangedDto,
} from '@lorkarium/contracts';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ackOf, befriend, eventMatching, payloadsOf } from '../support/account-live';
import { silence } from '../support/live-table';
import { recordEventsOf, type EventRecorder } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

function friendChangesOf(recorder: EventRecorder, userId: string): PresenceFriendChangedDto[] {
  return payloadsOf(recorder, 'presence:friendChanged')
    .map((payload) => presenceFriendChangedDto.parse(payload))
    .filter((event) => event.userId === userId);
}

async function heardAs(
  recorder: EventRecorder,
  userId: string,
  status: string,
): Promise<PresenceFriendChangedDto> {
  const payload = await eventMatching(recorder, 'presence:friendChanged', (event) => {
    const parsed = presenceFriendChangedDto.parse(event);
    return parsed.userId === userId && parsed.status === status;
  });
  return presenceFriendChangedDto.parse(payload);
}

async function listening(user: SignedInUser): Promise<EventRecorder> {
  return recordEventsOf(await live.connect(user));
}

function setVisibility(recorder: EventRecorder, visibility: string): Promise<unknown> {
  return ackOf(recorder.client, 'presence:setVisibility', { actionId: randomUUID(), visibility });
}

describe('account presence over Socket.IO', () => {
  it('Bia connects: Ana (her friend) hears her online; Caio (not a friend) hears nothing', async () => {
    await befriend(live, live.ana, live.bia);
    const [ana, caio] = [await listening(live.ana), await listening(live.caio)];

    await live.connect(live.bia);

    expect(await heardAs(ana, live.bia.id, 'online')).toMatchObject({ table: null });
    await silence();
    expect(friendChangesOf(caio, live.bia.id)).toEqual([]);
  });

  it('presence:sync answers every friend: Bia online, then offline once she leaves', async () => {
    await befriend(live, live.ana, live.bia);
    const ana = await listening(live.ana);
    const bia = await live.connect(live.bia);
    await heardAs(ana, live.bia.id, 'online');

    expect(presenceSyncAckDto.parse(await ackOf(ana.client, 'presence:sync'))).toEqual({
      ok: true,
      friends: [{ userId: live.bia.id, status: 'online', table: null }],
    });

    bia.disconnect();
    await heardAs(ana, live.bia.id, 'offline');
    expect(presenceSyncAckDto.parse(await ackOf(ana.client, 'presence:sync'))).toMatchObject({
      friends: [{ userId: live.bia.id, status: 'offline' }],
    });
  });

  it('Bia opens Vharn once it is public: Ana sees "Na mesa" Vharn', async () => {
    await befriend(live, live.ana, live.bia);
    // The master's settings need the table open (CAMPAIGN_NOT_OPEN otherwise).
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const patched = await live.http(live.ana, {
      method: 'PATCH',
      url: `/api/campaigns/${live.vharn.id}`,
      payload: { visibility: 'public' },
    });
    expect(patched.statusCode).toBe(200);

    await live.atTable(live.bia, live.vharn);

    const atVharn = await eventMatching(ana, 'presence:friendChanged', (event) => {
      return presenceFriendChangedDto.parse(event).table !== null;
    });
    expect(presenceFriendChangedDto.parse(atVharn)).toMatchObject({
      userId: live.bia.id,
      status: 'online',
      table: { campaignId: live.vharn.id, name: 'Os Sinos de Vharn' },
    });
  });

  it('Bia opens Vharn while it is private: no table ever reaches Ana', async () => {
    await befriend(live, live.ana, live.bia);
    const ana = await listening(live.ana);

    await live.atTable(live.bia, live.vharn);
    await heardAs(ana, live.bia.id, 'online');
    await silence();

    expect(friendChangesOf(ana, live.bia.id).map((event) => event.table)).toEqual([null]);
  });

  it('Bia invisible: Ana hears offline and her presence:sync says offline', async () => {
    await befriend(live, live.ana, live.bia);
    const ana = await listening(live.ana);
    const bia = await listening(live.bia);
    await heardAs(ana, live.bia.id, 'online');

    expect(presenceSetVisibilityAckDto.parse(await setVisibility(bia, 'invisible'))).toEqual({
      ok: true,
    });

    await heardAs(ana, live.bia.id, 'offline');
    expect(presenceSyncAckDto.parse(await ackOf(ana.client, 'presence:sync'))).toMatchObject({
      friends: [{ userId: live.bia.id, status: 'offline', table: null }],
    });
  });

  it('presence:setVisibility with away is INVALID_BODY: away is never chosen', async () => {
    const bia = await listening(live.bia);

    expect(presenceSetVisibilityAckDto.parse(await setVisibility(bia, 'away'))).toMatchObject({
      ok: false,
      error: { code: 'INVALID_BODY' },
    });
  });

  it('Ana blocks Bia: Bia no longer hears Ana come online', async () => {
    await befriend(live, live.ana, live.bia);
    const blocked = await live.http(live.ana, {
      method: 'POST',
      url: '/api/blocks',
      payload: { userId: live.bia.id },
    });
    expect(blocked.statusCode).toBe(201);
    const bia = await listening(live.bia);

    await live.connect(live.ana);
    await silence();

    expect(friendChangesOf(bia, live.ana.id)).toEqual([]);
  });
});

describe('friends:changed over the user room', () => {
  it('Bia accepts Ana: both accounts hear it, on every tab', async () => {
    const anaTabs = [await listening(live.ana), await listening(live.ana)];
    const bia = await listening(live.bia);
    const asked = await live.http(live.ana, {
      method: 'POST',
      url: '/api/friends/requests',
      payload: { username: 'bia' },
    });
    expect(asked.statusCode).toBe(200);
    await eventMatching(bia, 'friends:changed');

    await live.http(live.bia, {
      method: 'POST',
      url: `/api/friends/requests/${live.ana.id}/accept`,
    });

    await silence();
    for (const tab of [...anaTabs, bia]) {
      expect(payloadsOf(tab, 'friends:changed')).toHaveLength(2);
    }
  });

  it('Bia saves her profile: Ana (her friend) hears friends:changed, Caio does not', async () => {
    await befriend(live, live.ana, live.bia);
    const [ana, caio] = [await listening(live.ana), await listening(live.caio)];

    const saved = await live.http(live.bia, {
      method: 'PATCH',
      url: '/api/account/profile',
      payload: { name: 'Bia Flor' },
    });

    expect(saved.statusCode).toBe(200);
    expect(await eventMatching(ana, 'friends:changed')).toEqual({ at: expect.any(String) });
    await silence();
    expect(payloadsOf(caio, 'friends:changed')).toEqual([]);
  });
});
