import { setAccountPlan } from '../support/account-plans';
import { tokenUpdatedDto, tokensCreatedDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import type { NewTokenRow } from '../../src/modules/tokens/tokens.dao';
import { TokensDao } from '../../src/modules/tokens/tokens.dao';
import { linkToCharacter } from '../support/characters';
import { newGrid } from '../support/grids';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import { lyraBarsOnBia } from '../support/table-characters';
import type { Table } from '../support/tables';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const LIMIT_REFUSAL = {
  ok: false,
  error: {
    code: 'TOKEN_BLOCKER_LIMIT',
    message: 'A scene keeps at most 50 tokens that block sight',
  },
};

describe('tokens that block sight over Socket.IO', () => {
  const live = useTokenTable();
  // Before the plans: the owners of Vharn and Quelm on amigo_do_dono (test accounts are born free).
  beforeEach(async () => {
    await setAccountPlan(live.connection.db, live.ana.id, 'amigo_do_dono');
    await setAccountPlan(live.connection.db, live.caio.id, 'amigo_do_dono');
  });

  const refusal = (code: string) => ({ ok: false, error: expect.objectContaining({ code }) });

  function update(table: Table, tokenId: string, overrides: object = {}): object {
    const fields = { name: 'Lyra', initials: 'LY', side: 'ally', width: 1, height: 1 };
    return { ...envelope(table.id), tokenId, ...fields, controllerIds: [], bars: [], ...overrides };
  }

  function pasteOf(table: Table, blocksSight: unknown): object {
    const overrides = { blocksSight };
    const token = tokenCommandFor(table, live.bia.id, overrides) as Record<string, unknown>;
    delete token.actionId;
    delete token.campaignId;
    return { ...envelope(table.id), tokens: [token] };
  }

  async function sceneIdOf(table: Table): Promise<string> {
    const scene = await new ScenesDao(live.connection.db).findActiveOf(table.id);
    if (!scene) throw new Error(`table ${table.id} has no scene`);
    return scene.id;
  }

  function goblinRow(sceneId: string, index: number, blocksSight?: boolean): NewTokenRow {
    const box = { width: 1, height: 1, col: index % 20, row: Math.floor(index / 20) % 12 };
    const look = { sceneId, name: 'Goblin', initials: 'GO', side: 'enemy' } as const;
    const flag = blocksSight === undefined ? {} : { blocksSight };
    return { token: { ...look, ...box, ...flag }, bars: [], controllerIds: [] };
  }

  async function fillBlockers(sceneId: string, total: number): Promise<void> {
    const rows = Array.from({ length: total }, (_, index) => goblinRow(sceneId, index, true));
    await new TokensDao(live.connection.db).insertMany(rows);
  }

  async function createdBy(master: RealtimeClient, command: object): Promise<string> {
    const events = recordEventsOf(master);
    expect(await send(master, 'token:create', command)).toMatchObject({ ok: true });
    return (await createdTokenOf(events)).id;
  }

  it('Ana turns it on: token:updated carries it to every audience and the next sync shows it', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const statue = await createdBy(ana, tokenCommandFor(live.vharn, live.bia.id));
    const [forAna, forCaio] = [ana, await live.atTable(live.caio, live.vharn)].map(recordEventsOf);

    const ack = await send(ana, 'token:update', update(live.vharn, statue, { blocksSight: true }));

    expect(ack).toMatchObject({ ok: true });
    const heard = [forAna, forCaio].map(
      async (recorder) =>
        tokenUpdatedDto.parse(await eventPayload(recorder!, 'token:updated')).token.blocksSight,
    );
    expect(await Promise.all(heard)).toEqual([true, true]);
    const board = await synced(ana, live.vharn);
    expect(board.tokens.find(({ id }) => id === statue)?.blocksSight).toBe(true);
  });

  it('a new token and a row saved without the field do not block', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    await send(ana.client, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
    const created = await createdTokenOf(ana);

    const dao = new TokensDao(live.connection.db);
    const old = await dao.insert(goblinRow(await sceneIdOf(live.vharn), 3));

    expect(created.blocksSight).toBe(false);
    expect(old.token.blocksSight).toBe(false);
  });

  it('Bia, author with the create setting, sending it gets FORBIDDEN and the token stays', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const url = `/api/campaigns/${live.vharn.id}`;
    const settings = { method: 'PATCH', url, payload: { playersCreateTokens: true } } as const;
    expect((await live.http(live.ana, settings)).statusCode).toBe(200);
    const bia = await live.atTable(live.bia, live.vharn);
    const own = await createdBy(bia, tokenCommandFor(live.vharn, live.bia.id));
    const edit = update(live.vharn, own, { controllerIds: [live.bia.id], blocksSight: true });

    expect(await send(bia, 'token:update', edit)).toEqual(refusal('FORBIDDEN'));

    const board = await synced(ana, live.vharn);
    expect(board.tokens.find(({ id }) => id === own)?.blocksSight).toBe(false);
  });

  it('Bia, who controls the token linked to her character, sending it gets FORBIDDEN', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const statue = await createdBy(ana, tokenCommandFor(live.vharn, live.bia.id));
    const characterId = await lyraBarsOnBia(live);
    await linkToCharacter(ana, live.vharn, { tokenId: statue, characterId });
    const bia = await live.atTable(live.bia, live.vharn);
    const edit = update(live.vharn, statue, { controllerIds: [live.bia.id], blocksSight: true });

    expect(await send(bia, 'token:update', edit)).toEqual(refusal('FORBIDDEN'));
  });

  it('with 50 on the scene, the 51st by update, create and createMany is refused: no version, no event', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const free = await createdBy(ana.client, tokenCommandFor(live.vharn, live.bia.id));
    await fillBlockers(await sceneIdOf(live.vharn), 50);
    const before = await synced(ana.client, live.vharn);
    await silence();
    const heardBefore = ana.events.length;
    const on = { blocksSight: true };

    const updated = await send(ana.client, 'token:update', update(live.vharn, free, on));
    const created = await send(
      ana.client,
      'token:create',
      tokenCommandFor(live.vharn, live.bia.id, on),
    );
    const pasted = await send(ana.client, 'token:createMany', pasteOf(live.vharn, true));

    expect([updated, created, pasted]).toEqual([LIMIT_REFUSAL, LIMIT_REFUSAL, LIMIT_REFUSAL]);
    const after = await synced(ana.client, live.vharn);
    expect([after.version, after.tokens.length]).toEqual([before.version, before.tokens.length]);
    await silence();
    const heard = ana.events.slice(heardBefore).map(({ name }) => name);
    expect(heard.filter((name) => name.startsWith('token:'))).toEqual([]);
  });

  it('with 50 on the scene, turning one off passes and then one more fits', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const sceneId = await sceneIdOf(live.vharn);
    await fillBlockers(sceneId, 50);
    const [first] = await new TokensDao(live.connection.db).listOfScene(sceneId);
    if (!first) throw new Error(`scene ${sceneId} has no token`);

    const off = update(live.vharn, first.token.id, { blocksSight: false });
    expect(await send(ana, 'token:update', off)).toMatchObject({ ok: true });

    const command = tokenCommandFor(live.vharn, live.bia.id, { blocksSight: true });
    expect(await send(ana, 'token:create', command)).toMatchObject({ ok: true });
  });

  it('a hidden blocker counts: with 49 and a hidden one, the next is refused', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const sceneId = await sceneIdOf(live.vharn);
    await fillBlockers(sceneId, 49);
    const hidden = goblinRow(sceneId, 49, true);
    const row = { ...hidden, token: { ...hidden.token, hidden: true } };
    await new TokensDao(live.connection.db).insert(row);

    const command = tokenCommandFor(live.vharn, live.bia.id, { blocksSight: true });

    expect(await send(ana, 'token:create', command)).toEqual(LIMIT_REFUSAL);
  });

  it('another grid of the table and the table of Quelm count apart', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    await fillBlockers(torre, 50);
    await fillBlockers(await sceneIdOf(live.quelm), 50);

    const command = tokenCommandFor(live.vharn, live.bia.id, { blocksSight: true });

    expect(await send(ana, 'token:create', command)).toMatchObject({ ok: true });
  });

  it('Quelm altering the token of Vharn gets TOKEN_NOT_FOUND', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const statue = await createdBy(ana, tokenCommandFor(live.vharn, live.bia.id));
    const caio = await live.atTable(live.caio, live.quelm);

    const ack = await send(caio, 'token:update', update(live.quelm, statue, { blocksSight: true }));

    expect(ack).toEqual(refusal('TOKEN_NOT_FOUND'));
    const board = await synced(ana, live.vharn);
    expect(board.tokens.find(({ id }) => id === statue)?.blocksSight).toBe(false);
  });

  it('a paste by the master keeps the value of the copy', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));

    const ack = await send(ana.client, 'token:createMany', pasteOf(live.vharn, true));

    expect(ack).toMatchObject({ ok: true });
    const { tokens } = tokensCreatedDto.parse(await eventPayload(ana, 'token:createdMany'));
    expect(tokens.map(({ blocksSight }) => blocksSight)).toEqual([true]);
  });

  it('copyScene (Duplicate of the library) keeps the value of each token', async () => {
    const dao = new TokensDao(live.connection.db);
    const salao = await sceneIdOf(live.vharn);
    await dao.insertMany([goblinRow(salao, 0, true), goblinRow(salao, 1, false)]);
    const copy = await newGrid(live, live.ana, live.vharn, 'Cópia');

    await dao.copyScene(salao, copy);

    const copied = await dao.listOfScene(copy);
    const byCol = copied.toSorted((a, b) => a.token.col - b.token.col);
    expect(byCol.map(({ token }) => token.blocksSight)).toEqual([true, false]);
  });

  it.each([
    ['token:create', () => tokenCommandFor(live.vharn, live.bia.id, { blocksSight: 'sim' })],
    ['token:createMany', () => pasteOf(live.vharn, 'sim')],
  ])('%s with blocksSight "sim" is INVALID_BODY', async (event, command) => {
    const ana = await live.atTable(live.ana, live.vharn);

    expect(await send(ana, event, command())).toEqual(refusal('INVALID_BODY'));
  });

  it('token:update with blocksSight "sim" is INVALID_BODY', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const statue = await createdBy(ana, tokenCommandFor(live.vharn, live.bia.id));

    const ack = await send(ana, 'token:update', update(live.vharn, statue, { blocksSight: 'sim' }));

    expect(ack).toEqual(refusal('INVALID_BODY'));
  });
});
