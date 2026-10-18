import { tokensResizedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

describe('token resize over Socket.IO', () => {
  const live = useTokenTable();

  async function lyraOfBia(master: RealtimeClient): Promise<string> {
    const events = recordEventsOf(master);
    await send(master, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
    return (await createdTokenOf(events)).id;
  }

  function resize(tokenId: string, box: object): object {
    return { ...envelope(live.vharn.id), resizes: [{ tokenId, ...box }] };
  }

  const WIDE = { col: 2.5, row: 4, width: 1.5, height: 1 };

  it('Bia stretching her Lyra reaches Ana and Caio as token:resizedMany', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);
    const anaEvents = recordEventsOf(master);
    const caioEvents = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'token:resizeMany', resize(lyraId, WIDE));

    expect(ack).toEqual({ ok: true, version: 2 });
    for (const recorder of [anaEvents, caioEvents]) {
      const event = tokensResizedDto.parse(await eventPayload(recorder, 'token:resizedMany'));
      expect(event).toMatchObject({ version: 2, resizes: [{ tokenId: lyraId, ...WIDE }] });
    }
  });

  it('Caio resizing the Lyra of Bia gets FORBIDDEN and nobody hears of it', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);
    const anaEvents = recordEventsOf(master);
    const caio = await live.atTable(live.caio, live.vharn);

    const ack = await send(caio, 'token:resizeMany', resize(lyraId, WIDE));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    await silence();
    expect(anaEvents.events.map(({ name }) => name)).not.toContain('token:resizedMany');
  });

  it('a token of Quelm resized from the Vharn table is TOKEN_NOT_FOUND', async () => {
    const quelmMaster = await live.atTable(live.caio, live.quelm);
    const events = recordEventsOf(quelmMaster);
    await send(quelmMaster, 'token:create', tokenCommandFor(live.quelm, live.caio.id));
    const quelmTokenId = (await createdTokenOf(events)).id;
    const master = await live.atTable(live.ana, live.vharn);

    const ack = await send(master, 'token:resizeMany', resize(quelmTokenId, WIDE));

    expect(ack).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'TOKEN_NOT_FOUND' }),
    });
  });

  it('after a restart, the board:sync keeps the box', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);
    await send(master, 'token:resizeMany', resize(lyraId, WIDE));

    await live.restart();

    const state = await synced(await live.atTable(live.caio, live.vharn), live.vharn);
    expect(state.tokens[0]).toMatchObject(WIDE);
  });

  it('a resize carrying a forged userId gets INVALID_BODY', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);

    const ack = await send(master, 'token:resizeMany', {
      ...resize(lyraId, WIDE),
      userId: live.bia.id,
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
  });
});
