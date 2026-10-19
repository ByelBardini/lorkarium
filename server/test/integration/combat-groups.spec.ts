import {
  combatStartedDto,
  combatTurnChangedDto,
  combatUpdatedDto,
  type CombatDto,
  type CombatEntryInput,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import {
  recordEventsOf,
  type EventRecorder,
  type RealtimeClient,
} from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

type Vharn = Readonly<{
  ana: RealtimeClient;
  bia: EventRecorder;
  caio: EventRecorder;
  goblin: string;
  lobo: string;
  kael: string;
}>;

describe('combat with grouped entries over Socket.IO', () => {
  const live = useTokenTable();

  async function tokenOn(
    master: RealtimeClient,
    table: Table,
    name: string,
    controller: SignedInUser,
  ): Promise<string> {
    const recorder = recordEventsOf(master);
    await send(master, 'token:create', tokenCommandFor(table, controller.id, { name, bars: [] }));
    return (await createdTokenOf(recorder)).id;
  }

  // Ana masters; Caio controls the Goblin and the Lobo, Bia the Kael.
  async function vharnTable(): Promise<Vharn> {
    const ana = await live.atTable(live.ana, live.vharn);
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const goblin = await tokenOn(ana, live.vharn, 'Goblin', live.caio);
    const lobo = await tokenOn(ana, live.vharn, 'Lobo', live.caio);
    const kael = await tokenOn(ana, live.vharn, 'Kael', live.bia);
    return { ana, bia, caio, goblin, lobo, kael };
  }

  async function started(table: Vharn): Promise<CombatDto> {
    const entries: CombatEntryInput[] = [
      { name: 'Inimigos', tokenIds: [table.goblin, table.lobo] },
      { name: null, tokenIds: [table.kael] },
    ];
    await send(table.ana, 'combat:start', { ...envelope(live.vharn.id), entries });
    return combatStartedDto.parse(await eventPayload(table.bia, 'combat:started')).combat;
  }

  function entryHolding(combat: CombatDto, tokenId: string) {
    const found = combat.combatants.find(({ tokenIds }) => tokenIds.includes(tokenId));
    if (!found) throw new Error(`no entry holds ${tokenId} in ${JSON.stringify(combat)}`);
    return found;
  }

  async function updatedAfter(recorder: EventRecorder, act: () => Promise<unknown>) {
    const before = recorder.events.length;
    await act();
    // The broadcast can land after the ack: wait for it before cutting the list.
    await recorder.until(before + 1);
    const since = { ...recorder, events: recorder.events.slice(before) };
    return combatUpdatedDto.parse(await eventPayload(since, 'combat:updated')).combat;
  }

  it('the master starts with Inimigos holding two tokens, and Bia and Caio receive it', async () => {
    const table = await vharnTable();

    const combat = await started(table);

    expect(entryHolding(combat, table.goblin)).toMatchObject({ name: 'Inimigos' });
    expect([...entryHolding(combat, table.goblin).tokenIds].sort()).toEqual(
      [table.goblin, table.lobo].sort(),
    );
    const caioSaw = combatStartedDto.parse(await eventPayload(table.caio, 'combat:started'));
    expect(caioSaw.combat).toEqual(combat);
  });

  it('Caio, who controls both enemies, passes the turn of Inimigos; Bia on the same turn is FORBIDDEN', async () => {
    const table = await vharnTable();
    const combat = await started(table);
    const enemies = entryHolding(combat, table.goblin).id;
    const biaClient = table.bia.client;

    const biaAck = await send(biaClient, 'combat:nextTurn', {
      ...envelope(live.vharn.id),
      fromCombatantId: enemies,
    });
    const caioAck = await send(table.caio.client, 'combat:nextTurn', {
      ...envelope(live.vharn.id),
      fromCombatantId: enemies,
    });

    expect(biaAck).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    expect(caioAck).toMatchObject({ ok: true });
    const turn = combatTurnChangedDto.parse(await eventPayload(table.bia, 'combat:turnChanged'));
    expect(turn.combat.currentCombatantId).toBe(entryHolding(combat, table.kael).id);
    expect(table.bia.events.filter(({ name }) => name === 'combat:turnChanged')).toHaveLength(1);
  });

  it('splitting the Lobo off puts it in a new unnamed entry at the end, for everyone', async () => {
    const table = await vharnTable();
    await started(table);

    const combat = await updatedAfter(table.caio, () =>
      send(table.ana, 'combat:regroupTokens', {
        ...envelope(live.vharn.id),
        tokenIds: [table.lobo],
        target: { kind: 'own' },
      }),
    );

    expect(combat.combatants.at(-1)).toMatchObject({
      name: null,
      tokenIds: [table.lobo],
      initiative: null,
    });
    expect(entryHolding(combat, table.goblin).tokenIds).toEqual([table.goblin]);
  });

  it('taking out the last token of the entry on turn takes the entry out and passes the turn in one combat:updated', async () => {
    const table = await vharnTable();
    const started_ = await started(table);
    const kaelEntry = entryHolding(started_, table.kael).id;

    const combat = await updatedAfter(table.bia, () =>
      send(table.ana, 'combat:regroupTokens', {
        ...envelope(live.vharn.id),
        tokenIds: [table.goblin, table.lobo],
        target: { kind: 'out' },
      }),
    );

    expect(combat.combatants.map(({ id }) => id)).toEqual([kaelEntry]);
    expect(combat.currentCombatantId).toBe(kaelEntry);
    await silence();
    expect(table.bia.events.filter(({ name }) => name === 'combat:updated')).toHaveLength(1);
  });

  it('renaming Inimigos to Goblins reaches everyone', async () => {
    const table = await vharnTable();
    const combat = await started(table);

    const renamed = await updatedAfter(table.caio, () =>
      send(table.ana, 'combat:renameCombatant', {
        ...envelope(live.vharn.id),
        combatantId: entryHolding(combat, table.goblin).id,
        name: 'Goblins',
      }),
    );

    expect(entryHolding(renamed, table.goblin).name).toBe('Goblins');
  });

  it('an entry or a token of Quelm is refused at Vharn, and neither table gets an event', async () => {
    const table = await vharnTable();
    await started(table);
    const quelmMaster = await live.atTable(live.caio, live.quelm);
    const quelmEvents = recordEventsOf(quelmMaster);
    const ogro = await tokenOn(quelmMaster, live.quelm, 'Ogro', live.caio);
    await send(quelmMaster, 'combat:start', {
      ...envelope(live.quelm.id),
      entries: [{ name: null, tokenIds: [ogro] }],
    });
    const quelmCombat = combatStartedDto.parse(await eventPayload(quelmEvents, 'combat:started'));
    const vharnBefore = table.bia.events.length;
    const quelmBefore = quelmEvents.events.length;

    const entryAck = await send(table.ana, 'combat:regroupTokens', {
      ...envelope(live.vharn.id),
      tokenIds: [table.goblin],
      target: { kind: 'entry', combatantId: quelmCombat.combat.combatants[0]?.id },
    });
    const tokenAck = await send(table.ana, 'combat:regroupTokens', {
      ...envelope(live.vharn.id),
      tokenIds: [ogro],
      target: { kind: 'own' },
    });

    expect(entryAck).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'COMBATANT_NOT_FOUND' }),
    });
    expect(tokenAck).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'TOKEN_NOT_FOUND' }),
    });
    await silence();
    expect(table.bia.events.slice(vharnBefore)).toEqual([]);
    expect(quelmEvents.events.slice(quelmBefore)).toEqual([]);
  });

  it('a userId forged into the regroup is INVALID_BODY', async () => {
    const table = await vharnTable();
    await started(table);

    const ack = await send(table.ana, 'combat:regroupTokens', {
      ...envelope(live.vharn.id),
      tokenIds: [table.lobo],
      target: { kind: 'own' },
      userId: live.caio.id,
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
  });

  it('after a restart the groups, the names and the turn are kept', async () => {
    const table = await vharnTable();
    const combat = await started(table);
    await send(table.ana, 'combat:renameCombatant', {
      ...envelope(live.vharn.id),
      combatantId: entryHolding(combat, table.goblin).id,
      name: 'Goblins',
    });

    await live.restart();

    const after = await synced(await live.atTable(live.bia, live.vharn), live.vharn);
    expect(after.combat?.currentCombatantId).toBe(combat.currentCombatantId);
    expect(entryHolding(after.combat as CombatDto, table.lobo)).toMatchObject({
      name: 'Goblins',
      id: entryHolding(combat, table.goblin).id,
    });
  });
});
