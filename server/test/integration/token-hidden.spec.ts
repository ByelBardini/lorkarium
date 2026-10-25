import { tokensCreatedDto, type BoardStateDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  expectNoTrace,
  hiddenTable,
  isHidden,
  namesOf,
  type HiddenTable,
} from '../support/hidden-tokens';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import type { RealtimeClient } from '../support/realtime-client';
import { gridAck, newGrid, setGridVisibility } from '../support/grids';
import { tokenCommandFor, useTokenTable } from '../support/token-table';

describe('token:setHiddenMany over Socket.IO', () => {
  const live = useTokenTable();

  function hide(table: HiddenTable, hidden = true, tokenIds = [table.loboId]): object {
    return { ...envelope(live.vharn.id), tokenIds, hidden };
  }

  async function startCombat(table: HiddenTable): Promise<void> {
    const entries = [
      { name: null, tokenIds: [table.loboId], initiative: 20 },
      { name: null, tokenIds: [table.kaelId], initiative: 10 },
    ];
    expect(
      await send(table.ana.client, 'combat:start', { ...envelope(live.vharn.id), entries }),
    ).toMatchObject({ ok: true });
  }

  it('Ana hiding the Lobo: Ana and Bia get the flag, Caio token:deletedMany and the torch, never the id', async () => {
    const table = await hiddenTable(live, false);

    expect(await send(table.ana.client, 'token:setHiddenMany', hide(table))).toEqual({
      ok: true,
      version: 3,
    });

    for (const seer of [table.ana, table.bia]) {
      expect(await eventPayload(seer, 'token:hiddenChanged')).toMatchObject({
        version: 3,
        tokenIds: [table.loboId],
        hidden: true,
      });
    }
    expect(await eventPayload(table.caio, 'token:deletedMany')).toMatchObject({
      version: 3,
      tokenIds: [table.loboId],
      combat: null,
    });
    expect(await eventPayload(table.caio, 'token:veiledLightsChanged')).toMatchObject({
      lights: [{ x: 4, y: 5, bright: 4, dim: 4, color: 'torch' }],
    });
    expect(await isHidden(live, table.loboId)).toBe(true);
  });

  it('after hiding, nothing Caio gets afterwards names the Lobo', async () => {
    const table = await hiddenTable(live, false);
    await send(table.ana.client, 'token:setHiddenMany', hide(table));
    await eventPayload(table.caio, 'token:veiledLightsChanged');
    const since = table.caio.events.length;

    await send(table.ana.client, 'token:move', {
      ...envelope(live.vharn.id),
      tokenId: table.loboId,
      col: 9,
      row: 2,
    });

    await silence();
    expect(JSON.stringify(table.caio.events.slice(since))).not.toContain(table.loboId);
    expect(namesOf(table.caio).slice(since)).toEqual([
      'board:advanced',
      'token:veiledLightsChanged',
    ]);
  });

  it('showing the Lobo again: Caio gets token:createdMany with it redacted (no controllers bar)', async () => {
    const table = await hiddenTable(live);

    await send(table.ana.client, 'token:setHiddenMany', hide(table, false));

    const created = tokensCreatedDto.parse(await eventPayload(table.caio, 'token:createdMany'));
    expect(created.tokens).toHaveLength(1);
    expect(created.tokens[0]).toMatchObject({ id: table.loboId, hidden: false, canControl: false });
    expect(created.tokens[0]?.bars.map(({ label }) => label)).toEqual(['Inspiração']);
    expect(await eventPayload(table.bia, 'token:hiddenChanged')).toMatchObject({ hidden: false });
    expect(await eventPayload(table.caio, 'token:veiledLightsChanged')).toMatchObject({
      lights: [],
    });
  });

  it('the Lobo on the turn of the combat: Caio sees nobody on the turn and no entry of the Lobo', async () => {
    const table = await hiddenTable(live, false);
    await startCombat(table);
    const before = table.caio.events.length;

    await send(table.ana.client, 'token:setHiddenMany', hide(table));

    const deleted = (await eventPayload(
      { ...table.caio, events: table.caio.events.slice(before) },
      'token:deletedMany',
    )) as {
      combat: { currentCombatantId: string | null; combatants: { tokenIds: string[] }[] };
    };
    expect(deleted.combat.currentCombatantId).toBeNull();
    expect(deleted.combat.combatants.map(({ tokenIds }) => tokenIds)).toEqual([[table.kaelId]]);
    expect(JSON.stringify(deleted.combat)).not.toContain(table.loboId);
  });

  it('a token already hidden asked hidden again: the same version, no event', async () => {
    const table = await hiddenTable(live);

    expect(await send(table.ana.client, 'token:setHiddenMany', hide(table))).toEqual({
      ok: true,
      version: 2,
    });

    await silence();
    expect(table.caio.events).toEqual([]);
  });

  it('Bia, a player, is FORBIDDEN and nobody hears anything', async () => {
    const table = await hiddenTable(live, false);

    const ack = await send(table.bia.client, 'token:setHiddenMany', hide(table));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    expect(await isHidden(live, table.loboId)).toBe(false);
  });

  it('the Quelm in campaignId is CAMPAIGN_NOT_FOUND for Ana', async () => {
    const table = await hiddenTable(live, false);
    const command = { ...envelope(live.quelm.id), tokenIds: [table.loboId], hidden: true };

    const ack = await send(table.ana.client, 'token:setHiddenMany', command);

    expect(ack).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    });
  });

  it('a forged userId is INVALID_BODY', async () => {
    const table = await hiddenTable(live, false);

    const ack = await send(table.ana.client, 'token:setHiddenMany', {
      ...hide(table),
      userId: live.ana.id,
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
  });

  it('the hidden flag survives a restart of the app', async () => {
    const table = await hiddenTable(live, false);
    await send(table.ana.client, 'token:setHiddenMany', hide(table));

    await live.restart();

    const state = await synced(await live.atTable(live.ana, live.vharn), live.vharn);
    expect(state.tokens.find(({ id }) => id === table.loboId)?.hidden).toBe(true);
  });
});

describe('the snapshot without the hidden tokens', () => {
  const live = useTokenTable();

  function syncOf(client: RealtimeClient): Promise<BoardStateDto> {
    return synced(client, live.vharn);
  }

  it('Caio syncing after the Lobo hid gets neither it nor its id, only its torch', async () => {
    const table = await hiddenTable(live);

    const state = await syncOf(table.caio.client);

    expect(state.tokens.map(({ id }) => id)).toEqual([table.kaelId]);
    expect(state.veiledLights).toEqual([
      { x: 4, y: 5, bright: 4, dim: 4, color: 'torch', facing: 0, angle: 360 },
    ]);
    expect(JSON.stringify(state)).not.toContain(table.loboId);
  });

  it('Bia (controls the Lobo) and Ana get it, without veiled lights', async () => {
    const table = await hiddenTable(live);

    for (const seer of [table.ana, table.bia]) {
      const state = await syncOf(seer.client);
      expect(state.tokens.find(({ id }) => id === table.loboId)?.hidden).toBe(true);
      expect(state.veiledLights).toEqual([]);
    }
  });

  it('a hidden token on the Torre is cut from the scene:watch of Caio too', async () => {
    const table = await hiddenTable(live, false);
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    await setGridVisibility(live, live.ana, live.vharn, torre, 'public');
    await gridAck(table.ana.client, 'scene:watch', live.vharn, torre);
    const wolf = { sceneId: torre, name: 'Lobo da Torre', light: { bright: 2, dim: 2 } };
    const created = await send(
      table.ana.client,
      'token:create',
      tokenCommandFor(live.vharn, live.bia.id, wolf),
    );
    expect(created).toMatchObject({ ok: true });
    const wolfId = ((await eventPayload(table.ana, 'token:created')) as { token: { id: string } })
      .token.id;
    await send(table.ana.client, 'token:setHiddenMany', {
      ...envelope(live.vharn.id),
      sceneId: torre,
      tokenIds: [wolfId],
      hidden: true,
    });

    const ack = await gridAck(table.caio.client, 'scene:watch', live.vharn, torre);

    if (!ack.ok) throw new Error('scene:watch of the public Torre was refused');
    expect(ack.state.tokens).toEqual([]);
    expect(ack.state.veiledLights).toHaveLength(1);
    expect(JSON.stringify(ack.state)).not.toContain(wolfId);
    expectNoTrace(table.caio, wolfId);
  });

  it('the Quelm sync shows none of the Vharn tokens', async () => {
    await hiddenTable(live);
    const caio = await live.atTable(live.caio, live.quelm);

    const state = await synced(caio, live.quelm);

    expect(state.tokens).toEqual([]);
    expect(state.veiledLights).toEqual([]);
  });
});
