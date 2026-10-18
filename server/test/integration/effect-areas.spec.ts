import { effectAreasCreatedDto, type EffectAreaDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  recordEventsOf,
  type EventRecorder,
  type RealtimeClient,
} from '../support/realtime-client';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { useTokenTable } from '../support/token-table';

const CORNER_CONE = {
  kind: 'diagonal_cone',
  x: 6,
  y: 6,
  reach: 3,
  facing: 45,
  color: 'ember',
} as const;
const GROWN_CONE = { ...CORNER_CONE, reach: 4 };

describe('effect areas over Socket.IO', () => {
  const live = useTokenTable();

  function createOn(campaignId: string, effectAreas: object[] = [CORNER_CONE]): object {
    return { ...envelope(campaignId), effectAreas };
  }

  function reshapeOn(campaignId: string, reshapes: object[]): object {
    return { ...envelope(campaignId), reshapes };
  }

  async function createdBy(client: RealtimeClient, campaignId: string): Promise<EffectAreaDto> {
    const events = recordEventsOf(client);
    await send(client, 'effectArea:createMany', createOn(campaignId));
    return createdOf(events);
  }

  async function createdOf(recorder: EventRecorder): Promise<EffectAreaDto> {
    const payload = await eventPayload(recorder, 'effectArea:createdMany');
    const [area] = effectAreasCreatedDto.parse(payload).effectAreas;
    if (!area) throw new Error('effectArea:createdMany carried no area');
    return area;
  }

  it('Bia creating a diagonal cone reaches Ana and Caio with the version, and the ack names the id', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'effectArea:createMany', createOn(live.vharn.id));

    const created = await createdOf(ana);
    expect(ack).toEqual({ ok: true, version: 1, createdIds: [created.id] });
    for (const recorder of [ana, caio]) {
      expect(await eventPayload(recorder, 'effectArea:createdMany')).toMatchObject({
        version: 1,
        effectAreas: [{ ...CORNER_CONE, authorId: live.bia.id }],
      });
    }
  });

  it('the board:sync of Ana carries the area of Bia in effectAreas', async () => {
    const bia = await live.atTable(live.bia, live.vharn);
    const area = await createdBy(bia, live.vharn.id);
    const ana = await live.atTable(live.ana, live.vharn);

    expect((await synced(ana, live.vharn)).effectAreas).toEqual([area]);
  });

  it('Caio stretching the area of Bia is FORBIDDEN and no one hears an event', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const area = await createdBy(bia.client, live.vharn.id);
    const caio = await live.atTable(live.caio, live.vharn);

    const ack = await send(
      caio,
      'effectArea:reshapeMany',
      reshapeOn(live.vharn.id, [{ effectAreaId: area.id, shape: GROWN_CONE }]),
    );

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    await silence();
    expect(bia.events.map(({ name }) => name)).not.toContain('effectArea:reshapedMany');
  });

  it('Ana, the master, deleting the area of Bia reaches the three of them', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const area = await createdBy(bia.client, live.vharn.id);

    const ack = await send(ana.client, 'effectArea:deleteMany', {
      ...envelope(live.vharn.id),
      effectAreaIds: [area.id],
    });

    expect(ack).toEqual({ ok: true, version: 2 });
    for (const recorder of [ana, bia, caio]) {
      expect(await eventPayload(recorder, 'effectArea:deletedMany')).toMatchObject({
        version: 2,
        effectAreaIds: [area.id],
      });
    }
  });

  it('Caio, master of Quelm, reshaping an area of Vharn from Quelm is EFFECT_AREA_NOT_FOUND and Vharn hears nothing', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const area = await createdBy(bia.client, live.vharn.id);
    const caio = await live.atTable(live.caio, live.quelm);

    const ack = await send(
      caio,
      'effectArea:reshapeMany',
      reshapeOn(live.quelm.id, [{ effectAreaId: area.id, shape: GROWN_CONE }]),
    );

    expect(ack).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'EFFECT_AREA_NOT_FOUND' }),
    });
    await silence();
    expect(bia.events.map(({ name }) => name)).not.toContain('effectArea:reshapedMany');
    expect((await synced(bia.client, live.vharn)).effectAreas).toEqual([area]);
  });

  it('a forged authorId in the area is refused with INVALID_BODY', async () => {
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(
      bia,
      'effectArea:createMany',
      createOn(live.vharn.id, [{ ...CORNER_CONE, authorId: live.ana.id }]),
    );

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
  });

  it('creating on a table not open on this connection is CAMPAIGN_NOT_FOUND', async () => {
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'effectArea:createMany', createOn(live.quelm.id));

    expect(ack).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    });
  });

  it('an undo whose area someone stretched since is STALE_UNDO and nothing is published', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const ana = await live.atTable(live.ana, live.vharn);
    const area = await createdBy(bia.client, live.vharn.id);
    await send(
      ana,
      'effectArea:reshapeMany',
      reshapeOn(live.vharn.id, [{ effectAreaId: area.id, shape: GROWN_CONE }]),
    );
    const before = bia.events.length;

    const ack = await send(
      bia.client,
      'effectArea:reshapeMany',
      reshapeOn(live.vharn.id, [
        { effectAreaId: area.id, shape: { ...CORNER_CONE, reach: 2 }, expect: CORNER_CONE },
      ]),
    );

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'STALE_UNDO' }) });
    await silence();
    expect(bia.events.slice(before).map(({ name }) => name)).not.toContain(
      'effectArea:reshapedMany',
    );
  });

  it('an area survives a restart of the server', async () => {
    const bia = await live.atTable(live.bia, live.vharn);
    const area = await createdBy(bia, live.vharn.id);

    await live.restart();

    const again = await live.atTable(live.bia, live.vharn);
    expect((await synced(again, live.vharn)).effectAreas).toEqual([area]);
  });
});
