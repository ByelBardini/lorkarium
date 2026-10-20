import { tokensCreatedDto, tokensRestyledDto, tokenUpdatedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const TORCH = { bright: 4, dim: 4, color: null };
const FIRE = { bright: 4, dim: 4, color: 'fire' };

function without(command: object, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(command).filter(([key]) => !keys.includes(key)));
}

describe('token light over Socket.IO', () => {
  const live = useTokenTable();

  async function lyraOfBia(master: RealtimeClient, light: object | null = TORCH): Promise<string> {
    const events = recordEventsOf(master);
    await send(master, 'token:create', tokenCommandFor(live.vharn, live.bia.id, { light }));
    return (await createdTokenOf(events)).id;
  }

  function updateOf(tokenId: string, light: object | null): object {
    const fields = without(tokenCommandFor(live.vharn, live.bia.id), ['col', 'row']);
    return { ...fields, ...envelope(live.vharn.id), tokenId, light };
  }

  function putOut(tokenId: string, lightLit = false): object {
    return { ...envelope(live.vharn.id), tokenIds: [tokenId], style: { lightLit } };
  }

  it('Ana giving Lyra a torch by token:update reaches Bia and Caio with the same light', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const lyraId = await lyraOfBia(ana.client, null);
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const fields = without(tokenCommandFor(live.vharn, live.bia.id), ['col', 'row']);

    await send(ana.client, 'token:update', {
      ...fields,
      ...envelope(live.vharn.id),
      tokenId: lyraId,
      light: TORCH,
    });

    for (const recorder of [bia, caio]) {
      const { token } = tokenUpdatedDto.parse(await eventPayload(recorder, 'token:updated'));
      expect(token).toMatchObject({ light: TORCH, lightLit: true });
    }
  });

  it('Ana giving Lyra a fire light reaches Bia and Caio with the color', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const lyraId = await lyraOfBia(ana.client, null);
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));

    await send(ana.client, 'token:update', updateOf(lyraId, FIRE));

    for (const recorder of [bia, caio]) {
      const { token } = tokenUpdatedDto.parse(await eventPayload(recorder, 'token:updated'));
      expect(token.light).toEqual(FIRE);
    }
  });

  it('Ana taking the light away (light null) takes the color too', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const lyraId = await lyraOfBia(ana.client, FIRE);

    await send(ana.client, 'token:update', updateOf(lyraId, null));

    const { token } = tokenUpdatedDto.parse(await eventPayload(ana, 'token:updated'));
    expect(token.light).toBeNull();
  });

  it('Bia putting out her fire light keeps the color', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master, FIRE);
    await send(await live.atTable(live.bia, live.vharn), 'token:restyleMany', putOut(lyraId));

    const state = await synced(await live.atTable(live.caio, live.vharn), live.vharn);
    expect(state.tokens[0]).toMatchObject({ light: FIRE, lightLit: false });
  });

  it('Caio sending token:update with a light color is FORBIDDEN', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);
    const caio = await live.atTable(live.caio, live.vharn);

    const ack = await send(caio, 'token:update', updateOf(lyraId, FIRE));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
  });

  it('Bia putting out the light of her Lyra reaches everyone as token:restyledMany', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);
    const anaEvents = recordEventsOf(master);
    const caioEvents = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const bia = await live.atTable(live.bia, live.vharn);

    expect(await send(bia, 'token:restyleMany', putOut(lyraId))).toEqual({ ok: true, version: 2 });

    for (const recorder of [anaEvents, caioEvents]) {
      const event = tokensRestyledDto.parse(await eventPayload(recorder, 'token:restyledMany'));
      expect(event).toMatchObject({ tokenIds: [lyraId], style: { lightLit: false } });
    }
  });

  it('Caio putting out the light of the Lyra of Bia gets FORBIDDEN and nobody hears of it', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);
    const anaEvents = recordEventsOf(master);
    const caio = await live.atTable(live.caio, live.vharn);

    const ack = await send(caio, 'token:restyleMany', putOut(lyraId));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    await silence();
    expect(anaEvents.events.map(({ name }) => name)).not.toContain('token:restyledMany');
  });

  it('a pasted Lyra carries her fire light and is born lit', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const copied = without(tokenCommandFor(live.vharn, live.bia.id, { light: FIRE }), [
      'actionId',
      'campaignId',
    ]);

    await send(ana.client, 'token:createMany', { ...envelope(live.vharn.id), tokens: [copied] });

    const pasted = tokensCreatedDto.parse(await eventPayload(ana, 'token:createdMany')).tokens;
    expect(pasted.map(({ light, lightLit }) => [light, lightLit])).toEqual([[FIRE, true]]);
  });

  it('the light, its color and the switch survive a restart of the server', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master, FIRE);
    await send(await live.atTable(live.bia, live.vharn), 'token:restyleMany', putOut(lyraId));

    await live.restart();

    const state = await synced(await live.atTable(live.caio, live.vharn), live.vharn);
    expect(state.tokens[0]).toMatchObject({ light: FIRE, lightLit: false });
  });

  it('a restyle carrying a forged userId gets INVALID_BODY', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);

    const ack = await send(master, 'token:restyleMany', { ...putOut(lyraId), userId: live.bia.id });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
  });
});
