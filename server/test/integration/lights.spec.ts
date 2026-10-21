import { lightsCreatedDto, type LightDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import {
  recordEventsOf,
  type EventRecorder,
  type RealtimeClient,
} from '../support/realtime-client';
import { useTokenTable } from '../support/token-table';

const WALL_TORCH = { x: 5.5, y: 3, bright: 4, dim: 4 } as const;
const BRAZIER = { x: 10, y: 8, bright: 2, dim: 6 } as const;

describe('map lights over Socket.IO', () => {
  const live = useTokenTable();

  function createOn(campaignId: string, lights: object[] = [WALL_TORCH]): object {
    return { ...envelope(campaignId), lights };
  }

  async function createdOf(recorder: EventRecorder): Promise<LightDto[]> {
    return lightsCreatedDto.parse(await eventPayload(recorder, 'light:createdMany')).lights;
  }

  async function createdBy(
    client: RealtimeClient,
    campaignId: string,
    lights: object[] = [WALL_TORCH],
  ): Promise<LightDto> {
    const events = recordEventsOf(client);
    await send(client, 'light:createMany', createOn(campaignId, lights));
    const [created] = await createdOf(events);
    if (!created) throw new Error('light:createdMany carried no light');
    return created;
  }

  it('Ana creating a torch and a brazier reaches Bia and Caio lit, and the ack names the ids', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const ana = await live.atTable(live.ana, live.vharn);

    const ack = await send(ana, 'light:createMany', createOn(live.vharn.id, [WALL_TORCH, BRAZIER]));

    const created = await createdOf(bia);
    expect(ack).toEqual({ ok: true, version: 1, createdIds: created.map(({ id }) => id) });
    expect(created).toEqual([
      { ...WALL_TORCH, id: expect.any(String), lit: true, color: null, facing: 0, angle: 360 },
      { ...BRAZIER, id: expect.any(String), lit: true, color: null, facing: 0, angle: 360 },
    ]);
    expect(await createdOf(caio)).toEqual(created);
  });

  it('the board:sync of Bia carries the lights', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const torch = await createdBy(ana, live.vharn.id);
    const bia = await live.atTable(live.bia, live.vharn);

    expect((await synced(bia, live.vharn)).lights).toEqual([torch]);
  });

  it('Ana creating an arcane light reaches Bia and Caio with its color, and their sync keeps it', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const ana = await live.atTable(live.ana, live.vharn);

    await send(
      ana,
      'light:createMany',
      createOn(live.vharn.id, [{ ...WALL_TORCH, color: 'arcane' }]),
    );

    expect((await createdOf(bia)).map(({ color }) => color)).toEqual(['arcane']);
    expect((await createdOf(caio)).map(({ color }) => color)).toEqual(['arcane']);
    const again = await live.atTable(live.bia, live.vharn);
    expect((await synced(again, live.vharn)).lights.map(({ color }) => color)).toEqual(['arcane']);
  });

  it('a light with a hex color is INVALID_BODY and no one hears an event', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const ana = await live.atTable(live.ana, live.vharn);

    const ack = await send(
      ana,
      'light:createMany',
      createOn(live.vharn.id, [{ ...WALL_TORCH, color: '#00f' }]),
    );

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
    await silence();
    expect(bia.events.map(({ name }) => name)).not.toContain('light:createdMany');
  });

  it('the sync of Quelm does not carry the colored light of Vharn', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    await send(
      ana,
      'light:createMany',
      createOn(live.vharn.id, [{ ...WALL_TORCH, color: 'infernal' }]),
    );
    const caio = await live.atTable(live.caio, live.quelm);

    expect((await synced(caio, live.quelm)).lights).toEqual([]);
  });

  it('Bia creating a light is FORBIDDEN and no one hears an event', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'light:createMany', createOn(live.vharn.id));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    await silence();
    expect(ana.events.map(({ name }) => name)).not.toContain('light:createdMany');
  });

  it('Ana moving, ranging, putting out and deleting reach the three, each in one version', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const { id: lightId } = await createdBy(ana.client, live.vharn.id);

    const acks = [
      await send(ana.client, 'light:moveMany', {
        ...envelope(live.vharn.id),
        moves: [{ lightId, x: 3, y: 5 }],
      }),
      await send(ana.client, 'light:setRangeMany', {
        ...envelope(live.vharn.id),
        changes: [{ lightId, bright: 6, dim: 6 }],
      }),
      await send(ana.client, 'light:setLitMany', {
        ...envelope(live.vharn.id),
        lightIds: [lightId],
        lit: false,
      }),
      await send(ana.client, 'light:deleteMany', {
        ...envelope(live.vharn.id),
        lightIds: [lightId],
      }),
    ];

    expect(acks).toEqual([2, 3, 4, 5].map((version) => ({ ok: true, version })));
    for (const recorder of [ana, bia, caio]) {
      expect(await eventPayload(recorder, 'light:movedMany')).toMatchObject({
        version: 2,
        moves: [{ lightId, x: 3, y: 5 }],
      });
      expect(await eventPayload(recorder, 'light:rangesChanged')).toMatchObject({
        version: 3,
        changes: [{ lightId, bright: 6, dim: 6 }],
      });
      expect(await eventPayload(recorder, 'light:litChanged')).toMatchObject({
        version: 4,
        lightIds: [lightId],
        lit: false,
      });
      expect(await eventPayload(recorder, 'light:deletedMany')).toMatchObject({
        version: 5,
        lightIds: [lightId],
      });
    }
  });

  it('Ana painting two lights necrotic reaches the three in one light:colorsChanged, and the sync keeps it', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    await send(ana.client, 'light:createMany', createOn(live.vharn.id, [WALL_TORCH, BRAZIER]));
    const ids = (await createdOf(ana)).map(({ id }) => id);
    const changes = ids.map((lightId) => ({ lightId, color: 'necrotic' }));

    const ack = await send(ana.client, 'light:setColorMany', {
      ...envelope(live.vharn.id),
      changes,
    });

    expect(ack).toEqual({ ok: true, version: 2 });
    for (const recorder of [ana, bia, caio]) {
      expect(await eventPayload(recorder, 'light:colorsChanged')).toMatchObject({
        version: 2,
        changes,
      });
      expect(recorder.events.filter(({ name }) => name === 'light:colorsChanged')).toHaveLength(1);
    }
    const again = await live.atTable(live.bia, live.vharn);
    expect((await synced(again, live.vharn)).lights.map(({ color }) => color)).toEqual([
      'necrotic',
      'necrotic',
    ]);
  });

  it('Bia coloring a light is FORBIDDEN and no one hears an event', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const torch = await createdBy(ana.client, live.vharn.id);
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'light:setColorMany', {
      ...envelope(live.vharn.id),
      changes: [{ lightId: torch.id, color: 'fire' }],
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    await silence();
    expect(ana.events.map(({ name }) => name)).not.toContain('light:colorsChanged');
  });

  it('a light of Quelm in a color command of Vharn is LIGHT_NOT_FOUND', async () => {
    const caio = await live.atTable(live.caio, live.quelm);
    const quelmTorch = await createdBy(caio, live.quelm.id);
    const ana = await live.atTable(live.ana, live.vharn);

    const ack = await send(ana, 'light:setColorMany', {
      ...envelope(live.vharn.id),
      changes: [{ lightId: quelmTorch.id, color: 'fire' }],
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'LIGHT_NOT_FOUND' }) });
    expect((await synced(caio, live.quelm)).lights).toEqual([quelmTorch]);
  });

  it('a color command carrying a forged userId is INVALID_BODY', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const torch = await createdBy(ana, live.vharn.id);

    const ack = await send(ana, 'light:setColorMany', {
      ...envelope(live.vharn.id),
      userId: live.bia.id,
      changes: [{ lightId: torch.id, color: 'fire' }],
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
  });

  it('a color undo whose light changed color since is STALE_UNDO', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const torch = await createdBy(ana, live.vharn.id, [{ ...WALL_TORCH, color: 'moon' }]);

    const ack = await send(ana, 'light:setColorMany', {
      ...envelope(live.vharn.id),
      changes: [{ lightId: torch.id, color: null, expect: { color: 'fire' } }],
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'STALE_UNDO' }) });
  });

  it('a color set by the master survives a restart', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const torch = await createdBy(ana, live.vharn.id);
    await send(ana, 'light:setColorMany', {
      ...envelope(live.vharn.id),
      changes: [{ lightId: torch.id, color: 'candle' }],
    });

    await live.restart();

    const again = await live.atTable(live.bia, live.vharn);
    expect((await synced(again, live.vharn)).lights).toEqual([{ ...torch, color: 'candle' }]);
  });

  it('a light of Quelm in a command of Vharn is LIGHT_NOT_FOUND, nothing is heard and Quelm keeps it', async () => {
    const caio = await live.atTable(live.caio, live.quelm);
    const quelmTorch = await createdBy(caio, live.quelm.id);
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));

    const ack = await send(ana.client, 'light:setLitMany', {
      ...envelope(live.vharn.id),
      lightIds: [quelmTorch.id],
      lit: false,
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'LIGHT_NOT_FOUND' }) });
    await silence();
    expect(ana.events.map(({ name }) => name)).not.toContain('light:litChanged');
    expect((await synced(caio, live.quelm)).lights).toEqual([quelmTorch]);
  });

  it('the sync of Quelm does not carry the lights of Vharn', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    await createdBy(ana, live.vharn.id);
    const caio = await live.atTable(live.caio, live.quelm);

    expect((await synced(caio, live.quelm)).lights).toEqual([]);
  });

  it('a create carrying a forged userId is refused with INVALID_BODY', async () => {
    const ana = await live.atTable(live.ana, live.vharn);

    const ack = await send(ana, 'light:createMany', {
      ...createOn(live.vharn.id),
      userId: live.bia.id,
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
  });

  it('creating on a table not open on this connection is CAMPAIGN_NOT_FOUND', async () => {
    const ana = await live.atTable(live.ana, live.vharn);

    const ack = await send(ana, 'light:createMany', createOn(live.quelm.id));

    expect(ack).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    });
  });

  it('a light past the edge of the scene is OUT_OF_SCENE', async () => {
    const ana = await live.atTable(live.ana, live.vharn);

    const ack = await send(
      ana,
      'light:createMany',
      createOn(live.vharn.id, [{ ...WALL_TORCH, x: 60 }]),
    );

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'OUT_OF_SCENE' }) });
  });

  it('an undo whose light moved since is STALE_UNDO and nothing is published', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const torch = await createdBy(ana.client, live.vharn.id);
    await send(ana.client, 'light:moveMany', {
      ...envelope(live.vharn.id),
      moves: [{ lightId: torch.id, x: 3, y: 5 }],
    });
    const before = ana.events.length;

    const ack = await send(ana.client, 'light:deleteMany', {
      ...envelope(live.vharn.id),
      lightIds: [torch.id],
      expect: [{ lightId: torch.id, x: 5.5, y: 3 }],
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'STALE_UNDO' }) });
    await silence();
    expect(ana.events.slice(before).map(({ name }) => name)).not.toContain('light:deletedMany');
  });

  it('the lights, their color and whether they are lit survive a restart of the server', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const torch = await createdBy(ana, live.vharn.id, [{ ...WALL_TORCH, color: 'necrotic' }]);
    await send(ana, 'light:setLitMany', {
      ...envelope(live.vharn.id),
      lightIds: [torch.id],
      lit: false,
    });

    await live.restart();

    const again = await live.atTable(live.bia, live.vharn);
    expect((await synced(again, live.vharn)).lights).toEqual([
      { ...torch, lit: false, color: 'necrotic' },
    ]);
  });

  const SPOTLIGHT = { ...WALL_TORCH, facing: 90, angle: 60 };

  function aimOn(campaignId: string, changes: object[]): object {
    return { ...envelope(campaignId), changes };
  }

  it('Ana creating a spotlight aimed at 90 and opening 60 reaches Bia and Caio with both', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const ana = await live.atTable(live.ana, live.vharn);

    await send(ana, 'light:createMany', createOn(live.vharn.id, [SPOTLIGHT]));

    for (const recorder of [bia, caio]) {
      expect(await createdOf(recorder)).toMatchObject([{ facing: 90, angle: 60 }]);
    }
  });

  it('the spotlight keeps its cone in the sync and after a restart', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const spotlight = await createdBy(ana, live.vharn.id, [SPOTLIGHT]);

    await live.restart();

    const again = await live.atTable(live.bia, live.vharn);
    expect((await synced(again, live.vharn)).lights).toEqual([spotlight]);
  });

  it('a light sent without a cone looks right and shines every side', async () => {
    const ana = await live.atTable(live.ana, live.vharn);

    expect(await createdBy(ana, live.vharn.id)).toMatchObject({ facing: 0, angle: 360 });
  });

  it('a light with an angle of 0 is INVALID_BODY and no one hears an event', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const ana = await live.atTable(live.ana, live.vharn);

    const ack = await send(
      ana,
      'light:createMany',
      createOn(live.vharn.id, [{ ...SPOTLIGHT, angle: 0 }]),
    );

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
    await silence();
    expect(bia.events.map(({ name }) => name)).not.toContain('light:createdMany');
  });

  it('the sync of Quelm does not carry the spotlight of Vharn', async () => {
    await createdBy(await live.atTable(live.ana, live.vharn), live.vharn.id, [SPOTLIGHT]);

    const caio = await live.atTable(live.caio, live.quelm);

    expect((await synced(caio, live.quelm)).lights).toEqual([]);
  });

  it('Ana aiming two lights reaches the three in one light:conesChanged, and the sync keeps it', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    await send(ana.client, 'light:createMany', createOn(live.vharn.id, [WALL_TORCH, BRAZIER]));
    const ids = (await createdOf(ana)).map(({ id }) => id);
    const changes = ids.map((lightId) => ({ lightId, facing: 180, angle: 90 }));

    const ack = await send(ana.client, 'light:setConeMany', aimOn(live.vharn.id, changes));

    expect(ack).toEqual({ ok: true, version: 2 });
    for (const recorder of [ana, bia, caio]) {
      expect(await eventPayload(recorder, 'light:conesChanged')).toMatchObject({
        version: 2,
        changes,
      });
      expect(recorder.events.filter(({ name }) => name === 'light:conesChanged')).toHaveLength(1);
    }
    const again = await live.atTable(live.bia, live.vharn);
    expect(
      (await synced(again, live.vharn)).lights.map(({ facing, angle }) => [facing, angle]),
    ).toEqual([
      [180, 90],
      [180, 90],
    ]);
  });

  it('Bia aiming a light is FORBIDDEN and no one hears an event', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const torch = await createdBy(ana.client, live.vharn.id);
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(
      bia,
      'light:setConeMany',
      aimOn(live.vharn.id, [{ lightId: torch.id, facing: 90, angle: 60 }]),
    );

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    await silence();
    expect(ana.events.map(({ name }) => name)).not.toContain('light:conesChanged');
  });

  it('a light of Quelm in a cone command of Vharn is LIGHT_NOT_FOUND', async () => {
    const caio = await live.atTable(live.caio, live.quelm);
    const quelmTorch = await createdBy(caio, live.quelm.id);
    const ana = await live.atTable(live.ana, live.vharn);

    const ack = await send(
      ana,
      'light:setConeMany',
      aimOn(live.vharn.id, [{ lightId: quelmTorch.id, facing: 90, angle: 60 }]),
    );

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'LIGHT_NOT_FOUND' }) });
    expect((await synced(caio, live.quelm)).lights).toEqual([quelmTorch]);
  });

  it('a cone undo whose light was aimed since is STALE_UNDO', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const spotlight = await createdBy(ana, live.vharn.id, [SPOTLIGHT]);
    const undo = {
      lightId: spotlight.id,
      facing: 0,
      angle: 360,
      expect: { facing: 45, angle: 60 },
    };

    const ack = await send(ana, 'light:setConeMany', aimOn(live.vharn.id, [undo]));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'STALE_UNDO' }) });
  });

  it('a cone set by the master survives a restart', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const torch = await createdBy(ana, live.vharn.id);
    await send(
      ana,
      'light:setConeMany',
      aimOn(live.vharn.id, [{ lightId: torch.id, facing: 270, angle: 45 }]),
    );

    await live.restart();

    const again = await live.atTable(live.bia, live.vharn);
    expect((await synced(again, live.vharn)).lights).toEqual([
      { ...torch, facing: 270, angle: 45 },
    ]);
  });

  it.each([
    ['a forged userId', { userId: 'forged' }, { facing: 90 }],
    ['a facing of 360', {}, { facing: 360 }],
  ])('a cone command carrying %s is INVALID_BODY', async (_name, extra, cone) => {
    const ana = await live.atTable(live.ana, live.vharn);
    const torch = await createdBy(ana, live.vharn.id);
    const changes = [{ lightId: torch.id, angle: 60, ...cone }];

    const ack = await send(ana, 'light:setConeMany', {
      ...aimOn(live.vharn.id, changes),
      ...extra,
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
  });
});
