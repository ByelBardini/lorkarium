import {
  roundCyclesAnnouncedDto,
  roundCyclesChangedDto,
  type RoundCycleDto,
  type RoundCyclesChangedDto,
} from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { setAccountPlan } from '../support/account-plans';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import {
  recordEventsOf,
  type EventRecorder,
  type RealtimeClient,
} from '../support/realtime-client';
import { charactersSynced } from '../support/table-characters';
import { tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();
beforeEach(() => setAccountPlan(live.connection.db, live.ana.id, 'amigo_do_dono'));

const MOON = ['Lua Nova', 'Crescente', 'Lua Cheia', 'Minguante'].map((name) => ({
  name,
  icon: 'game-icons:cycle',
  imageAssetId: null,
}));

type Seat = Readonly<{ ana: RealtimeClient; bia: RealtimeClient; caio: RealtimeClient }>;

async function seated(): Promise<Seat> {
  const ana = await live.atTable(live.ana, live.vharn);
  const bia = await live.atTable(live.bia, live.vharn);
  const caio = await live.atTable(live.caio, live.vharn);
  return { ana, bia, caio };
}

// Fases da Lua of the table, seen and chosen by Bia alone, announced; then two tokens in combat.
async function moonInCombat(
  ana: RealtimeClient,
  announce = true,
): Promise<Readonly<{ cycle: RoundCycleDto; combatantIds: string[] }>> {
  await send(ana, 'cycle:define', {
    ...envelope(live.vharn.id),
    name: 'Fases da Lua',
    holder: { kind: 'table' },
    visibility: 'some',
    seerIds: [live.bia.id],
    chooserIds: [live.bia.id],
    announce,
    phases: MOON,
  });
  for (const name of ['Kael', 'Ogro']) {
    const token = { name, initials: name.slice(0, 2).toUpperCase(), bars: [] };
    await send(ana, 'token:create', tokenCommandFor(live.vharn, live.bia.id, token));
  }
  const tokens = (await synced(ana, live.vharn)).tokens.map(({ id }) => id);
  const entries = tokens.map((tokenId, i) => ({
    name: null,
    tokenIds: [tokenId],
    initiative: 20 - i,
  }));
  await send(ana, 'combat:start', { ...envelope(live.vharn.id), entries });
  const state = await synced(ana, live.vharn);
  const combatantIds = (state.combat?.combatants ?? []).map(({ id }) => id);
  const cycle = (await charactersSynced(ana, live.vharn)).roundCycles[0];
  if (!cycle) throw new Error('the cycle was not defined');
  return { cycle, combatantIds };
}

async function closeRound(ana: RealtimeClient, combatantIds: readonly string[]): Promise<void> {
  for (const fromCombatantId of combatantIds) {
    await send(ana, 'combat:nextTurn', { ...envelope(live.vharn.id), fromCombatantId });
  }
}

function phaseNameOf(cycle: RoundCycleDto | undefined): string | undefined {
  const current = cycle?.combats[0]?.currentPhaseId;
  return cycle?.phases.find(({ id }) => id === current)?.name;
}

function lastList(recorder: EventRecorder): RoundCyclesChangedDto | undefined {
  const lists = recorder.events.filter(({ name }) => name === 'cycle:listChanged');
  const last = lists.at(-1);
  return last ? roundCyclesChangedDto.parse(last.payload) : undefined;
}

describe('round cycles in a combat', () => {
  it('the combat starts on Lua Nova and each closed round moves it on', async () => {
    const { ana } = await seated();
    const { combatantIds } = await moonInCombat(ana);

    expect(phaseNameOf((await charactersSynced(ana, live.vharn)).roundCycles[0])).toBe('Lua Nova');
    await closeRound(ana, combatantIds);
    expect(phaseNameOf((await charactersSynced(ana, live.vharn)).roundCycles[0])).toBe('Crescente');
  });

  it('Bia chooses Lua Nova for the next round; the round after goes on from it', async () => {
    const { ana, bia } = await seated();
    const { cycle, combatantIds } = await moonInCombat(ana);
    await closeRound(ana, combatantIds);
    const nova = cycle.phases[0]?.id ?? '';

    const ack = await send(bia, 'cycle:chooseNext', {
      ...envelope(live.vharn.id),
      cycleId: cycle.id,
      phaseId: nova,
    });
    await closeRound(ana, combatantIds);
    const afterChoice = phaseNameOf((await charactersSynced(bia, live.vharn)).roundCycles[0]);
    await closeRound(ana, combatantIds);

    expect(ack).toMatchObject({ ok: true });
    expect(afterChoice).toBe('Lua Nova');
    expect(phaseNameOf((await charactersSynced(bia, live.vharn)).roundCycles[0])).toBe('Crescente');
  });

  it('Caio, who does not choose, is refused with FORBIDDEN', async () => {
    const { ana, caio } = await seated();
    const { cycle } = await moonInCombat(ana);

    const ack = await send(caio, 'cycle:chooseNext', {
      ...envelope(live.vharn.id),
      cycleId: cycle.id,
      phaseId: null,
    });

    expect(ack).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('Caio, who does not see the cycle, gets each version without it and still the announcement', async () => {
    const { ana, caio } = await seated();
    const caioEvents = recordEventsOf(caio);
    const { combatantIds } = await moonInCombat(ana);
    const before = caioEvents.events.length;

    await closeRound(ana, combatantIds);

    const announced = roundCyclesAnnouncedDto.parse(
      await eventPayload(
        { ...caioEvents, events: caioEvents.events.slice(before) },
        'cycle:announced',
      ),
    );
    expect([announced.round, announced.announcements[0]?.phase.name]).toEqual([2, 'Crescente']);
    expect(lastList(caioEvents)?.cycles).toEqual([]);
    expect(lastList(caioEvents)?.version).toBe((await charactersSynced(caio, live.vharn)).version);
  });

  it('without announce nobody gets cycle:announced', async () => {
    const { ana, caio } = await seated();
    const caioEvents = recordEventsOf(caio);
    const { combatantIds } = await moonInCombat(ana, false);

    await closeRound(ana, combatantIds);
    await silence();

    expect(caioEvents.events.filter(({ name }) => name === 'cycle:announced')).toEqual([]);
  });

  it('the end of the combat leaves the cycle with no combat', async () => {
    const { ana } = await seated();
    await moonInCombat(ana);

    await send(ana, 'combat:end', envelope(live.vharn.id));

    expect((await charactersSynced(ana, live.vharn)).roundCycles[0]?.combats).toEqual([]);
  });

  it('Quelm hears nothing of the Vharn combat cycles', async () => {
    const { ana } = await seated();
    const quelmEvents = recordEventsOf(await live.atTable(live.caio, live.quelm));
    const { combatantIds } = await moonInCombat(ana);

    await closeRound(ana, combatantIds);
    await silence();

    const cycleEvents = quelmEvents.events.filter(({ name }) => name.startsWith('cycle:'));
    expect(
      cycleEvents.filter(
        ({ payload }) => (payload as { campaignId?: string }).campaignId === live.vharn.id,
      ),
    ).toEqual([]);
  });
});
