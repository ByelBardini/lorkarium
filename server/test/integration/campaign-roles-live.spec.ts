import {
  librarySceneDto,
  sceneClosedDto,
  tokenUpdatedDto,
  type BoardStateDto,
  type TokenDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { gridAck } from '../support/grids';
import { hiddenTable } from '../support/hidden-tokens';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import {
  recordEventsOf,
  type EventRecorder,
  type RealtimeClient,
} from '../support/realtime-client';
import { tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

const BIA_CARD = { armorClass: 15, noteOne: 'Deve um favor ao ferreiro' };

type LiveRoleTable = Readonly<{
  ana: RealtimeClient;
  bia: RealtimeClient;
  caio: RealtimeClient;
  lyraId: string;
}>;

function lyraOf(state: BoardStateDto): TokenDto {
  const lyra = state.tokens.find((token) => token.name === 'Lyra');
  if (!lyra) throw new Error(`no Lyra; got ${state.tokens.map((token) => token.name).join()}`);
  return lyra;
}

function setRole(targetId: string, role: 'master' | 'player' | 'spectator') {
  const url = `/api/campaigns/${live.vharn.id}/members/${targetId}`;
  return live.http(live.ana, { method: 'PATCH', url, payload: { role } });
}

// Ana, Bia and Caio with Vharn open; Lyra of Bia on the group grid; Bia's card filled in.
async function liveRoleTable(): Promise<LiveRoleTable> {
  const ana = await live.atTable(live.ana, live.vharn);
  await send(ana, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
  const bia = await live.atTable(live.bia, live.vharn);
  const card = { memberId: live.bia.id, changes: BIA_CARD };
  await send(bia, 'member:updateCard', { ...envelope(live.vharn.id), ...card });
  const caio = await live.atTable(live.caio, live.vharn);
  return { ana, bia, caio, lyraId: lyraOf(await synced(ana, live.vharn)).id };
}

// token:update takes every field of token:create but the cell.
async function renameLyra(table: LiveRoleTable, name: string): Promise<void> {
  const lyra = tokenCommandFor(live.vharn, live.bia.id, { name });
  const fields = Object.entries(lyra).filter(([key]) => key !== 'col' && key !== 'row');
  const payload = { ...Object.fromEntries(fields), ...envelope(live.vharn.id) };
  await send(table.ana, 'token:update', { ...payload, tokenId: table.lyraId });
}

async function updatedLyraOf(recorder: EventRecorder): Promise<TokenDto> {
  return tokenUpdatedDto.parse(await eventPayload(recorder, 'token:updated')).token;
}

function labelsOf(token: TokenDto): string[] {
  return token.bars.map(({ label }) => label);
}

describe('live: the role change moves the connections of the member between the rooms', () => {
  it('Bia moved to the spectators with the table open hears the next update of Lyra redacted', async () => {
    const table = await liveRoleTable();
    const bia = recordEventsOf(table.bia);

    await setRole(live.bia.id, 'spectator');
    await renameLyra(table, 'Lyra, a Cauta');

    const lyra = await updatedLyraOf(bia);
    expect([lyra.canControl, labelsOf(lyra)]).toEqual([false, ['Inspiração']]);
  });

  it('the board:sync of Bia moved to the spectators: Lyra out of her control and no card of her own', async () => {
    const table = await liveRoleTable();

    await setRole(live.bia.id, 'spectator');
    const state = await synced(table.bia, live.vharn);

    expect(lyraOf(state).canControl).toBe(false);
    expect(state.memberCards.map(({ userId }) => userId)).not.toContain(live.bia.id);
  });

  it('the board:sync of Caio comes without the card of Bia once she is a spectator', async () => {
    const table = await liveRoleTable();

    await setRole(live.bia.id, 'spectator');
    const state = await synced(table.caio, live.vharn);

    expect(state.memberCards.map(({ userId }) => userId)).not.toContain(live.bia.id);
  });

  it('Bia promoted back hears Lyra whole again, with control', async () => {
    const table = await liveRoleTable();
    await setRole(live.bia.id, 'spectator');
    const bia = recordEventsOf(table.bia);

    await setRole(live.bia.id, 'player');
    await renameLyra(table, 'Lyra, a Brava');

    const lyra = await updatedLyraOf(bia);
    expect([lyra.canControl, labelsOf(lyra)]).toEqual([true, ['PV', 'Inspiração']]);
  });

  it('Bia promoted back finds in her board:sync the control of Lyra and her card as it was', async () => {
    const table = await liveRoleTable();
    await setRole(live.bia.id, 'spectator');

    await setRole(live.bia.id, 'player');
    const state = await synced(table.bia, live.vharn);

    expect(lyraOf(state).canControl).toBe(true);
    expect(state.memberCards.find(({ userId }) => userId === live.bia.id)).toMatchObject(BIA_CARD);
  });

  it('Caio at Quelm hears nothing of the role changes at Vharn', async () => {
    await liveRoleTable();
    const quelm = recordEventsOf(await live.atTable(live.caio, live.quelm));
    await silence();
    const heard = quelm.events.length;

    await setRole(live.bia.id, 'spectator');
    await setRole(live.bia.id, 'player');
    await silence();

    expect(quelm.events.slice(heard).map(({ name }) => name)).toEqual([]);
  });
});

type Emit = (event: string, payload: object) => Promise<unknown>;

function heard(recorder: EventRecorder, name: string): unknown[] {
  return recorder.events.filter((event) => event.name === name).map((event) => event.payload);
}

async function rollForTheMasters(client: RealtimeClient): Promise<void> {
  const parts = [{ label: null, expression: '1d20' }];
  const payload = { ...envelope(live.vharn.id), label: 'Furtivo', parts, aspect: 16 / 9 };
  const timed = client.timeout(4000);
  await (timed.emitWithAck as Emit).call(timed, 'dice:roll', { ...payload, visibility: 'masters' });
}

async function privateCripta(): Promise<string> {
  const url = `/api/campaigns/${live.vharn.id}/scenes`;
  const response = await live.http(live.ana, { method: 'POST', url, payload: { name: 'Cripta' } });
  return librarySceneDto.parse(response.json()).id;
}

describe('live: Caio, a player, promoted to master and demoted again', () => {
  it('promoted with Vharn open, he hears Ana hiding the Lobo as a master does', async () => {
    const table = await hiddenTable(live, false);

    await setRole(live.caio.id, 'master');
    await send(table.ana.client, 'token:setHiddenMany', {
      ...envelope(live.vharn.id),
      tokenIds: [table.loboId],
      hidden: true,
    });

    expect(await eventPayload(table.caio, 'token:hiddenChanged')).toMatchObject({
      tokenIds: [table.loboId],
      hidden: true,
    });
    expect(heard(table.caio, 'token:deletedMany')).toEqual([]);
  });

  it('promoted with Vharn open, he hears a roll for the masters whole, not as a notice', async () => {
    const table = await hiddenTable(live, false);

    await setRole(live.caio.id, 'master');
    await rollForTheMasters(table.ana.client);

    expect(await eventPayload(table.caio, 'dice:rolled')).toMatchObject({ rollerId: live.ana.id });
    expect(heard(table.caio, 'dice:rolledSecretly')).toEqual([]);
  });

  it('demoted with the Cripta, a private grid, open as a tab: scene:closed, then nothing of it', async () => {
    const cripta = await privateCripta();
    await setRole(live.caio.id, 'master');
    const ana = await live.atTable(live.ana, live.vharn);
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    expect(await gridAck(caio.client, 'scene:watch', live.vharn, cripta)).toMatchObject({
      ok: true,
    });

    await setRole(live.caio.id, 'player');
    const closed = sceneClosedDto.parse(await eventPayload(caio, 'scene:closed'));
    const since = caio.events.length;
    await gridAck(ana, 'scene:watch', live.vharn, cripta);
    await send(ana, 'token:create', {
      ...tokenCommandFor(live.vharn, live.ana.id),
      sceneId: cripta,
    });
    await silence();

    expect(closed).toMatchObject({ sceneId: cripta, reason: 'private' });
    expect(JSON.stringify(caio.events.slice(since))).not.toContain(cripta);
  });

  it('Caio at Quelm hears nothing of his promotion and demotion at Vharn', async () => {
    await hiddenTable(live, false);
    const quelm = recordEventsOf(await live.atTable(live.caio, live.quelm));
    await silence();
    const before = quelm.events.length;

    await setRole(live.caio.id, 'master');
    await setRole(live.caio.id, 'player');
    await silence();

    expect(quelm.events.slice(before).map(({ name }) => name)).toEqual([]);
  });
});
