import {
  campaignResponseDto,
  sessionJoinAckDto,
  sessionMemberJoinedDto,
  sessionMemberLeftDto,
  sessionRemovedFromTableDto,
} from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { users } from '../../src/modules/auth/users.po';
import { hiddenTable } from '../support/hidden-tokens';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

type Emit = (event: string, payload: object) => Promise<unknown>;

// Root, an admin who is not a member of Vharn, with juggernaut mode on there.
async function rootAsJuggernaut(): Promise<SignedInUser> {
  const root = await live.signUp('Root');
  await live.connection.db.update(users).set({ role: 'admin' }).where(eq(users.id, root.id));
  const url = `/api/campaigns/${live.vharn.id}/juggernaut`;
  const response = await live.http(root, { method: 'POST', url });
  if (response.statusCode !== 200) throw new Error(`juggernaut answered ${response.body}`);
  return root;
}

async function memberIdsJoinedBy(client: RealtimeClient): Promise<string[]> {
  const timed = client.timeout(2000);
  const ack = await (timed.emitWithAck as Emit).call(
    timed,
    'session:join',
    envelope(live.vharn.id),
  );
  const parsed = sessionJoinAckDto.parse(ack);
  if (!parsed.ok) throw new Error(`join refused with ${parsed.error.code}`);
  return parsed.state.members.map(({ userId }) => userId);
}

async function vharnDetailOfAna() {
  const response = await live.http(live.ana, {
    method: 'GET',
    url: `/api/campaigns/${live.vharn.id}`,
  });
  return campaignResponseDto.parse(response.json()).campaign;
}

describe('the table sees Root, a juggernaut, only while he is at it', () => {
  it('Root opening Vharn: Ana hears memberJoined with him as a master marked juggernaut', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const root = await rootAsJuggernaut();

    await live.atTable(root, live.vharn);

    const joined = sessionMemberJoinedDto.parse(await eventPayload(ana, 'session:memberJoined'));
    expect(joined.member).toMatchObject({ userId: root.id, role: 'master', juggernaut: true });
  });

  it('Root at Vharn reads the hidden Lobo in his board:sync', async () => {
    const table = await hiddenTable(live);
    const root = await rootAsJuggernaut();

    const state = await synced(await live.atTable(root, live.vharn), live.vharn);

    expect(state.tokens.map(({ id }) => id)).toContain(table.loboId);
  });

  it('Root gone (session:leave), the next session:join of Ana does not list him', async () => {
    const root = await rootAsJuggernaut();
    const rootClient = await live.atTable(root, live.vharn);
    await live.atTable(live.ana, live.vharn);

    const timed = rootClient.timeout(2000);
    await (timed.emitWithAck as Emit).call(timed, 'session:leave', envelope(live.vharn.id));
    await silence();

    expect(await memberIdsJoinedBy(await live.connect(live.ana))).not.toContain(root.id);
  });

  it('Root entering Vharn counts neither in its members nor in its last access', async () => {
    const root = await rootAsJuggernaut();

    await live.http(root, { method: 'POST', url: `/api/campaigns/${live.vharn.id}/enter` });
    const detail = await vharnDetailOfAna();

    expect(detail.memberCount).toBe(3);
    expect(detail.lastAccessAt).toBeNull();
    expect(detail.members.map(({ userId }) => userId)).not.toContain(root.id);
  });
});

describe('Root, not a member before, turning the mode off with two tabs of Vharn open', () => {
  it('both tabs hear removedFromTable, Ana hears memberLeft and his next move is refused', async () => {
    const root = await rootAsJuggernaut();
    const tabs = [await live.atTable(root, live.vharn), await live.atTable(root, live.vharn)];
    const heard = tabs.map(recordEventsOf);
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));

    await live.http(root, { method: 'DELETE', url: `/api/campaigns/${live.vharn.id}/juggernaut` });

    for (const tab of heard) {
      const removed = sessionRemovedFromTableDto.parse(
        await eventPayload(tab, 'session:removedFromTable'),
      );
      expect(removed.campaignId).toBe(live.vharn.id);
    }
    const left = sessionMemberLeftDto.parse(await eventPayload(ana, 'session:memberLeft'));
    expect(left.userId).toBe(root.id);
    const move = { ...envelope(live.vharn.id), tokenId: crypto.randomUUID(), col: 1, row: 1 };
    expect(await send(tabs[0]!, 'token:move', move)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    });
  });

  it('his tabs hear nothing more of Vharn after leaving it', async () => {
    const root = await rootAsJuggernaut();
    const tab = recordEventsOf(await live.atTable(root, live.vharn));
    const ana = await live.atTable(live.ana, live.vharn);
    await live.http(root, { method: 'DELETE', url: `/api/campaigns/${live.vharn.id}/juggernaut` });
    await eventPayload(tab, 'session:removedFromTable');
    const since = tab.events.length;

    await send(ana, 'token:create', {
      ...envelope(live.vharn.id),
      name: 'Kael',
      initials: 'KA',
      side: 'ally',
      width: 1,
      height: 1,
      col: 2,
      row: 2,
      controllerIds: [],
      bars: [],
    });
    await silence();

    expect(tab.events.slice(since).map(({ name }) => name)).toEqual([]);
  });
});
