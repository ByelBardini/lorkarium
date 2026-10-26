import {
  diceRollAckDto,
  diceRolledDto,
  diceRolledSecretlyDto,
  type DiceRollAckDto,
  type DiceRolledDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import {
  recordEventsOf,
  type EventRecorder,
  type RealtimeClient,
} from '../support/realtime-client';
import type { Table } from '../support/tables';
import { tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

type Emit = (event: string, payload: object) => Promise<unknown>;

async function roll(client: RealtimeClient, payload: object): Promise<DiceRollAckDto> {
  const timed = client.timeout(4000);
  const emit = timed.emitWithAck as Emit;
  return diceRollAckDto.parse(await emit.call(timed, 'dice:roll', payload));
}

function rollOf(table: Pick<Table, 'id'>, expression = '1d20+5', visibility = 'public'): object {
  const parts = [{ label: null, expression }];
  return { ...envelope(table.id), label: 'Acerto', parts, visibility, aspect: 16 / 9 };
}

function heard(recorder: EventRecorder, name: string): unknown[] {
  return recorder.events.filter((event) => event.name === name).map((event) => event.payload);
}

async function fullRollOf(recorder: EventRecorder): Promise<DiceRolledDto> {
  return diceRolledDto.parse(await eventPayload(recorder, 'dice:rolled'));
}

// Ana masters Vharn with Bia and Caio; Duda watches it as a spectator.
async function vharnTable(): Promise<RealtimeClient[]> {
  const duda = await live.signUp('Duda');
  await live.joinAsSpectator(duda, live.vharn);
  return [
    await live.atTable(live.ana, live.vharn),
    await live.atTable(live.bia, live.vharn),
    await live.atTable(live.caio, live.vharn),
    await live.atTable(duda, live.vharn),
  ];
}

describe('dice:roll', () => {
  it('Bia rolls 1d20+5 in public: Ana, Bia, Caio and Duda hear the same roll', async () => {
    const clients = await vharnTable();
    const recorders = clients.map(recordEventsOf);

    const ack = await roll(clients[1]!, rollOf(live.vharn));

    expect(ack).toEqual({ ok: true, rollId: expect.any(String) });
    const events = await Promise.all(recorders.map(fullRollOf));
    const sameRoll = events.map(({ rollId, total, throw: thrown }) => ({
      rollId,
      total,
      frames: thrown?.models[0]?.frames,
    }));
    expect(new Set(sameRoll.map((roll) => JSON.stringify(roll))).size).toBe(1);
    expect(events[0]).toMatchObject({ rollId: ack.ok ? ack.rollId : '', rollerId: live.bia.id });
    expect(events[0]!.total).toBe((events[0]!.parts[0]!.dice[0]?.value ?? 0) + 5);
  });

  it('Bia rolls for the masters: Ana and Bia hear it whole, Caio and Duda only a notice', async () => {
    const clients = await vharnTable();
    const [ana, bia, caio, duda] = clients.map(recordEventsOf);

    await roll(clients[1]!, rollOf(live.vharn, '1d20', 'masters'));

    await fullRollOf(ana!);
    await fullRollOf(bia!);
    const notices = await Promise.all(
      [caio!, duda!].map((r) => eventPayload(r, 'dice:rolledSecretly')),
    );
    notices.forEach((notice) =>
      expect(diceRolledSecretlyDto.parse(notice)).not.toHaveProperty('total'),
    );
    await silence();
    expect([caio!, duda!].map((r) => heard(r, 'dice:rolled'))).toEqual([[], []]);
    expect([ana!, bia!].map((r) => heard(r, 'dice:rolledSecretly'))).toEqual([[], []]);
  });

  it('Ana rolls for the masters: only Ana hears it whole', async () => {
    const clients = await vharnTable();
    const [ana, bia, caio, duda] = clients.map(recordEventsOf);

    await roll(clients[0]!, rollOf(live.vharn, '1d20', 'masters'));

    await fullRollOf(ana!);
    await Promise.all([bia!, caio!, duda!].map((r) => eventPayload(r, 'dice:rolledSecretly')));
    await silence();
    expect([bia!, caio!, duda!].map((r) => heard(r, 'dice:rolled'))).toEqual([[], [], []]);
  });

  it('Duda (spectator) rolling is FORBIDDEN and nobody hears anything', async () => {
    const clients = await vharnTable();
    const recorders = clients.map(recordEventsOf);

    const ack = await roll(clients[3]!, rollOf(live.vharn));

    expect(ack).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    await silence();
    expect(
      recorders.flatMap((r) => [...heard(r, 'dice:rolled'), ...heard(r, 'dice:rolledSecretly')]),
    ).toEqual([]);
  });

  it('a roll at Quelm from a Vharn connection is CAMPAIGN_NOT_FOUND', async () => {
    const bia = await live.atTable(live.bia, live.vharn);

    expect(await roll(bia, rollOf(live.quelm))).toMatchObject({
      ok: false,
      error: { code: 'CAMPAIGN_NOT_FOUND' },
    });
  });

  it('who is at Quelm hears nothing of a roll at Vharn (critério 14)', async () => {
    const bia = await live.atTable(live.bia, live.vharn);
    const quelm = recordEventsOf(await live.atTable(live.caio, live.quelm));

    expect(await roll(bia, rollOf(live.vharn))).toMatchObject({ ok: true });

    await silence();
    expect([...heard(quelm, 'dice:rolled'), ...heard(quelm, 'dice:rolledSecretly')]).toEqual([]);
  });

  it.each([
    ['a forged userId', { userId: '7d0f8c39-2b8e-4f4e-9d1a-5c6b7a8e9f01' }, 'INVALID_BODY'],
    ['1001d6', { parts: [{ label: null, expression: '1001d6' }] }, 'INVALID_DICE_EXPRESSION'],
  ])('a roll with %s is %s', async (_case, extra, code) => {
    const bia = await live.atTable(live.bia, live.vharn);

    expect(await roll(bia, { ...rollOf(live.vharn), ...extra })).toMatchObject({
      ok: false,
      error: { code },
    });
  });

  it('an unreadable piece answers which piece and why, as the saved rolls do', async () => {
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await roll(bia, rollOf(live.vharn, '2d'));

    expect(ack).toEqual({
      ok: false,
      error: {
        code: 'INVALID_DICE_EXPRESSION',
        message:
          'part 1 ("2d") cannot be read: Expected the number of sides at position 2; got the end of the expression.',
      },
    });
  });

  it('the 7th roll of a burst is RATE_LIMITED; the board bucket is apart and nothing is written', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    await send(ana, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
    const tokenId = (await synced(ana, live.vharn)).tokens[0]?.id;
    const before = await synced(ana, live.vharn);

    const acks = await Promise.all(
      Array.from({ length: 7 }, () => roll(ana, rollOf(live.vharn, '1d6'))),
    );

    expect(acks.slice(0, 6).every((ack) => ack.ok)).toBe(true);
    expect(acks[6]).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED', retryAfterSeconds: expect.any(Number) },
    });
    expect((await synced(ana, live.vharn)).version).toBe(before.version);
    const move = { ...envelope(live.vharn.id), tokenId, col: 5, row: 5 };
    expect(await send(ana, 'token:move', move)).toMatchObject({ ok: true });
  });
});
