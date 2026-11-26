import { roundCyclesChangedDto, type RoundCyclesChangedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { envelope, eventPayload, send, silence } from '../support/live-table';
import {
  recordEventsOf,
  type EventRecorder,
  type RealtimeClient,
} from '../support/realtime-client';
import { charactersSynced } from '../support/table-characters';
import type { Table } from '../support/tables';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

const PHASES = ['Lua Nova', 'Crescente', 'Lua Cheia', 'Minguante'].map((name) => ({
  name,
  imageAssetId: null,
}));

function moonCommand(table: Table, overrides: Record<string, unknown> = {}): object {
  return {
    ...envelope(table.id),
    name: 'Fases da Lua',
    holder: { kind: 'table' },
    visibility: 'some',
    seerIds: [live.bia.id],
    chooserIds: [live.bia.id],
    announce: true,
    phases: PHASES,
    ...overrides,
  };
}

async function listChanged(recorder: EventRecorder): Promise<RoundCyclesChangedDto> {
  return roundCyclesChangedDto.parse(await eventPayload(recorder, 'cycle:listChanged'));
}

async function dudaAtVharn(): Promise<RealtimeClient> {
  const duda = await live.signUp('Duda');
  await live.joinAsSpectator(duda, live.vharn);
  return live.atTable(duda, live.vharn);
}

describe('cycle:define', () => {
  it('a cycle seen by Bia reaches her whole, and Caio and Duda get the list without it in the same version', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const anaEvents = recordEventsOf(ana);
    const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caioEvents = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const dudaEvents = recordEventsOf(await dudaAtVharn());
    const before = (await charactersSynced(ana, live.vharn)).version;

    const ack = await send(ana, 'cycle:define', moonCommand(live.vharn));

    expect(ack).toEqual({ ok: true, version: before + 1 });
    const [toAna, toBia, toCaio, toDuda] = await Promise.all(
      [anaEvents, biaEvents, caioEvents, dudaEvents].map(listChanged),
    );
    for (const event of [toAna, toBia, toCaio, toDuda]) expect(event?.version).toBe(before + 1);
    expect(toAna?.cycles[0]?.config).toMatchObject({ visibility: 'some', seerIds: [live.bia.id] });
    expect(toBia?.cycles.map(({ name, canChoose, config }) => [name, canChoose, config])).toEqual([
      ['Fases da Lua', true, null],
    ]);
    expect(toCaio?.cycles).toEqual([]);
    expect(toDuda?.cycles).toEqual([]);
  });

  it('the character:sync of each member holds what they see, in the same version', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const bia = await live.atTable(live.bia, live.vharn);
    const caio = await live.atTable(live.caio, live.vharn);
    const ack = await send(ana, 'cycle:define', moonCommand(live.vharn));

    const version = ack.ok ? ack.version : -1;
    const ofAna = await charactersSynced(ana, live.vharn);
    const ofBia = await charactersSynced(bia, live.vharn);
    const ofCaio = await charactersSynced(caio, live.vharn);

    expect([ofAna.version, ofBia.version, ofCaio.version]).toEqual([version, version, version]);
    expect(ofAna.roundCycles.map(({ name }) => name)).toEqual(['Fases da Lua']);
    expect(ofBia.roundCycles.map(({ canChoose }) => canChoose)).toEqual([true]);
    expect(ofCaio.roundCycles).toEqual([]);
  });

  it('a cycle everyone sees reaches Caio with no config and nothing to choose', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const caioEvents = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const everyone = { visibility: 'everyone', seerIds: [], chooserIds: [live.bia.id] };

    await send(ana, 'cycle:define', moonCommand(live.vharn, everyone));

    const [cycle] = (await listChanged(caioEvents)).cycles;
    expect(cycle).toMatchObject({ name: 'Fases da Lua', canChoose: false, config: null });
    expect(cycle?.phases.map(({ name }) => name)).toEqual([
      'Lua Nova',
      'Crescente',
      'Lua Cheia',
      'Minguante',
    ]);
  });

  it('a player defining a cycle is refused with FORBIDDEN and nobody hears of it', async () => {
    const bia = await live.atTable(live.bia, live.vharn);
    const anaEvents = recordEventsOf(await live.atTable(live.ana, live.vharn));

    const ack = await send(bia, 'cycle:define', moonCommand(live.vharn));

    expect(ack).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    await silence();
    expect(anaEvents.events.filter(({ name }) => name === 'cycle:listChanged')).toEqual([]);
  });

  it('a seer who is not a player of the table is refused with ROUND_CYCLE_MEMBER_NOT_PLAYER', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const outsider = await live.signUp('Duda');

    const ack = await send(
      ana,
      'cycle:define',
      moonCommand(live.vharn, { seerIds: [outsider.id] }),
    );

    expect(ack).toMatchObject({ ok: false, error: { code: 'ROUND_CYCLE_MEMBER_NOT_PLAYER' } });
  });
});

describe('isolation between tables', () => {
  it('Quelm hears nothing of a Vharn cycle and cannot edit nor delete it by its id', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const caioAtQuelm = await live.atTable(live.caio, live.quelm);
    const quelmEvents = recordEventsOf(caioAtQuelm);
    await send(ana, 'cycle:define', moonCommand(live.vharn));
    const [cycle] = (await charactersSynced(ana, live.vharn)).roundCycles;
    const cycleId = cycle?.id ?? '';

    const edit = moonCommand(live.quelm, {
      cycleId,
      seerIds: [],
      chooserIds: [],
      visibility: 'everyone',
    });
    const updated = await send(caioAtQuelm, 'cycle:update', edit);
    const deleted = await send(caioAtQuelm, 'cycle:delete', {
      ...envelope(live.quelm.id),
      cycleId,
    });

    expect(updated).toMatchObject({ ok: false, error: { code: 'ROUND_CYCLE_NOT_FOUND' } });
    expect(deleted).toMatchObject({ ok: false, error: { code: 'ROUND_CYCLE_NOT_FOUND' } });
    expect(quelmEvents.events.filter(({ name }) => name === 'cycle:listChanged')).toEqual([]);
    expect((await charactersSynced(caioAtQuelm, live.quelm)).roundCycles).toEqual([]);
  });
});

describe('cycle:update and cycle:delete', () => {
  it('narrowing a cycle to the masters takes it out of Bia’s list in the next version', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const bia = await live.atTable(live.bia, live.vharn);
    await send(ana, 'cycle:define', moonCommand(live.vharn));
    const cycleId = (await charactersSynced(ana, live.vharn)).roundCycles[0]?.id ?? '';
    const biaEvents = recordEventsOf(bia);

    const masters = { cycleId, visibility: 'masters', seerIds: [], chooserIds: [] };
    const ack = await send(ana, 'cycle:update', moonCommand(live.vharn, masters));

    const event = await listChanged(biaEvents);
    expect(event.version).toBe(ack.ok ? ack.version : -1);
    expect(event.cycles).toEqual([]);
  });

  it('deleting a cycle publishes the list without it', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    await send(ana, 'cycle:define', moonCommand(live.vharn));
    const cycleId = (await charactersSynced(ana, live.vharn)).roundCycles[0]?.id ?? '';
    const anaEvents = recordEventsOf(ana);

    await send(ana, 'cycle:delete', { ...envelope(live.vharn.id), cycleId });

    expect((await listChanged(anaEvents)).cycles).toEqual([]);
  });
});
