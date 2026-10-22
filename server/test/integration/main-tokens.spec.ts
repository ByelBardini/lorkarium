import { mainTokenChangedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

describe('main token over Socket.IO', () => {
  const live = useTokenTable();

  async function tokenOf(master: RealtimeClient, controllerIds: string[], name = 'Lyra') {
    const events = recordEventsOf(master);
    const command = tokenCommandFor(live.vharn, live.bia.id, { name, controllerIds });
    await send(master, 'token:create', command);
    return (await createdTokenOf(events)).id;
  }

  function setMain(tokenId: string, campaignId = live.vharn.id): object {
    return { ...envelope(campaignId), tokenId };
  }

  function update(tokenId: string, controllerIds: string[]): object {
    const fields = { name: 'Lyra', initials: 'LY', side: 'ally', width: 1, height: 1 };
    return { ...envelope(live.vharn.id), tokenId, ...fields, controllerIds, bars: [] };
  }

  it('Bia choosing Lyra reaches Ana and Caio as token:mainChanged and every sync carries it', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await tokenOf(master, [live.bia.id]);
    const anaEvents = recordEventsOf(master);
    const caio = await live.atTable(live.caio, live.vharn);
    const caioEvents = recordEventsOf(caio);
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'token:setMain', setMain(lyraId));

    expect(ack).toEqual({ ok: true, version: 2 });
    for (const recorder of [anaEvents, caioEvents]) {
      const event = mainTokenChangedDto.parse(await eventPayload(recorder, 'token:mainChanged'));
      expect(event).toMatchObject({ version: 2, userId: live.bia.id, tokenId: lyraId });
    }
    const chosen = [{ userId: live.bia.id, tokenId: lyraId }];
    expect((await synced(caio, live.vharn)).mainTokens).toEqual(chosen);
    expect((await synced(master, live.vharn)).mainTokens).toEqual(chosen);
  });

  it('Bia switching to another token she controls leaves only the new one in the sync', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await tokenOf(master, [live.bia.id]);
    const wolfId = await tokenOf(master, [live.bia.id], 'Lobo');
    const bia = await live.atTable(live.bia, live.vharn);

    await send(bia, 'token:setMain', setMain(lyraId));
    await send(bia, 'token:setMain', setMain(wolfId));

    const state = await synced(bia, live.vharn);
    expect(state.mainTokens).toEqual([{ userId: live.bia.id, tokenId: wolfId }]);
  });

  it('Caio choosing the Lyra of Bia gets FORBIDDEN and nobody hears of it', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await tokenOf(master, [live.bia.id]);
    const anaEvents = recordEventsOf(master);
    const caio = await live.atTable(live.caio, live.vharn);

    const ack = await send(caio, 'token:setMain', setMain(lyraId));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    await silence();
    expect(anaEvents.events.map(({ name }) => name)).not.toContain('token:mainChanged');
  });

  it('Ana, master but not in the control of Lyra, gets FORBIDDEN', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await tokenOf(master, [live.bia.id]);

    const ack = await send(master, 'token:setMain', setMain(lyraId));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
  });

  it('a token of Quelm chosen at the Vharn table is TOKEN_NOT_FOUND', async () => {
    const quelmMaster = await live.atTable(live.caio, live.quelm);
    const events = recordEventsOf(quelmMaster);
    await send(quelmMaster, 'token:create', tokenCommandFor(live.quelm, live.caio.id));
    const quelmTokenId = (await createdTokenOf(events)).id;
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'token:setMain', setMain(quelmTokenId));

    expect(ack).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'TOKEN_NOT_FOUND' }),
    });
  });

  it('Bia sending the campaignId of Quelm is CAMPAIGN_NOT_FOUND, and the Quelm sync has no main token', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await tokenOf(master, [live.bia.id]);
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'token:setMain', setMain(lyraId, live.quelm.id));

    expect(ack).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    });
    await send(bia, 'token:setMain', setMain(lyraId));
    const quelm = await synced(await live.atTable(live.caio, live.quelm), live.quelm);
    expect(quelm.mainTokens).toEqual([]);
  });

  it('a token:setMain carrying a forged userId gets INVALID_BODY', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await tokenOf(master, [live.bia.id]);
    const caio = await live.atTable(live.caio, live.vharn);

    const ack = await send(caio, 'token:setMain', { ...setMain(lyraId), userId: live.bia.id });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
  });

  it('Ana taking Bia off the control of Lyra drops her choice from the next sync', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await tokenOf(master, [live.bia.id, live.caio.id]);
    const bia = await live.atTable(live.bia, live.vharn);
    const caio = await live.atTable(live.caio, live.vharn);
    await send(bia, 'token:setMain', setMain(lyraId));
    await send(caio, 'token:setMain', setMain(lyraId));

    await send(master, 'token:update', update(lyraId, [live.caio.id]));

    const state = await synced(master, live.vharn);
    expect(state.mainTokens).toEqual([{ userId: live.caio.id, tokenId: lyraId }]);
  });

  it('Ana deleting Lyra drops the choice from the sync', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await tokenOf(master, [live.bia.id]);
    const bia = await live.atTable(live.bia, live.vharn);
    await send(bia, 'token:setMain', setMain(lyraId));

    await send(master, 'token:delete', { ...envelope(live.vharn.id), tokenId: lyraId });

    expect((await synced(bia, live.vharn)).mainTokens).toEqual([]);
  });

  it('after a restart, the board:sync keeps the choice', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await tokenOf(master, [live.bia.id]);
    await send(await live.atTable(live.bia, live.vharn), 'token:setMain', setMain(lyraId));

    await live.restart();

    const state = await synced(await live.atTable(live.caio, live.vharn), live.vharn);
    expect(state.mainTokens).toEqual([{ userId: live.bia.id, tokenId: lyraId }]);
  });

  it('Ana, the master, makes Lyra the main token of Bia: Bia hears token:mainChanged with her own id', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await tokenOf(master, [live.bia.id]);
    const bia = await live.atTable(live.bia, live.vharn);
    const biaEvents = recordEventsOf(bia);

    const ack = await send(master, 'token:setMain', { ...setMain(lyraId), playerId: live.bia.id });

    expect(ack).toEqual({ ok: true, version: 2 });
    const event = mainTokenChangedDto.parse(await eventPayload(biaEvents, 'token:mainChanged'));
    expect(event).toMatchObject({ userId: live.bia.id, tokenId: lyraId });
    expect((await synced(bia, live.vharn)).mainTokens).toEqual([
      { userId: live.bia.id, tokenId: lyraId },
    ]);
  });

  it('Caio, a player, choosing for Bia gets FORBIDDEN even on a token they share', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await tokenOf(master, [live.bia.id, live.caio.id]);
    const caio = await live.atTable(live.caio, live.vharn);

    const ack = await send(caio, 'token:setMain', { ...setMain(lyraId), playerId: live.bia.id });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
  });
});
