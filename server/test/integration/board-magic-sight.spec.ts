import { tokenCreatedDto, tokenUpdatedDto, tokensCreatedDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { TokensDao } from '../../src/modules/tokens/tokens.dao';
import { setAccountPlan } from '../support/account-plans';
import { planRefusal } from '../support/board-plan';
import { linkToCharacter } from '../support/characters';
import { newGrid } from '../support/grids';
import { envelope, eventPayload, send, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import { lyraBarsOnBia } from '../support/table-characters';
import type { Table } from '../support/tables';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

describe('magic sight of a token over Socket.IO', () => {
  const live = useTokenTable();
  beforeEach(async () => {
    await setAccountPlan(live.connection.db, live.ana.id, 'amigo_do_dono');
    await setAccountPlan(live.connection.db, live.caio.id, 'amigo_do_dono');
  });

  const refusal = (code: string) => ({ ok: false, error: expect.objectContaining({ code }) });

  function update(table: Table, tokenId: string, overrides: object = {}): object {
    const fields = { name: 'Lyra', initials: 'LY', side: 'ally', width: 1, height: 1 };
    return { ...envelope(table.id), tokenId, ...fields, controllerIds: [], bars: [], ...overrides };
  }

  async function createdBy(master: RealtimeClient, command: object): Promise<string> {
    const events = recordEventsOf(master);
    expect(await send(master, 'token:create', command)).toMatchObject({ ok: true });
    return (await createdTokenOf(events)).id;
  }

  async function sceneIdOf(table: Table): Promise<string> {
    const scene = await new ScenesDao(live.connection.db).findActiveOf(table.id);
    if (!scene) throw new Error(`table ${table.id} has no scene`);
    return scene.id;
  }

  it('Ana creates the mage with 6 cells: token:created carries it to every audience', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));

    const command = tokenCommandFor(live.vharn, live.bia.id, { magicSight: 6 });
    expect(await send(ana.client, 'token:create', command)).toMatchObject({ ok: true });

    const heard = [ana, caio].map(
      async (recorder) =>
        tokenCreatedDto.parse(await eventPayload(recorder, 'token:created')).token.magicSight,
    );
    expect(await Promise.all(heard)).toEqual([6, 6]);
  });

  it('Ana turns it on and off by token:update; the next sync shows each value', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const mage = await createdBy(ana, tokenCommandFor(live.vharn, live.bia.id));
    const forCaio = recordEventsOf(await live.atTable(live.caio, live.vharn));

    expect(
      await send(ana, 'token:update', update(live.vharn, mage, { magicSight: 4.5 })),
    ).toMatchObject({ ok: true });
    const updated = tokenUpdatedDto.parse(await eventPayload(forCaio, 'token:updated'));
    expect(updated.token.magicSight).toBe(4.5);

    await send(ana, 'token:update', update(live.vharn, mage, { magicSight: null }));
    const board = await synced(ana, live.vharn);
    expect(board.tokens.find(({ id }) => id === mage)?.magicSight).toBeNull();
  });

  it('Bia, author with the create setting, turning it on gets FORBIDDEN and nothing changes', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const url = `/api/campaigns/${live.vharn.id}`;
    const settings = { method: 'PATCH', url, payload: { playersCreateTokens: true } } as const;
    expect((await live.http(live.ana, settings)).statusCode).toBe(200);
    const bia = await live.atTable(live.bia, live.vharn);
    const own = await createdBy(bia, tokenCommandFor(live.vharn, live.bia.id));
    const edit = update(live.vharn, own, { controllerIds: [live.bia.id], magicSight: 6 });

    expect(await send(bia, 'token:update', edit)).toEqual(refusal('FORBIDDEN'));
    const created = tokenCommandFor(live.vharn, live.bia.id, { magicSight: 6 });
    expect(await send(bia, 'token:create', created)).toEqual(refusal('FORBIDDEN'));

    const board = await synced(ana, live.vharn);
    expect(board.tokens.find(({ id }) => id === own)?.magicSight).toBeNull();
  });

  it('a free table turning it on gets PLAN_LIMIT magicSight; turning it off passes', async () => {
    await setAccountPlan(live.connection.db, live.ana.id, 'free');
    const ana = await live.atTable(live.ana, live.vharn);
    const mage = await createdBy(ana, tokenCommandFor(live.vharn, live.bia.id, { bars: [] }));

    const on = await send(ana, 'token:update', update(live.vharn, mage, { magicSight: 6 }));
    const off = await send(ana, 'token:update', update(live.vharn, mage, { magicSight: null }));

    expect(on).toEqual(planRefusal('magicSight', 0));
    expect(off).toMatchObject({ ok: true });
  });

  it('a seer from before the downgrade keeps it and changes its range at a free table', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const command = tokenCommandFor(live.vharn, live.bia.id, { bars: [], magicSight: 6 });
    const mage = await createdBy(ana, command);
    await setAccountPlan(live.connection.db, live.ana.id, 'free');
    const again = await live.atTable(live.ana, live.vharn);

    const ack = await send(again, 'token:update', update(live.vharn, mage, { magicSight: 9 }));

    expect(ack).toMatchObject({ ok: true });
  });

  it('on a token linked to a character it stays on the token, not on the character', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const mage = await createdBy(ana, tokenCommandFor(live.vharn, live.bia.id));
    const characterId = await lyraBarsOnBia(live);
    await linkToCharacter(ana, live.vharn, { tokenId: mage, characterId });
    const edit = update(live.vharn, mage, { controllerIds: [live.bia.id], magicSight: 6 });

    expect(await send(ana, 'token:update', edit)).toMatchObject({ ok: true });

    const board = await synced(ana, live.vharn);
    expect(board.tokens.find(({ id }) => id === mage)?.magicSight).toBe(6);
  });

  it('Quelm altering the token of Vharn gets TOKEN_NOT_FOUND', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const mage = await createdBy(ana, tokenCommandFor(live.vharn, live.bia.id));
    const caio = await live.atTable(live.caio, live.quelm);

    const ack = await send(caio, 'token:update', update(live.quelm, mage, { magicSight: 6 }));

    expect(ack).toEqual(refusal('TOKEN_NOT_FOUND'));
    const board = await synced(ana, live.vharn);
    expect(board.tokens.find(({ id }) => id === mage)?.magicSight).toBeNull();
  });

  it('a paste by the master keeps the value; copyScene keeps it too', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const token = tokenCommandFor(live.vharn, live.bia.id, { magicSight: 6 }) as Record<
      string,
      unknown
    >;
    delete token.actionId;
    delete token.campaignId;

    const ack = await send(ana.client, 'token:createMany', {
      ...envelope(live.vharn.id),
      tokens: [token],
    });

    expect(ack).toMatchObject({ ok: true });
    const { tokens } = tokensCreatedDto.parse(await eventPayload(ana, 'token:createdMany'));
    expect(tokens.map(({ magicSight }) => magicSight)).toEqual([6]);
    const dao = new TokensDao(live.connection.db);
    const copy = await newGrid(live, live.ana, live.vharn, 'Cópia');
    await dao.copyScene(await sceneIdOf(live.vharn), copy);
    const copied = await dao.listOfScene(copy);
    expect(copied.map(({ token: row }) => row.magicSight)).toEqual(['6.00']);
  });

  it('token:create with magicSight 101 is INVALID_BODY', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const command = tokenCommandFor(live.vharn, live.bia.id, { magicSight: 101 });

    expect(await send(ana, 'token:create', command)).toEqual(refusal('INVALID_BODY'));
  });
});
