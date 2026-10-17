import { drawingsCreatedDto, type DrawingDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  recordEventsOf,
  type EventRecorder,
  type RealtimeClient,
} from '../support/realtime-client';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { useTokenTable } from '../support/token-table';

const CIRCLE = {
  kind: 'ellipse',
  x: 4,
  y: 4,
  width: 2,
  height: 2,
  fill: 'moss',
  stroke: 'gold',
  strokeWidth: 'medium',
  layer: 'tokens',
};

describe('drawings over Socket.IO', () => {
  const live = useTokenTable();

  function createOn(campaignId: string, drawings: object[] = [CIRCLE]): object {
    return { ...envelope(campaignId), drawings };
  }

  async function drawnBy(client: RealtimeClient, campaignId: string): Promise<DrawingDto> {
    const events = recordEventsOf(client);
    await send(client, 'drawing:createMany', createOn(campaignId));
    return createdOf(events);
  }

  async function createdOf(recorder: EventRecorder): Promise<DrawingDto> {
    const event = drawingsCreatedDto.parse(await eventPayload(recorder, 'drawing:createdMany'));
    const [drawing] = event.drawings;
    if (!drawing) throw new Error('drawing:createdMany carried no drawing');
    return drawing;
  }

  it('Bia drawing a circle reaches Ana and Caio with the new version, and their sync has it', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'drawing:createMany', createOn(live.vharn.id));

    const created = drawingsCreatedDto.parse(await eventPayload(ana, 'drawing:createdMany'));
    expect(ack).toEqual({ ok: true, version: 1, createdIds: created.drawings.map(({ id }) => id) });
    for (const recorder of [ana, caio]) {
      expect(await eventPayload(recorder, 'drawing:createdMany')).toMatchObject({
        version: 1,
        drawings: [{ kind: 'ellipse', x: 4, fill: 'moss', authorId: live.bia.id }],
      });
      expect((await synced(recorder.client, live.vharn)).drawings).toEqual([
        expect.objectContaining({ kind: 'ellipse', authorId: live.bia.id }),
      ]);
    }
  });

  it('Ana moving the drawing of Bia reaches the whole table as drawing:movedMany', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const ana = await live.atTable(live.ana, live.vharn);
    const drawing = await drawnBy(bia.client, live.vharn.id);
    const moves = [{ drawingId: drawing.id, x: 10.5, y: 2 }];

    expect(await send(ana, 'drawing:moveMany', { ...envelope(live.vharn.id), moves })).toEqual({
      ok: true,
      version: 2,
    });
    expect(await eventPayload(bia, 'drawing:movedMany')).toMatchObject({ version: 2, moves });
  });

  it('a drawing survives a restart of the server', async () => {
    const bia = await live.atTable(live.bia, live.vharn);
    await drawnBy(bia, live.vharn.id);

    await live.restart();

    const again = await live.atTable(live.bia, live.vharn);
    expect((await synced(again, live.vharn)).drawings).toEqual([
      expect.objectContaining({ kind: 'ellipse', x: 4, y: 4, width: 2 }),
    ]);
  });

  it('deleting two drawings is one event and one version', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    await send(ana.client, 'drawing:createMany', createOn(live.vharn.id, [CIRCLE, CIRCLE]));
    const { drawings } = drawingsCreatedDto.parse(await eventPayload(ana, 'drawing:createdMany'));
    const drawingIds = drawings.map(({ id }) => id);

    const ack = await send(ana.client, 'drawing:deleteMany', {
      ...envelope(live.vharn.id),
      drawingIds,
    });

    expect(ack).toEqual({ ok: true, version: 2 });
    expect(await eventPayload(ana, 'drawing:deletedMany')).toMatchObject({
      version: 2,
      drawingIds,
    });
    expect((await synced(ana.client, live.vharn)).drawings).toEqual([]);
  });

  it('Caio, master of Quelm, moving a drawing of Vharn from Quelm is DRAWING_NOT_FOUND and Vharn hears nothing', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const drawing = await drawnBy(bia.client, live.vharn.id);
    const caio = await live.atTable(live.caio, live.quelm);
    const moves = [{ drawingId: drawing.id, x: 0, y: 0 }];

    const ack = await send(caio, 'drawing:moveMany', { ...envelope(live.quelm.id), moves });

    expect(ack).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'DRAWING_NOT_FOUND' }),
    });
    await silence();
    expect(bia.events.map(({ name }) => name)).not.toContain('drawing:movedMany');
  });

  it('a forged authorId in the drawing is refused with INVALID_BODY', async () => {
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(
      bia,
      'drawing:createMany',
      createOn(live.vharn.id, [{ ...CIRCLE, authorId: live.ana.id }]),
    );

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
  });

  it('Bia drawing on the objects layer is FORBIDDEN and nothing is saved', async () => {
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(
      bia,
      'drawing:createMany',
      createOn(live.vharn.id, [{ ...CIRCLE, layer: 'objects' }]),
    );

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    expect((await synced(bia, live.vharn)).drawings).toEqual([]);
  });

  it('drawing on a table not open on this connection is CAMPAIGN_NOT_FOUND', async () => {
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'drawing:createMany', createOn(live.quelm.id));

    expect(ack).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    });
  });

  it('an undo whose drawing someone moved since is STALE_UNDO and nothing is published', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const ana = await live.atTable(live.ana, live.vharn);
    const drawing = await drawnBy(bia.client, live.vharn.id);
    await send(ana, 'drawing:moveMany', {
      ...envelope(live.vharn.id),
      moves: [{ drawingId: drawing.id, x: 8, y: 8 }],
    });
    const before = bia.events.length;

    const ack = await send(bia.client, 'drawing:moveMany', {
      ...envelope(live.vharn.id),
      moves: [{ drawingId: drawing.id, x: 0, y: 0, expect: { x: 4, y: 4 } }],
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'STALE_UNDO' }) });
    await silence();
    expect(bia.events.slice(before).map(({ name }) => name)).not.toContain('drawing:movedMany');
  });
});
