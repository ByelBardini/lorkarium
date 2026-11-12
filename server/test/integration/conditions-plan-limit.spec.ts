import {
  apiErrorDto,
  conditionDefinitionUpdatedDto,
  type BoardStateDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { setAccountPlan } from '../support/account-plans';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import type { Table } from '../support/tables';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

function cegoOf(state: BoardStateDto): BoardStateDto['conditionDefinitions'][number] {
  const found = state.conditionDefinitions.find(({ name }) => name === 'Cego');
  if (!found) throw new Error('no condition named Cego in the snapshot');
  return found;
}

function sangrandoDefine(table: Table, imageAssetId: string | null): Record<string, unknown> {
  const fields = { name: 'Sangrando', tone: 'harm', icon: 'droplet', imageAssetId };
  return { ...envelope(table.id), ...fields };
}

function cegoEdit(
  table: Table,
  conditionId: string,
  changes: Readonly<{ imageAssetId: string | null; description?: string }>,
): Record<string, unknown> {
  return {
    ...envelope(table.id),
    conditionId,
    name: 'Cego',
    tone: 'harm',
    icon: 'eye-off',
    look: null,
    color: null,
    description: '',
    maxStacks: null,
    ...changes,
  };
}

function planLimitOf(ack: unknown): unknown {
  const { error } = ack as { error: unknown };
  return apiErrorDto.parse(error).planLimit;
}

describe("the image of a condition holds to the table owner's plan", () => {
  it('at Ana’s free table, condition:define with an image is PLAN_LIMIT and Bia hears nothing', async () => {
    const image = await live.sendImage(live.ana, live.vharn);
    await setAccountPlan(live.connection.db, live.ana.id, 'free');
    const ana = await live.atTable(live.ana, live.vharn);
    const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));

    const ack = await send(ana, 'condition:define', sangrandoDefine(live.vharn, image.id));

    expect(ack).toMatchObject({ ok: false, error: { code: 'PLAN_LIMIT' } });
    expect(planLimitOf(ack)).toEqual({ resource: 'conditionImage', limit: 0, plan: 'free' });
    await silence();
    expect(biaEvents.events.filter(({ name }) => name === 'condition:defined')).toEqual([]);
    const names = (await synced(ana, live.vharn)).conditionDefinitions.map(({ name }) => name);
    expect(names).not.toContain('Sangrando');
  });

  it('at Ana’s free table, the same condition without an image is defined', async () => {
    await setAccountPlan(live.connection.db, live.ana.id, 'free');
    const ana = await live.atTable(live.ana, live.vharn);

    const ack = await send(ana, 'condition:define', sangrandoDefine(live.vharn, null));

    expect(ack).toMatchObject({ ok: true });
  });

  it('at Ana’s free table, condition:updateDefinition putting an image is PLAN_LIMIT, Cego stays', async () => {
    const image = await live.sendImage(live.ana, live.vharn);
    await setAccountPlan(live.connection.db, live.ana.id, 'free');
    const ana = await live.atTable(live.ana, live.vharn);
    const cego = cegoOf(await synced(ana, live.vharn)).id;

    const ack = await send(
      ana,
      'condition:updateDefinition',
      cegoEdit(live.vharn, cego, { imageAssetId: image.id }),
    );

    expect(planLimitOf(ack)).toEqual({ resource: 'conditionImage', limit: 0, plan: 'free' });
    expect(cegoOf(await synced(ana, live.vharn)).imageAssetId).toBeNull();
  });

  it('Cego given an image on narrador keeps it after Ana goes down to free, and its text is edited', async () => {
    const image = await live.sendImage(live.ana, live.vharn);
    await setAccountPlan(live.connection.db, live.ana.id, 'narrador');
    const ana = await live.atTable(live.ana, live.vharn);
    const cego = cegoOf(await synced(ana, live.vharn)).id;
    await send(
      ana,
      'condition:updateDefinition',
      cegoEdit(live.vharn, cego, { imageAssetId: image.id }),
    );
    await setAccountPlan(live.connection.db, live.ana.id, 'free');
    const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));

    const edit = cegoEdit(live.vharn, cego, { imageAssetId: image.id, description: 'Não vê.' });
    const ack = await send(ana, 'condition:updateDefinition', edit);

    expect(ack).toMatchObject({ ok: true });
    const updated = conditionDefinitionUpdatedDto.parse(
      await eventPayload(biaEvents, 'condition:definitionUpdated'),
    );
    expect(updated.definition).toMatchObject({ imageAssetId: image.id, description: 'Não vê.' });
  });

  it('Caio lenda defines with an image at Quelm while Ana’s Vharn is free: each table reads its own owner', async () => {
    const image = await live.sendImage(live.caio, live.quelm);
    await setAccountPlan(live.connection.db, live.ana.id, 'free');
    await setAccountPlan(live.connection.db, live.caio.id, 'lenda');
    const caio = await live.atTable(live.caio, live.quelm);

    const ack = await send(caio, 'condition:define', sangrandoDefine(live.quelm, image.id));

    expect(ack).toMatchObject({ ok: true });
  });
});
