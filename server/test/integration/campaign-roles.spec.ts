import {
  campaignMemberDto,
  campaignResponseDto,
  sessionJoinAckDto,
  sessionMemberUpdatedDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

const CIRCLE = {
  kind: 'ellipse',
  x: 4,
  y: 4,
  width: 2,
  height: 2,
  fill: 'moss',
  stroke: 'gold',
  strokeWidth: 'medium',
};

type Emit = (event: string, payload: object) => Promise<unknown>;

function setRole(
  user: SignedInUser | null,
  targetId: string,
  payload: object,
  table: Table = live.vharn,
) {
  const url = `/api/campaigns/${table.id}/members/${targetId}`;
  return live.http(user, { method: 'PATCH', url, payload });
}

async function dudaWatches(): Promise<SignedInUser> {
  const duda = await live.signUp('Duda');
  await live.joinAsSpectator(duda, live.vharn);
  return duda;
}

// A table Eva masters alone: she is in no other one, and nobody of Vharn is in hers.
async function evaWithErmo(): Promise<{ eva: SignedInUser; ermo: Table }> {
  const eva = await live.signUp('Eva');
  const response = await live.http(eva, {
    method: 'POST',
    url: '/api/campaigns',
    payload: { name: 'Ermo' },
  });
  const { id, joinCode } = campaignResponseDto.parse(response.json()).campaign;
  return { eva, ermo: { id, joinCode: joinCode ?? '', master: eva } };
}

async function joinedVersion(client: RealtimeClient, table: Table): Promise<number> {
  const timed = client.timeout(2000);
  const emit = timed.emitWithAck as Emit;
  const ack = sessionJoinAckDto.parse(await emit.call(timed, 'session:join', envelope(table.id)));
  if (!ack.ok) throw new Error(`join of ${table.id} refused with ${ack.error.code}`);
  return ack.state.version;
}

describe('the master promotes and moves to the spectators by the route', () => {
  it('Ana promoting Duda answers 200 with Duda as a player', async () => {
    const duda = await dudaWatches();

    const response = await setRole(live.ana, duda.id, { role: 'player' });

    expect(response.statusCode).toBe(200);
    expect(campaignMemberDto.parse(response.json())).toMatchObject({
      userId: duda.id,
      name: 'Duda',
      role: 'player',
      online: false,
    });
  });

  it('Bia, at the table, hears memberUpdated with Duda as a player and the version moved by one', async () => {
    const duda = await dudaWatches();
    const client = await live.connect(live.bia);
    const version = await joinedVersion(client, live.vharn);
    const bia = recordEventsOf(client);

    await setRole(live.ana, duda.id, { role: 'player' });

    const updated = sessionMemberUpdatedDto.parse(await eventPayload(bia, 'session:memberUpdated'));
    expect(updated.version).toBe(version + 1);
    expect(updated.member).toMatchObject({ userId: duda.id, role: 'player' });
  });

  it('Duda, at the table as a spectator, moves Kael she controls right after the promotion', async () => {
    const duda = await dudaWatches();
    const ana = await live.atTable(live.ana, live.vharn);
    const kael = { name: 'Kael', initials: 'KA', col: 6, row: 6, controllerIds: [duda.id] };
    await send(ana, 'token:create', tokenCommandFor(live.vharn, live.caio.id, kael));
    const kaelId = (await synced(ana, live.vharn)).tokens.find((t) => t.name === 'Kael')?.id;
    // The join remembers her membership as a spectator: only the forget lets the move through.
    const spectator = await live.atTable(duda, live.vharn);

    await setRole(live.ana, duda.id, { role: 'player' });
    const move = { ...envelope(live.vharn.id), tokenId: kaelId, col: 7, row: 7 };

    expect(await send(spectator, 'token:move', move)).toMatchObject({ ok: true });
  });

  it('Bia moved to the spectators gets FORBIDDEN on her next drawing', async () => {
    const bia = await live.atTable(live.bia, live.vharn);

    await setRole(live.ana, live.bia.id, { role: 'spectator' });
    const ack = await send(bia, 'drawing:createMany', {
      ...envelope(live.vharn.id),
      drawings: [CIRCLE],
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
  });

  it('asking for the role Bia already has answers 200 and nobody hears anything', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    await live.atTable(live.bia, live.vharn);
    await silence();
    const heard = ana.events.length;

    const response = await setRole(live.ana, live.bia.id, { role: 'player' });
    await silence();

    expect(response.statusCode).toBe(200);
    expect(campaignMemberDto.parse(response.json())).toMatchObject({ role: 'player' });
    expect(ana.events.slice(heard).map(({ name }) => name)).toEqual([]);
  });
});

describe('what the route refuses', () => {
  it('without a session cookie it is 401', async () => {
    const response = await setRole(null, live.bia.id, { role: 'spectator' });

    expect(response.statusCode).toBe(401);
  });

  it.each([
    ['the master role', { role: 'master' }],
    ['an extra key', { role: 'player', userId: crypto.randomUUID() }],
    ['no role', {}],
  ])('a body with %s is 400 INVALID_BODY', async (_case, payload) => {
    const response = await setRole(live.ana, live.bia.id, payload);

    expect([response.statusCode, response.json().code]).toEqual([400, 'INVALID_BODY']);
  });

  it('a member id that is not a uuid is 400 INVALID_PARAMS', async () => {
    const response = await setRole(live.ana, 'bia', { role: 'spectator' });

    expect([response.statusCode, response.json().code]).toEqual([400, 'INVALID_PARAMS']);
  });

  it('Bia, a player, asking is 403 FORBIDDEN and Duda stays a spectator', async () => {
    const duda = await dudaWatches();

    const response = await setRole(live.bia, duda.id, { role: 'player' });

    expect([response.statusCode, response.json().code]).toEqual([403, 'FORBIDDEN']);
    const again = await setRole(live.ana, duda.id, { role: 'spectator' });
    expect(campaignMemberDto.parse(again.json()).role).toBe('spectator');
  });

  it('Ana as the target is 403 FORBIDDEN', async () => {
    const response = await setRole(live.ana, live.ana.id, { role: 'spectator' });

    expect([response.statusCode, response.json().code]).toEqual([403, 'FORBIDDEN']);
  });

  it('Eva, who is in Ermo and not in Vharn, as the target is 404 MEMBER_NOT_FOUND', async () => {
    const { eva } = await evaWithErmo();

    const response = await setRole(live.ana, eva.id, { role: 'player' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: 'MEMBER_NOT_FOUND', message: 'Member not found' });
  });

  it('Eva, the master of Ermo, on Duda of Vharn is 404 CAMPAIGN_NOT_FOUND (critério 14)', async () => {
    const duda = await dudaWatches();
    const { eva } = await evaWithErmo();

    const response = await setRole(eva, duda.id, { role: 'player' });

    expect([response.statusCode, response.json().code]).toEqual([404, 'CAMPAIGN_NOT_FOUND']);
  });

  it('Eva, the master of Ermo, naming Duda of Vharn at Ermo is 404 MEMBER_NOT_FOUND', async () => {
    const duda = await dudaWatches();
    const { eva, ermo } = await evaWithErmo();

    const response = await setRole(eva, duda.id, { role: 'player' }, ermo);

    expect([response.statusCode, response.json().code]).toEqual([404, 'MEMBER_NOT_FOUND']);
  });
});
