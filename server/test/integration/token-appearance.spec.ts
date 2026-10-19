import { tokensFacedDto, tokensRestyledDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

describe('token facing and look over Socket.IO', () => {
  const live = useTokenTable();

  async function lyraOfBia(master: RealtimeClient): Promise<string> {
    const events = recordEventsOf(master);
    await send(master, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
    return (await createdTokenOf(events)).id;
  }

  function face(tokenId: string, facing: number): object {
    return { ...envelope(live.vharn.id), faces: [{ tokenId, facing }] };
  }

  function restyle(tokenId: string, style: object): object {
    return { ...envelope(live.vharn.id), tokenIds: [tokenId], style };
  }

  it('Bia turning her Lyra reaches Ana and Caio as token:facedMany', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);
    const anaEvents = recordEventsOf(master);
    const caioEvents = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const bia = await live.atTable(live.bia, live.vharn);

    expect(await send(bia, 'token:faceMany', face(lyraId, 45))).toEqual({ ok: true, version: 2 });

    for (const recorder of [anaEvents, caioEvents]) {
      const event = tokensFacedDto.parse(await eventPayload(recorder, 'token:facedMany'));
      expect(event).toMatchObject({ version: 2, faces: [{ tokenId: lyraId, facing: 45 }] });
    }
  });

  it('Caio turning the Lyra of Bia gets FORBIDDEN and nobody hears of it', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);
    const anaEvents = recordEventsOf(master);
    const caio = await live.atTable(live.caio, live.vharn);

    const ack = await send(caio, 'token:faceMany', face(lyraId, 90));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    await silence();
    expect(anaEvents.events.map(({ name }) => name)).not.toContain('token:facedMany');
  });

  it('Bia giving Lyra a round frame reaches everyone as token:restyledMany', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);
    const caioEvents = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'token:restyleMany', restyle(lyraId, { frame: 'round' }));

    expect(ack).toEqual({ ok: true, version: 2 });
    const event = tokensRestyledDto.parse(await eventPayload(caioEvents, 'token:restyledMany'));
    expect(event).toMatchObject({ tokenIds: [lyraId], style: { frame: 'round' } });
  });

  it('after a restart, the board:sync keeps the facing and the frame', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);
    const bia = await live.atTable(live.bia, live.vharn);
    await send(bia, 'token:faceMany', face(lyraId, 270));
    await send(bia, 'token:restyleMany', restyle(lyraId, { frame: 'round', flipX: true }));

    await live.restart();

    const state = await synced(await live.atTable(live.caio, live.vharn), live.vharn);
    expect(state.tokens[0]).toMatchObject({ facing: 270, frame: 'round', flipX: true });
  });

  it('Bia marking her Lyra defeated reaches Caio, and a restart keeps the mark', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);
    const caioEvents = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'token:restyleMany', restyle(lyraId, { defeated: true }));

    expect(ack).toEqual({ ok: true, version: 2 });
    const event = tokensRestyledDto.parse(await eventPayload(caioEvents, 'token:restyledMany'));
    expect(event.style).toEqual({ defeated: true });
    await live.restart();
    const state = await synced(await live.atTable(live.caio, live.vharn), live.vharn);
    expect(state.tokens[0]?.defeated).toBe(true);
  });

  it('a turn carrying a forged userId gets INVALID_BODY', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(master);

    const ack = await send(master, 'token:faceMany', { ...face(lyraId, 90), userId: live.bia.id });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
  });
});
