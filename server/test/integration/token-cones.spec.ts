import { tokensCreatedDto, tokenUpdatedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const LANTERN = { bright: 6, dim: 0, color: null, angle: 60 };

function without(command: object, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(command).filter(([key]) => !keys.includes(key)));
}

describe('token field of view and lantern over Socket.IO', () => {
  const live = useTokenTable();

  async function lyraOfBia(
    master: RealtimeClient,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const events = recordEventsOf(master);
    await send(master, 'token:create', tokenCommandFor(live.vharn, live.bia.id, overrides));
    return (await createdTokenOf(events)).id;
  }

  function updateOf(tokenId: string, fields: object): object {
    const base = without(tokenCommandFor(live.vharn, live.bia.id), ['col', 'row']);
    return { ...base, ...envelope(live.vharn.id), tokenId, ...fields };
  }

  it('Ana narrowing Lyra to 90° and giving her a 60° lantern reaches Bia and Caio', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(ana);
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));

    await send(ana, 'token:update', updateOf(lyraId, { sightAngle: 90, light: LANTERN }));

    for (const recorder of [bia, caio]) {
      const { token } = tokenUpdatedDto.parse(await eventPayload(recorder, 'token:updated'));
      expect(token).toMatchObject({ sightAngle: 90, light: LANTERN });
    }
  });

  it('Bia sending token:update with a sightAngle is FORBIDDEN and nobody hears of it', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const lyraId = await lyraOfBia(ana.client);
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'token:update', updateOf(lyraId, { sightAngle: 90 }));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    await silence();
    expect(ana.events.map(({ name }) => name)).not.toContain('token:updated');
  });

  it('a pasted Lyra carries her field of view and her lantern', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const copied = without(
      tokenCommandFor(live.vharn, live.bia.id, { sightAngle: 90, light: LANTERN }),
      ['actionId', 'campaignId'],
    );

    await send(ana.client, 'token:createMany', { ...envelope(live.vharn.id), tokens: [copied] });

    const pasted = tokensCreatedDto.parse(await eventPayload(ana, 'token:createdMany')).tokens;
    expect(pasted.map(({ sightAngle, light }) => [sightAngle, light?.angle])).toEqual([[90, 60]]);
  });

  it('the field of view and the lantern survive a restart of the server', async () => {
    await lyraOfBia(await live.atTable(live.ana, live.vharn), { sightAngle: 90, light: LANTERN });

    await live.restart();

    const state = await synced(await live.atTable(live.bia, live.vharn), live.vharn);
    expect(state.tokens[0]).toMatchObject({ sightAngle: 90, light: LANTERN });
  });

  it('the board:sync of Quelm does not bring the Lyra of Vharn', async () => {
    await lyraOfBia(await live.atTable(live.ana, live.vharn), { sightAngle: 90 });

    const state = await synced(await live.atTable(live.caio, live.quelm), live.quelm);

    expect(state.tokens).toEqual([]);
  });

  it('an update carrying a forged userId gets INVALID_BODY', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const lyraId = await lyraOfBia(ana);

    const ack = await send(ana, 'token:update', {
      ...updateOf(lyraId, { sightAngle: 90 }),
      userId: live.bia.id,
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
  });
});
