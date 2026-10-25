import { tokensRestyledDto, tokenUpdatedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { gridState, linkToCard, tokenIn } from '../support/characters';
import { gridAck, newGrid } from '../support/grids';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const GOLD = { kind: 'color', radius: 2, color: 'gold', opacity: 50 } as const;
const FIRE = { kind: 'effect', radius: 3, effect: 'fire', color: null, opacity: 100 } as const;

function without(command: object, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(command).filter(([key]) => !keys.includes(key)));
}

describe('token auras over Socket.IO', () => {
  const live = useTokenTable();

  async function lyraOfBia(master: RealtimeClient, aura: object | null = null): Promise<string> {
    const events = recordEventsOf(master);
    await send(master, 'token:create', tokenCommandFor(live.vharn, live.bia.id, { aura }));
    return (await createdTokenOf(events)).id;
  }

  function restyleOf(tokenId: string, aura: object | null): object {
    return { ...envelope(live.vharn.id), tokenIds: [tokenId], style: { aura } };
  }

  it('Bia giving her Lyra a 2-cell gold aura reaches Ana and Caio in token:restyledMany', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);
    const ana = recordEventsOf(master);
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const bia = await live.atTable(live.bia, live.vharn);

    expect(await send(bia, 'token:restyleMany', restyleOf(lyraId, GOLD))).toEqual({
      ok: true,
      version: 2,
    });

    for (const recorder of [ana, caio]) {
      const event = tokensRestyledDto.parse(await eventPayload(recorder, 'token:restyledMany'));
      expect(event).toMatchObject({ tokenIds: [lyraId], style: { aura: GOLD } });
    }
  });

  it('the aura survives a restart of the server and comes in the board:sync', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);
    await send(
      await live.atTable(live.bia, live.vharn),
      'token:restyleMany',
      restyleOf(lyraId, GOLD),
    );

    await live.restart();

    const state = await synced(await live.atTable(live.caio, live.vharn), live.vharn);
    expect(tokenIn(state, lyraId).aura).toEqual(GOLD);
  });

  it('Ana creating a token with a fire aura and swapping it for gold by token:update', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master, FIRE);
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    expect(tokenIn(await synced(caio.client, live.vharn), lyraId).aura).toEqual(FIRE);
    const fields = without(tokenCommandFor(live.vharn, live.bia.id), ['col', 'row']);

    await send(master, 'token:update', {
      ...fields,
      ...envelope(live.vharn.id),
      tokenId: lyraId,
      aura: GOLD,
    });

    const { token } = tokenUpdatedDto.parse(await eventPayload(caio, 'token:updated'));
    expect(token.aura).toEqual(GOLD);
  });

  it('Bia taking the aura away (aura null) leaves Lyra without one for everyone', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master, FIRE);

    await send(
      await live.atTable(live.bia, live.vharn),
      'token:restyleMany',
      restyleOf(lyraId, null),
    );

    const state = await synced(await live.atTable(live.caio, live.vharn), live.vharn);
    expect(tokenIn(state, lyraId).aura).toBeNull();
  });

  it('Caio giving an aura to the Lyra of Bia gets FORBIDDEN and nobody hears of it', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);
    const ana = recordEventsOf(master);
    const caio = await live.atTable(live.caio, live.vharn);

    const ack = await send(caio, 'token:restyleMany', restyleOf(lyraId, GOLD));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    await silence();
    expect(ana.events.map(({ name }) => name)).not.toContain('token:restyledMany');
  });

  it('an aura of kind glow is INVALID_BODY', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'token:restyleMany', restyleOf(lyraId, { ...GOLD, kind: 'glow' }));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
  });

  it('an image aura with an image of Quelm is ASSET_NOT_FOUND, with no event and no change', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);
    const ana = recordEventsOf(master);
    const quelmImage = await live.sendImage(live.caio, live.quelm);
    const aura = { kind: 'image', radius: 1, imageAssetId: quelmImage.id, opacity: 80 };
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'token:restyleMany', restyleOf(lyraId, aura));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'ASSET_NOT_FOUND' }) });
    await silence();
    expect(ana.events.map(({ name }) => name)).not.toContain('token:restyledMany');
    expect(tokenIn(await synced(bia, live.vharn), lyraId).aura).toBeNull();
  });

  it('an image aura with an image of the table reaches everyone with the asset', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);
    const image = await live.sendImage(live.bia, live.vharn);
    const aura = { kind: 'image', radius: 1, imageAssetId: image.id, opacity: 80 };

    await send(
      await live.atTable(live.bia, live.vharn),
      'token:restyleMany',
      restyleOf(lyraId, aura),
    );

    const state = await synced(await live.atTable(live.caio, live.vharn), live.vharn);
    expect(tokenIn(state, lyraId).aura).toEqual(aura);
  });

  it('the aura of the linked Lyra is the character: it shows on both grids she stands on', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);
    await linkToCard(master, live.vharn, { tokenId: lyraId, memberId: live.bia.id });
    const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada');
    await gridAck(master, 'scene:watch', live.vharn, estrada);
    const events = recordEventsOf(master);
    await send(master, 'token:create', {
      ...tokenCommandFor(live.vharn, live.bia.id),
      sceneId: estrada,
      bars: [],
    });
    const onEstrada = (await createdTokenOf(events)).id;
    await linkToCard(master, live.vharn, {
      sceneId: estrada,
      tokenId: onEstrada,
      memberId: live.bia.id,
    });

    await send(
      await live.atTable(live.bia, live.vharn),
      'token:restyleMany',
      restyleOf(lyraId, FIRE),
    );

    expect(tokenIn(await synced(master, live.vharn), lyraId).aura).toEqual(FIRE);
    expect(tokenIn(await gridState(master, live.vharn, estrada), onEstrada).aura).toEqual(FIRE);
  });

  it('the table Quelm neither hears of nor finds the token with an aura of Vharn', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master, FIRE);
    const quelm = recordEventsOf(await live.atTable(live.caio, live.quelm));

    await send(
      await live.atTable(live.bia, live.vharn),
      'token:restyleMany',
      restyleOf(lyraId, GOLD),
    );
    const fromQuelm = { ...envelope(live.quelm.id), tokenIds: [lyraId], style: { aura: null } };
    const ack = await send(quelm.client, 'token:restyleMany', fromQuelm);

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'TOKEN_NOT_FOUND' }) });
    await silence();
    expect(quelm.events.map(({ name }) => name)).not.toContain('token:restyledMany');
    expect((await synced(quelm.client, live.quelm)).tokens).toEqual([]);
    expect(tokenIn(await synced(master, live.vharn), lyraId).aura).toEqual(GOLD);
  });
});
