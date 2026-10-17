import { describe, expect, it } from 'vitest';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

describe('token groups over Socket.IO', () => {
  const live = useTokenTable();

  async function createdBy(master: RealtimeClient, command: object): Promise<string> {
    const events = recordEventsOf(master);
    await send(master, 'token:create', command);
    return (await createdTokenOf(events)).id;
  }

  // Bia controls Lyra (3, 4); Caio controls Bram (6, 4) and Kael (7, 4).
  async function vharnTokens(master: RealtimeClient): Promise<Record<string, string>> {
    const lyra = await createdBy(master, tokenCommandFor(live.vharn, live.bia.id));
    const bram = await createdBy(master, tokenCommandFor(live.vharn, live.caio.id, { col: 6 }));
    const kael = await createdBy(master, tokenCommandFor(live.vharn, live.caio.id, { col: 7 }));
    return { lyra, bram, kael };
  }

  function moveMany(moves: object[]): object {
    return { ...envelope(live.vharn.id), moves };
  }

  it('Caio moving his two tokens reaches the three of them as one token:movedMany', async () => {
    const master = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caioEvents = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const { bram = '', kael = '' } = await vharnTokens(master.client);
    const moves = [
      { tokenId: bram, col: 6, row: 8 },
      { tokenId: kael, col: 7, row: 8 },
    ];
    expect(await send(caioEvents.client, 'token:moveMany', moveMany(moves))).toEqual({
      ok: true,
      version: 4,
    });
    for (const recorder of [master, biaEvents, caioEvents]) {
      expect(await eventPayload(recorder, 'token:movedMany')).toMatchObject({ version: 4, moves });
    }
  });

  it('Caio moving his token with the one of Bia is FORBIDDEN and none of them moves', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const caioClient = await live.atTable(live.caio, live.vharn);
    const { lyra = '', bram = '' } = await vharnTokens(master);
    const moves = [
      { tokenId: bram, col: 6, row: 8 },
      { tokenId: lyra, col: 3, row: 8 },
    ];
    const ack = await send(caioClient, 'token:moveMany', moveMany(moves));
    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    const state = await synced(master, live.vharn);
    expect(state.tokens.map(({ row }) => row)).toEqual([4, 4, 4]);
  });

  it('a token of another table in the group is TOKEN_NOT_FOUND', async () => {
    const quelmMaster = await live.atTable(live.caio, live.quelm);
    const quelmToken = await createdBy(quelmMaster, tokenCommandFor(live.quelm, live.caio.id));
    const master = await live.atTable(live.ana, live.vharn);
    const { lyra = '' } = await vharnTokens(master);
    const moves = [
      { tokenId: lyra, col: 1, row: 1 },
      { tokenId: quelmToken, col: 2, row: 1 },
    ];
    const ack = await send(master, 'token:moveMany', moveMany(moves));
    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'TOKEN_NOT_FOUND' }) });
  });

  it('Caio dragging the Lyra of Bia with his Bram is FORBIDDEN and nobody hears a drag', async () => {
    const master = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const caioClient = await live.atTable(live.caio, live.vharn);
    const { lyra = '', bram = '' } = await vharnTokens(master.client);
    const drags = [
      { tokenId: bram, cell: { col: 6, row: 7 } },
      { tokenId: lyra, cell: { col: 3, row: 7 } },
    ];
    const ack = await send(caioClient, 'token:dragMany', { ...envelope(live.vharn.id), drags });
    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    await silence();
    expect(master.events.map(({ name }) => name)).not.toContain('token:draggedMany');
  });

  it('Caio dragging his group reaches the others as token:draggedMany, not himself, and the version stays', async () => {
    const master = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caioEvents = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const { bram = '', kael = '' } = await vharnTokens(master.client);
    const drags = [
      { tokenId: bram, cell: { col: 6, row: 7 } },
      { tokenId: kael, cell: { col: 7, row: 7 } },
    ];
    const command = { ...envelope(live.vharn.id), drags };
    expect(await send(caioEvents.client, 'token:dragMany', command)).toEqual({
      ok: true,
      version: 3,
    });
    for (const recorder of [master, biaEvents]) {
      expect(await eventPayload(recorder, 'token:draggedMany')).toMatchObject({ drags });
    }
    await silence();
    expect(caioEvents.events.map(({ name }) => name)).not.toContain('token:draggedMany');
    expect((await synced(master.client, live.vharn)).version).toBe(3);
  });
});
