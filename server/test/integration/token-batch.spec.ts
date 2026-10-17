import { combatStartedDto, tokensCreatedDto, type TokenDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  recordEventsOf,
  type EventRecorder,
  type RealtimeClient,
} from '../support/realtime-client';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

type Item = Record<string, unknown>;

// A token:create payload without the envelope: one item of token:createMany.
function itemOf(command: object): Item {
  const item: Item = { ...command };
  delete item.actionId;
  delete item.campaignId;
  return item;
}

describe('token batches and the undo precondition over Socket.IO', () => {
  const live = useTokenTable();

  function pasteOf(items: Item[]): object {
    return { ...envelope(live.vharn.id), tokens: items };
  }

  async function createdManyOf(recorder: EventRecorder): Promise<TokenDto[]> {
    return tokensCreatedDto.parse(await eventPayload(recorder, 'token:createdMany')).tokens;
  }

  async function createdBy(master: RealtimeClient, command: object): Promise<string> {
    const events = recordEventsOf(master);
    await send(master, 'token:create', command);
    return (await createdTokenOf(events)).id;
  }

  it('the master pasting three tokens is one token:createdMany per client, redacted per viewer', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const items = [
      itemOf(tokenCommandFor(live.vharn, live.bia.id)),
      itemOf(tokenCommandFor(live.vharn, live.caio.id, { col: 5 })),
      itemOf(tokenCommandFor(live.vharn, live.caio.id, { col: 7 })),
    ];

    const ack = await send(ana.client, 'token:createMany', pasteOf(items));

    const pasted = (await createdManyOf(ana)).map(({ id }) => id);
    expect(ack).toEqual({ ok: true, version: 1, createdIds: pasted });

    const barsSeenBy = async (recorder: EventRecorder) =>
      (await createdManyOf(recorder)).map(({ bars }) => bars.length);
    expect(await barsSeenBy(ana)).toEqual([2, 2, 2]);
    expect(await barsSeenBy(bia)).toEqual([2, 1, 1]);
    expect(await barsSeenBy(caio)).toEqual([1, 2, 2]);
    await silence();
    for (const recorder of [ana, bia, caio]) {
      const heard = recorder.events.filter(({ name }) => name === 'token:createdMany');
      expect(heard).toHaveLength(1);
    }
  });

  it('the master pasting a token she also controls hears token:createdMany only once', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));

    await send(
      ana.client,
      'token:createMany',
      pasteOf([itemOf(tokenCommandFor(live.vharn, live.ana.id))]),
    );

    await silence();
    expect(ana.events.filter(({ name }) => name === 'token:createdMany')).toHaveLength(1);
  });

  it('a player pasting tokens is FORBIDDEN and nothing is created', async () => {
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(
      bia,
      'token:createMany',
      pasteOf([itemOf(tokenCommandFor(live.vharn, live.bia.id))]),
    );

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    expect((await synced(bia, live.vharn)).tokens).toEqual([]);
  });

  it('one of three past the edge is OUT_OF_SCENE and none of them is created', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const items = [
      itemOf(tokenCommandFor(live.vharn, live.bia.id)),
      itemOf(tokenCommandFor(live.vharn, live.bia.id, { col: 20 })),
      itemOf(tokenCommandFor(live.vharn, live.bia.id, { col: 5 })),
    ];

    const ack = await send(ana, 'token:createMany', pasteOf(items));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'OUT_OF_SCENE' }) });
    expect((await synced(ana, live.vharn)).tokens).toEqual([]);
  });

  it('deleting the pasted tokens where the undo expects them is one token:deletedMany to the table', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const items = [
      itemOf(tokenCommandFor(live.vharn, live.bia.id)),
      itemOf(tokenCommandFor(live.vharn, live.bia.id, { col: 5 })),
    ];
    await send(ana.client, 'token:createMany', pasteOf(items));
    const tokenIds = (await createdManyOf(ana)).map(({ id }) => id);
    const expected = tokenIds.map((tokenId, index) => ({
      tokenId,
      col: index === 0 ? 3 : 5,
      row: 4,
    }));

    const ack = await send(ana.client, 'token:deleteMany', {
      ...envelope(live.vharn.id),
      tokenIds,
      expect: expected,
    });

    expect(ack).toEqual({ ok: true, version: 2 });
    expect(await eventPayload(bia, 'token:deletedMany')).toMatchObject({ version: 2, tokenIds });
    expect((await synced(ana.client, live.vharn)).tokens).toEqual([]);
  });

  it('deleting the token on turn passes the turn, and the published combat no longer has it', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const lyra = await createdBy(ana.client, tokenCommandFor(live.vharn, live.bia.id));
    const bram = await createdBy(ana.client, tokenCommandFor(live.vharn, live.caio.id, { col: 6 }));
    await send(ana.client, 'combat:start', { ...envelope(live.vharn.id), tokenIds: [lyra, bram] });
    const started = combatStartedDto.parse(await eventPayload(ana, 'combat:started')).combat;
    const bramCombatant = started.combatants.find(({ tokenId }) => tokenId === bram)?.id;

    await send(ana.client, 'token:deleteMany', { ...envelope(live.vharn.id), tokenIds: [lyra] });

    expect(await eventPayload(ana, 'token:deletedMany')).toMatchObject({
      combat: { currentCombatantId: bramCombatant, combatants: [{ tokenId: bram }] },
    });
  });

  it('an undo of a move after Caio moved the token since is STALE_UNDO and the token stays', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const caio = await live.atTable(live.caio, live.vharn);
    const bram = await createdBy(ana, tokenCommandFor(live.vharn, live.caio.id, { col: 6 }));
    await send(caio, 'token:moveMany', {
      ...envelope(live.vharn.id),
      moves: [{ tokenId: bram, col: 9, row: 9 }],
    });

    const ack = await send(ana, 'token:moveMany', {
      ...envelope(live.vharn.id),
      moves: [{ tokenId: bram, col: 6, row: 4, expect: { col: 8, row: 4 } }],
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'STALE_UNDO' }) });
    expect((await synced(ana, live.vharn)).tokens).toEqual([
      expect.objectContaining({ id: bram, col: 9, row: 9 }),
    ]);
  });

  it('a token of Quelm in the batch is TOKEN_NOT_FOUND and nothing is deleted', async () => {
    const quelm = await live.atTable(live.caio, live.quelm);
    const quelmToken = await createdBy(quelm, tokenCommandFor(live.quelm, live.caio.id));
    const ana = await live.atTable(live.ana, live.vharn);
    const lyra = await createdBy(ana, tokenCommandFor(live.vharn, live.bia.id));

    const ack = await send(ana, 'token:deleteMany', {
      ...envelope(live.vharn.id),
      tokenIds: [lyra, quelmToken],
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'TOKEN_NOT_FOUND' }) });
    expect((await synced(ana, live.vharn)).tokens).toHaveLength(1);
  });
});
