import { describe, expect, it } from 'vitest';
import { recordEventsOf, type EventRecorder } from '../support/realtime-client';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

describe('tokens over Socket.IO', () => {
  const live = useTokenTable();

  async function waitFor(recorder: EventRecorder, name: string): Promise<void> {
    await eventPayload(recorder, name);
  }

  it('Bia receives Lyra with both bars, and Caio only the visible Inspiração at position 1', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caioEvents = recordEventsOf(await live.atTable(live.caio, live.vharn));
    expect(await send(master, 'token:create', tokenCommandFor(live.vharn, live.bia.id))).toEqual({
      ok: true,
      version: 1,
    });
    const forBia = await createdTokenOf(biaEvents);
    const forCaio = await createdTokenOf(caioEvents);
    expect(forBia).toMatchObject({ canControl: true });
    expect(forBia.bars.map(({ label }) => label)).toEqual(['PV', 'Inspiração']);
    expect(forCaio).toMatchObject({ canControl: false });
    expect(forCaio.bars.map(({ label, position }) => [label, position])).toEqual([
      ['Inspiração', 1],
    ]);
  });

  it('Bia moving Lyra reaches the three of them as token:moved one version later', async () => {
    const master = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const biaClient = await live.atTable(live.bia, live.vharn);
    const caioEvents = recordEventsOf(await live.atTable(live.caio, live.vharn));
    await send(master.client, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
    const lyra = await createdTokenOf(caioEvents);
    const ack = await send(biaClient, 'token:move', {
      ...envelope(live.vharn.id),
      tokenId: lyra.id,
      col: 8,
      row: 6,
    });
    expect(ack).toEqual({ ok: true, version: 2 });
    for (const recorder of [master, caioEvents]) {
      await waitFor(recorder, 'token:moved');
      expect(recorder.events.find(({ name }) => name === 'token:moved')?.payload).toMatchObject({
        version: 2,
        tokenId: lyra.id,
        col: 8,
        row: 6,
      });
    }
  });

  it('the board:sync of Caio comes redacted and the one of the master whole', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    await send(master, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
    const forCaio = (await synced(await live.atTable(live.caio, live.vharn), live.vharn)).tokens[0];
    const forAna = (await synced(master, live.vharn)).tokens[0];
    expect(forCaio?.bars.map(({ label }) => label)).toEqual(['Inspiração']);
    expect(forAna?.bars.map(({ label }) => label)).toEqual(['PV', 'Inspiração']);
  });

  it('Caio moving Lyra of Bia is FORBIDDEN and nobody hears a move', async () => {
    const master = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const caioClient = await live.atTable(live.caio, live.vharn);
    await send(master.client, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
    const lyra = await createdTokenOf(master);
    const ack = await send(caioClient, 'token:move', {
      ...envelope(live.vharn.id),
      tokenId: lyra.id,
      col: 1,
      row: 1,
    });
    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    await silence();
    expect(master.events.map(({ name }) => name)).not.toContain('token:moved');
  });

  it('Bia moving Lyra outside the scene is OUT_OF_SCENE', async () => {
    const master = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const biaClient = await live.atTable(live.bia, live.vharn);
    await send(master.client, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
    const lyra = await createdTokenOf(master);
    const ack = await send(biaClient, 'token:move', {
      ...envelope(live.vharn.id),
      tokenId: lyra.id,
      col: 20,
      row: 0,
    });
    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'OUT_OF_SCENE' }) });
  });

  it('a token of another table is TOKEN_NOT_FOUND here, even with its id in hand', async () => {
    const quelmMaster = recordEventsOf(await live.atTable(live.caio, live.quelm));
    await send(quelmMaster.client, 'token:create', {
      ...tokenCommandFor(live.quelm, live.caio.id),
    });
    const quelmToken = await createdTokenOf(quelmMaster);
    const master = await live.atTable(live.ana, live.vharn);
    const ack = await send(master, 'token:move', {
      ...envelope(live.vharn.id),
      tokenId: quelmToken.id,
      col: 1,
      row: 1,
    });
    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'TOKEN_NOT_FOUND' }) });
  });

  it('a command on a table the connection never joined is CAMPAIGN_NOT_FOUND', async () => {
    const biaClient = await live.atTable(live.bia, live.vharn);
    const ack = await send(biaClient, 'token:create', tokenCommandFor(live.quelm, live.bia.id));
    expect(ack).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    });
  });

  it('a create carrying a forged userId is INVALID_BODY', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const ack = await send(master, 'token:create', {
      ...tokenCommandFor(live.vharn, live.bia.id),
      userId: live.ana.id,
    });
    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
  });

  it('after a restart the positions, the bars and the version are kept', async () => {
    const master = recordEventsOf(await live.atTable(live.ana, live.vharn));
    await send(master.client, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
    const lyra = await createdTokenOf(master);
    await send(master.client, 'token:move', {
      ...envelope(live.vharn.id),
      tokenId: lyra.id,
      col: 5,
      row: 5,
    });
    await live.restart();
    const state = await synced(await live.atTable(live.ana, live.vharn), live.vharn);
    expect(state.version).toBe(2);
    expect(state.tokens[0]).toMatchObject({ col: 5, row: 5 });
    expect(state.tokens[0]?.bars).toHaveLength(2);
  });

  describe('appearance', () => {
    it('the master creates Lyra with an image and Bia and Caio receive the same look', async () => {
      const portrait = await live.sendImage(live.ana, live.vharn);
      const master = await live.atTable(live.ana, live.vharn);
      const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));
      const caioEvents = recordEventsOf(await live.atTable(live.caio, live.vharn));
      const look = { imageAssetId: portrait.id, frame: 'round', flipX: true, flipY: false };

      await send(master, 'token:create', tokenCommandFor(live.vharn, live.bia.id, look));

      expect(await createdTokenOf(biaEvents)).toMatchObject({ ...look, facing: 0 });
      expect(await createdTokenOf(caioEvents)).toMatchObject({ ...look, facing: 0 });
    });

    it('an image of Quelm on a Vharn token is ASSET_NOT_FOUND and nobody hears of it', async () => {
      const quelmImage = await live.sendImage(live.caio, live.quelm);
      const master = await live.atTable(live.ana, live.vharn);
      const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));
      const payload = tokenCommandFor(live.vharn, live.bia.id, { imageAssetId: quelmImage.id });

      const ack = await send(master, 'token:create', payload);

      expect(ack).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'ASSET_NOT_FOUND' }),
      });
      await silence();
      expect(biaEvents.events.map(({ name }) => name)).not.toContain('token:created');
    });
  });
});
