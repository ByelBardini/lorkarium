import { apiErrorDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { setAccountPlan } from '../support/account-plans';
import { envelope, send, silence } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import { charactersSynced } from '../support/table-characters';
import type { Table } from '../support/tables';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
beforeEach(() => setAccountPlan(live.connection.db, live.ana.id, 'amigo_do_dono'));

function phasesOf(names: readonly string[], imageAssetId: string | null = null): object[] {
  return names.map((name) => ({ name, icon: 'game-icons:moon-orbit', imageAssetId }));
}

function tideCommand(table: Table, overrides: Record<string, unknown> = {}): object {
  return {
    ...envelope(table.id),
    name: 'Maré',
    holder: { kind: 'table' },
    visibility: 'everyone',
    seerIds: [],
    chooserIds: [],
    announce: false,
    phases: phasesOf(['Baixa', 'Subindo', 'Alta']),
    ...overrides,
  };
}

function planLimitOf(ack: unknown): unknown {
  const { error } = ack as { error: unknown };
  return apiErrorDto.parse(error).planLimit;
}

describe("the round cycles hold to the table owner's plan", () => {
  it('at Ana’s free table the 2nd cycle is PLAN_LIMIT and Bia hears nothing', async () => {
    await setAccountPlan(live.connection.db, live.ana.id, 'free');
    const ana = await live.atTable(live.ana, live.vharn);
    expect(await send(ana, 'cycle:define', tideCommand(live.vharn))).toMatchObject({ ok: true });
    const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));

    const ack = await send(ana, 'cycle:define', tideCommand(live.vharn, { name: 'Céu' }));

    expect(planLimitOf(ack)).toEqual({
      resource: 'roundCycles',
      limit: 1,
      plan: 'free',
      reason: 'room',
    });
    await silence();
    expect(biaEvents.events.filter(({ name }) => name === 'cycle:listChanged')).toEqual([]);
  });

  it('at a free table 4 phases are refused and 3 are kept with their icon', async () => {
    await setAccountPlan(live.connection.db, live.ana.id, 'free');
    const ana = await live.atTable(live.ana, live.vharn);
    const four = phasesOf(['Nova', 'Crescente', 'Cheia', 'Minguante']);

    const refused = await send(ana, 'cycle:define', tideCommand(live.vharn, { phases: four }));
    const kept = await send(ana, 'cycle:define', tideCommand(live.vharn));

    expect(planLimitOf(refused)).toMatchObject({ resource: 'roundCyclePhases', limit: 3 });
    expect(kept).toMatchObject({ ok: true });
    const [cycle] = (await charactersSynced(ana, live.vharn)).roundCycles;
    expect(cycle?.phases.map(({ icon }) => icon)).toEqual([
      'game-icons:moon-orbit',
      'game-icons:moon-orbit',
      'game-icons:moon-orbit',
    ]);
  });

  it('at a free table a phase with an image is refused; on Narrador it is kept', async () => {
    const image = await live.sendImage(live.ana, live.vharn);
    const pictured = { phases: phasesOf(['Baixa', 'Alta'], image.id) };
    await setAccountPlan(live.connection.db, live.ana.id, 'free');
    const onFree = await live.atTable(live.ana, live.vharn);

    const refused = await send(onFree, 'cycle:define', tideCommand(live.vharn, pictured));
    await setAccountPlan(live.connection.db, live.ana.id, 'narrador');
    const onNarrador = await live.atTable(live.ana, live.vharn);
    const kept = await send(onNarrador, 'cycle:define', tideCommand(live.vharn, pictured));

    expect(planLimitOf(refused)).toEqual({
      resource: 'roundCyclePhaseImage',
      limit: 0,
      plan: 'free',
      reason: 'room',
    });
    expect(kept).toMatchObject({ ok: true });
  });

  it('after Ana went down to free, the newer cycle is planLocked, its edit readOnly, its delete free', async () => {
    const before = await live.atTable(live.ana, live.vharn);
    await send(before, 'cycle:define', tideCommand(live.vharn));
    await send(before, 'cycle:define', tideCommand(live.vharn, { name: 'Céu' }));
    await setAccountPlan(live.connection.db, live.ana.id, 'free');
    const ana = await live.atTable(live.ana, live.vharn);
    const listed = (await charactersSynced(ana, live.vharn)).roundCycles;
    expect(listed.map(({ name, planLocked }) => [name, planLocked])).toEqual([
      ['Maré', false],
      ['Céu', true],
    ]);
    const sky = listed[1]?.id;

    const edit = await send(ana, 'cycle:update', {
      ...tideCommand(live.vharn, { name: 'Céu 2' }),
      cycleId: sky,
    });
    const removed = await send(ana, 'cycle:delete', { ...envelope(live.vharn.id), cycleId: sky });

    expect(planLimitOf(edit)).toMatchObject({ resource: 'roundCycles', reason: 'readOnly' });
    expect(removed).toMatchObject({ ok: true });
  });
});
