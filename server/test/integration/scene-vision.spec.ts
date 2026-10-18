import { describe, expect, it } from 'vitest';
import { recordEventsOf } from '../support/realtime-client';
import { envelope, eventPayload, send, synced } from '../support/live-table';
import { useTokenTable } from '../support/token-table';

const GRID = {
  widthCells: 20,
  heightCells: 12,
  cellDistance: 1.5,
  cellUnit: 'm',
  gridVisible: true,
  gridOpacity: 30,
};

describe('scene vision over Socket.IO', () => {
  const live = useTokenTable();

  function configureOn(campaignId: string, vision?: string): object {
    return { ...envelope(campaignId), ...GRID, ...(vision ? { vision } : {}) };
  }

  it('a scene that already existed comes off (the migration default)', async () => {
    const bia = await live.atTable(live.bia, live.vharn);

    expect((await synced(bia, live.vharn)).scene.vision).toBe('off');
  });

  it('Ana setting the scene dark reaches Bia and Caio in scene:updated', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const ana = await live.atTable(live.ana, live.vharn);

    const ack = await send(ana, 'scene:configure', configureOn(live.vharn.id, 'dark'));

    expect(ack).toEqual({ ok: true, version: 1 });
    for (const recorder of [bia, caio]) {
      expect(await eventPayload(recorder, 'scene:updated')).toMatchObject({
        version: 1,
        scene: { vision: 'dark' },
      });
    }
  });

  it('the sync carries the mode, a configure without vision keeps it, and a restart too', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    await send(ana, 'scene:configure', configureOn(live.vharn.id, 'daylight'));
    await send(ana, 'scene:configure', configureOn(live.vharn.id));

    expect((await synced(ana, live.vharn)).scene.vision).toBe('daylight');
    await live.restart();
    const again = await live.atTable(live.bia, live.vharn);
    expect((await synced(again, live.vharn)).scene.vision).toBe('daylight');
  });
});
