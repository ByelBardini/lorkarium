import {
  conditionDefaultsRestoredDto,
  conditionDefinitionDeletedDto,
  conditionDefinitionUpdatedDto,
  conditionUsageAckDto,
  type BoardStateDto,
  type ConditionUsageAckDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { gridAck, newGrid } from '../support/grids';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import type { Table } from '../support/tables';
import { tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

type Emit = (event: string, payload: object) => Promise<unknown>;

const DESCRIPTION = 'Desvantagem em ataques.';

function definitionId(state: BoardStateDto, name: string): string {
  const found = state.conditionDefinitions.find((definition) => definition.name === name);
  if (!found) throw new Error(`no condition named ${name} in the snapshot`);
  return found.id;
}

function stateOf(ack: Awaited<ReturnType<typeof gridAck>>): BoardStateDto {
  if (!ack.ok) throw new Error(`sync refused with ${ack.error.code}`);
  return ack.state;
}

async function usageAck(
  client: RealtimeClient,
  table: Table,
  conditionId: string,
): Promise<ConditionUsageAckDto> {
  const timed = client.timeout(2000);
  const emit = timed.emitWithAck as Emit;
  const payload = { ...envelope(table.id), conditionId };
  return conditionUsageAckDto.parse(await emit.call(timed, 'condition:usage', payload));
}

function envenenadoEdit(table: Table, conditionId: string): Record<string, unknown> {
  return {
    ...envelope(table.id),
    conditionId,
    name: 'Envenenado',
    tone: 'harm',
    icon: 'flask-conical',
    look: null,
    color: null,
    description: DESCRIPTION,
    maxStacks: null,
    imageAssetId: null,
  };
}

// The master's Kael in the group grid, with Envenenado and Cego on it.
async function kaelHeldByEnvenenadoAndCego(ana: RealtimeClient): Promise<string> {
  const kael = { name: 'Kael', initials: 'KA', col: 2, row: 2 };
  await send(ana, 'token:create', tokenCommandFor(live.vharn, live.caio.id, kael));
  const state = await synced(ana, live.vharn);
  const kaelId = state.tokens[0]?.id ?? '';
  for (const name of ['Envenenado', 'Cego']) {
    const conditionId = definitionId(state, name);
    const apply = { ...envelope(live.vharn.id), tokenId: kaelId, conditionId, rounds: 0 };
    await send(ana, 'condition:apply', apply);
  }
  return kaelId;
}

// Cego on the Kael of the group grid and on a Goblin of the private Torre.
async function cegoOnTwoGrids(ana: RealtimeClient): Promise<Readonly<{ torre: string }>> {
  await kaelHeldByEnvenenadoAndCego(ana);
  const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
  const goblin = { sceneId: torre, name: 'Goblin', initials: 'GO', controllerIds: [] };
  await send(ana, 'token:create', tokenCommandFor(live.vharn, live.ana.id, goblin));
  const inTorre = stateOf(await gridAck(ana, 'board:sync', live.vharn, torre));
  const cego = definitionId(inTorre, 'Cego');
  await send(ana, 'condition:apply', {
    ...envelope(live.vharn.id),
    sceneId: torre,
    tokenId: inTorre.tokens[0]?.id ?? '',
    conditionId: cego,
    rounds: 0,
  });
  return { torre };
}

async function dudaAtVharn(): Promise<RealtimeClient> {
  const duda = await live.signUp('Duda');
  await live.joinAsSpectator(duda, live.vharn);
  return live.atTable(duda, live.vharn);
}

describe('condition:updateDefinition', () => {
  it('Ana describing Envenenado reaches Bia and Caio as condition:definitionUpdated', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caioEvents = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const envenenado = definitionId(await synced(ana, live.vharn), 'Envenenado');

    const ack = await send(
      ana,
      'condition:updateDefinition',
      envenenadoEdit(live.vharn, envenenado),
    );

    expect(ack).toMatchObject({ ok: true });
    for (const events of [biaEvents, caioEvents]) {
      const updated = conditionDefinitionUpdatedDto.parse(
        await eventPayload(events, 'condition:definitionUpdated'),
      );
      expect(updated.definition).toEqual({
        id: envenenado,
        name: 'Envenenado',
        tone: 'harm',
        icon: 'flask-conical',
        look: null,
        color: null,
        description: DESCRIPTION,
        maxStacks: null,
        imageAssetId: null,
      });
    }
  });

  it('the next board:sync of Bia has the description on the definition and on the Kael', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    await kaelHeldByEnvenenadoAndCego(ana);
    const envenenado = definitionId(await synced(ana, live.vharn), 'Envenenado');
    await send(ana, 'condition:updateDefinition', envenenadoEdit(live.vharn, envenenado));

    const state = await synced(await live.atTable(live.bia, live.vharn), live.vharn);

    const definition = state.conditionDefinitions.find(({ id }) => id === envenenado);
    expect(definition?.description).toBe(DESCRIPTION);
    const onKael = state.tokens[0]?.conditions.find(
      ({ conditionId }) => conditionId === envenenado,
    );
    expect(onKael?.description).toBe(DESCRIPTION);
  });

  it('renaming Envenenado into "cego" is CONDITION_NAME_TAKEN and the list keeps both', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const envenenado = definitionId(await synced(ana, live.vharn), 'Envenenado');

    const ack = await send(ana, 'condition:updateDefinition', {
      ...envenenadoEdit(live.vharn, envenenado),
      name: 'cego',
    });

    expect(ack).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CONDITION_NAME_TAKEN' }),
    });
    const names = (await synced(ana, live.vharn)).conditionDefinitions.map(({ name }) => name);
    expect(names).toEqual(expect.arrayContaining(['Envenenado', 'Cego']));
  });

  it('a description of 501 characters is INVALID_BODY and nothing changes', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const before = await synced(ana, live.vharn);
    const envenenado = definitionId(before, 'Envenenado');

    const ack = await send(ana, 'condition:updateDefinition', {
      ...envenenadoEdit(live.vharn, envenenado),
      description: 'x'.repeat(501),
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
    const after = await synced(ana, live.vharn);
    expect(after.conditionDefinitions.find(({ id }) => id === envenenado)?.description).toBe('');
  });

  it('a forged userId is INVALID_BODY and the definition keeps its description', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const envenenado = definitionId(await synced(ana, live.vharn), 'Envenenado');

    const ack = await send(ana, 'condition:updateDefinition', {
      ...envenenadoEdit(live.vharn, envenenado),
      userId: live.bia.id,
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
    const after = await synced(ana, live.vharn);
    expect(after.conditionDefinitions.find(({ id }) => id === envenenado)?.description).toBe('');
  });
});

describe('condition:usage and condition:deleteDefinition', () => {
  it('Cego on the group grid and on the Torre counts 2 tokens', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    await cegoOnTwoGrids(ana);
    const cego = definitionId(await synced(ana, live.vharn), 'Cego');

    expect(await usageAck(ana, live.vharn, cego)).toEqual({ ok: true, tokens: 2 });
  });

  it('deleting Cego reaches Bia and leaves no Cego on the group grid nor on the Torre', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const { torre } = await cegoOnTwoGrids(ana);
    const cego = definitionId(await synced(ana, live.vharn), 'Cego');
    const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));

    const ack = await send(ana, 'condition:deleteDefinition', {
      ...envelope(live.vharn.id),
      conditionId: cego,
    });

    expect(ack).toMatchObject({ ok: true });
    const deleted = conditionDefinitionDeletedDto.parse(
      await eventPayload(biaEvents, 'condition:definitionDeleted'),
    );
    expect(deleted.conditionId).toBe(cego);
    const group = await synced(ana, live.vharn);
    const inTorre = stateOf(await gridAck(ana, 'board:sync', live.vharn, torre));
    for (const state of [group, inTorre]) {
      const held = state.tokens.flatMap(({ conditions }) => conditions.map(({ name }) => name));
      expect(held).not.toContain('Cego');
      expect(state.conditionDefinitions.map(({ name }) => name)).not.toContain('Cego');
    }
    expect(group.tokens[0]?.conditions.map(({ name }) => name)).toEqual(['Envenenado']);
    expect(await usageAck(ana, live.vharn, cego)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CONDITION_NOT_FOUND' }),
    });
  });
});

describe('condition:restoreDefaults', () => {
  it('after deleting Cego brings it back to Bia as condition:defaultsRestored', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const cego = definitionId(await synced(ana, live.vharn), 'Cego');
    await send(ana, 'condition:deleteDefinition', {
      ...envelope(live.vharn.id),
      conditionId: cego,
    });
    const biaClient = await live.atTable(live.bia, live.vharn);
    const biaEvents = recordEventsOf(biaClient);

    const ack = await send(ana, 'condition:restoreDefaults', envelope(live.vharn.id));

    expect(ack).toMatchObject({ ok: true });
    const restored = conditionDefaultsRestoredDto.parse(
      await eventPayload(biaEvents, 'condition:defaultsRestored'),
    );
    expect(restored.definitions.map(({ name }) => name)).toEqual(['Cego']);
    const state = await synced(biaClient, live.vharn);
    expect(state.conditionDefinitions).toHaveLength(11);
  });

  it('with nothing missing answers ok and nobody gets an event', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));

    const ack = await send(ana, 'condition:restoreDefaults', envelope(live.vharn.id));

    expect(ack).toMatchObject({ ok: true });
    await silence();
    expect(biaEvents.events.map(({ name }) => name)).not.toContain('condition:defaultsRestored');
  });
});

describe('who may change the list', () => {
  const PLAYER_COMMANDS: Array<[string, (table: Table, conditionId: string) => object]> = [
    ['condition:updateDefinition', (table, id) => envenenadoEdit(table, id)],
    ['condition:deleteDefinition', (table, id) => ({ ...envelope(table.id), conditionId: id })],
    ['condition:restoreDefaults', (table) => envelope(table.id)],
  ];

  it.each(PLAYER_COMMANDS)(
    '%s of Bia is FORBIDDEN and the list stays',
    async (event, payloadOf) => {
      const ana = await live.atTable(live.ana, live.vharn);
      const before = await synced(ana, live.vharn);
      const envenenado = definitionId(before, 'Envenenado');
      const bia = await live.atTable(live.bia, live.vharn);

      const ack = await send(bia, event, payloadOf(live.vharn, envenenado));

      expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
      const after = await synced(ana, live.vharn);
      expect(after.conditionDefinitions).toEqual(before.conditionDefinitions);
    },
  );

  it('condition:usage of Bia is FORBIDDEN', async () => {
    const bia = await live.atTable(live.bia, live.vharn);
    const envenenado = definitionId(await synced(bia, live.vharn), 'Envenenado');

    expect(await usageAck(bia, live.vharn, envenenado)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'FORBIDDEN' }),
    });
  });

  it('condition:updateDefinition of the spectator is FORBIDDEN', async () => {
    const duda = await dudaAtVharn();
    const envenenado = definitionId(await synced(duda, live.vharn), 'Envenenado');

    const ack = await send(
      duda,
      'condition:updateDefinition',
      envenenadoEdit(live.vharn, envenenado),
    );

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
  });

  it('the spectator applying Cego to the Kael is FORBIDDEN and the Kael keeps its conditions', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const kaelId = await kaelHeldByEnvenenadoAndCego(ana);
    const before = await synced(ana, live.vharn);
    const caido = definitionId(before, 'Caído');
    const duda = await dudaAtVharn();

    const ack = await send(duda, 'condition:apply', {
      ...envelope(live.vharn.id),
      tokenId: kaelId,
      conditionId: caido,
      rounds: 1,
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    const after = await synced(ana, live.vharn);
    expect([after.version, after.tokens[0]?.conditions]).toEqual([
      before.version,
      before.tokens[0]?.conditions,
    ]);
  });
});

describe('isolation by campaign', () => {
  const ISOLATED_COMMANDS: Array<[string, (table: Table, conditionId: string) => object]> = [
    ['condition:updateDefinition', (table, id) => envenenadoEdit(table, id)],
    ['condition:deleteDefinition', (table, id) => ({ ...envelope(table.id), conditionId: id })],
  ];

  it.each(ISOLATED_COMMANDS)(
    '%s of Ana with a condition of Quelm is CONDITION_NOT_FOUND and Quelm hears nothing',
    async (event, payloadOf) => {
      const quelmMaster = await live.atTable(live.caio, live.quelm);
      const quelmBefore = await synced(quelmMaster, live.quelm);
      const quelmEnvenenado = definitionId(quelmBefore, 'Envenenado');
      const quelmEvents = recordEventsOf(quelmMaster);
      const ana = await live.atTable(live.ana, live.vharn);

      const ack = await send(ana, event, payloadOf(live.vharn, quelmEnvenenado));

      expect(ack).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'CONDITION_NOT_FOUND' }),
      });
      await silence();
      expect(quelmEvents.events.map(({ name }) => name)).toEqual([]);
      const quelmAfter = await synced(quelmMaster, live.quelm);
      expect(quelmAfter.conditionDefinitions).toEqual(quelmBefore.conditionDefinitions);
    },
  );

  it('condition:usage of Ana with a condition of Quelm is CONDITION_NOT_FOUND', async () => {
    const quelmMaster = await live.atTable(live.caio, live.quelm);
    const quelmCego = definitionId(await synced(quelmMaster, live.quelm), 'Cego');
    const ana = await live.atTable(live.ana, live.vharn);

    expect(await usageAck(ana, live.vharn, quelmCego)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CONDITION_NOT_FOUND' }),
    });
  });
});
