import { describe, expect, it } from 'vitest';
import { recordEventsOf } from '../support/realtime-client';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import type { RealtimeClient } from '../support/realtime-client';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

describe('token layers over Socket.IO', () => {
  const live = useTokenTable();

  async function twoTokensAtVharn(master: RealtimeClient): Promise<string[]> {
    const lyraEvents = recordEventsOf(master);
    await send(master, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
    const lyraId = (await createdTokenOf(lyraEvents)).id;
    const bramEvents = recordEventsOf(master);
    await send(master, 'token:create', tokenCommandFor(live.vharn, live.caio.id, { col: 6 }));
    return [lyraId, (await createdTokenOf(bramEvents)).id];
  }

  function setLayer(tokenIds: string[], layer: string): object {
    return { ...envelope(live.vharn.id), tokenIds, layer };
  }

  it('a chest created on the objects layer reaches the master and the redacted player there', async () => {
    const master = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const caioEvents = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const chest = tokenCommandFor(live.vharn, live.bia.id, { name: 'Baú', layer: 'objects' });
    expect(await send(master.client, 'token:create', chest)).toEqual({ ok: true, version: 1 });
    expect(await createdTokenOf(master)).toMatchObject({ layer: 'objects', canControl: true });
    expect(await createdTokenOf(caioEvents)).toMatchObject({ layer: 'objects', canControl: false });
  });

  it('a token created without a layer lands on the tokens layer', async () => {
    const master = recordEventsOf(await live.atTable(live.ana, live.vharn));
    await send(master.client, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
    expect((await createdTokenOf(master)).layer).toBe('tokens');
  });

  it('after a restart the board:sync keeps the layer of every token', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    await send(
      master,
      'token:create',
      tokenCommandFor(live.vharn, live.bia.id, { layer: 'background' }),
    );
    await live.restart();
    const state = await synced(await live.atTable(live.bia, live.vharn), live.vharn);
    expect(state.tokens.map(({ layer }) => layer)).toEqual(['background']);
  });

  it('the master moving two tokens to objects reaches the three of them as one token:layerChanged', async () => {
    const master = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caioEvents = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const tokenIds = await twoTokensAtVharn(master.client);
    const ack = await send(master.client, 'token:setLayer', setLayer(tokenIds, 'objects'));
    expect(ack).toEqual({ ok: true, version: 3 });
    for (const recorder of [master, biaEvents, caioEvents]) {
      expect(await eventPayload(recorder, 'token:layerChanged')).toMatchObject({
        version: 3,
        tokenIds,
        layer: 'objects',
      });
    }
  });

  it('a player changing a layer is FORBIDDEN and nobody hears a change', async () => {
    const master = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const biaClient = await live.atTable(live.bia, live.vharn);
    const tokenIds = await twoTokensAtVharn(master.client);
    const ack = await send(biaClient, 'token:setLayer', setLayer(tokenIds.slice(0, 1), 'objects'));
    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    await silence();
    expect(master.events.map(({ name }) => name)).not.toContain('token:layerChanged');
  });

  it('a token of another table in the list is TOKEN_NOT_FOUND and the other one keeps its layer', async () => {
    const quelmMaster = recordEventsOf(await live.atTable(live.caio, live.quelm));
    await send(quelmMaster.client, 'token:create', tokenCommandFor(live.quelm, live.caio.id));
    const quelmTokenId = (await createdTokenOf(quelmMaster)).id;
    const master = await live.atTable(live.ana, live.vharn);
    const [lyraId = ''] = await twoTokensAtVharn(master);
    const ack = await send(master, 'token:setLayer', setLayer([lyraId, quelmTokenId], 'objects'));
    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'TOKEN_NOT_FOUND' }) });
    const state = await synced(master, live.vharn);
    expect(state.version).toBe(2);
    expect(state.tokens.map(({ layer }) => layer)).toEqual(['tokens', 'tokens']);
  });

  it('the same token twice in the list is INVALID_BODY', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const [lyraId = ''] = await twoTokensAtVharn(master);
    const ack = await send(master, 'token:setLayer', setLayer([lyraId, lyraId], 'objects'));
    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
  });

  it('after a restart the board:sync carries the layer the master set', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const tokenIds = await twoTokensAtVharn(master);
    await send(master, 'token:setLayer', setLayer(tokenIds.slice(1), 'background'));
    await live.restart();
    const state = await synced(await live.atTable(live.caio, live.vharn), live.vharn);
    expect(state.version).toBe(3);
    expect(state.tokens.map(({ layer }) => layer)).toEqual(['tokens', 'background']);
  });

  it('Caio cannot move nor drag his token once the master put it on objects, and the master can', async () => {
    const master = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const caioClient = await live.atTable(live.caio, live.vharn);
    const [, bramId = ''] = await twoTokensAtVharn(master.client);
    await send(master.client, 'token:setLayer', setLayer([bramId], 'objects'));
    const toCell = { ...envelope(live.vharn.id), tokenId: bramId, col: 1, row: 1 };
    const forbidden = { ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) };
    expect(await send(caioClient, 'token:move', toCell)).toEqual(forbidden);
    const drag = {
      ...envelope(live.vharn.id),
      drags: [{ tokenId: bramId, cell: { col: 1, row: 1 } }],
    };
    expect(await send(caioClient, 'token:dragMany', drag)).toEqual(forbidden);
    await silence();
    const heard = master.events.map(({ name }) => name);
    expect(heard).not.toContain('token:moved');
    expect(heard).not.toContain('token:draggedMany');
    expect(await send(master.client, 'token:move', toCell)).toEqual({ ok: true, version: 4 });
  });
});
