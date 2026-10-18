import { tokensCreatedDto, tokenUpdatedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { recordEventsOf } from '../support/realtime-client';
import { envelope, eventPayload, send, synced } from '../support/live-table';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const TORCH = { bright: 12, dim: 4 };

function without(command: object, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(command).filter(([key]) => !keys.includes(key)));
}

describe('token sight over Socket.IO', () => {
  const live = useTokenTable();

  it('Ana creating Lyra with bright 12 and dim 4 reaches Bia and Caio with the same sight', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const ana = await live.atTable(live.ana, live.vharn);

    await send(ana, 'token:create', tokenCommandFor(live.vharn, live.bia.id, { sight: TORCH }));

    expect((await createdTokenOf(bia)).sight).toEqual(TORCH);
    expect((await createdTokenOf(caio)).sight).toEqual(TORCH);
  });

  it('an update changes the sight, and an update without sight keeps it', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    await send(
      ana.client,
      'token:create',
      tokenCommandFor(live.vharn, live.bia.id, { sight: TORCH }),
    );
    const lyra = await createdTokenOf(ana);
    const fields = without(tokenCommandFor(live.vharn, live.bia.id), ['col', 'row']);

    await send(ana.client, 'token:update', {
      ...fields,
      ...envelope(live.vharn.id),
      tokenId: lyra.id,
      sight: { bright: 2, dim: 0 },
    });
    const changed = tokenUpdatedDto.parse(await eventPayload(ana, 'token:updated')).token;
    await send(ana.client, 'token:update', {
      ...fields,
      ...envelope(live.vharn.id),
      tokenId: lyra.id,
    });

    expect(changed.sight).toEqual({ bright: 2, dim: 0 });
    const [kept] = (await synced(ana.client, live.vharn)).tokens;
    expect(kept?.sight).toEqual({ bright: 2, dim: 0 });
  });

  it('a paste carries the sight of each token', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const copied = without(tokenCommandFor(live.vharn, live.bia.id, { sight: TORCH }), [
      'actionId',
      'campaignId',
    ]);

    await send(ana.client, 'token:createMany', { ...envelope(live.vharn.id), tokens: [copied] });

    const pasted = tokensCreatedDto.parse(await eventPayload(ana, 'token:createdMany')).tokens;
    expect(pasted.map(({ sight }) => sight)).toEqual([TORCH]);
  });

  it('the sight survives a restart of the server', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    await send(ana, 'token:create', tokenCommandFor(live.vharn, live.bia.id, { sight: TORCH }));

    await live.restart();

    const bia = await live.atTable(live.bia, live.vharn);
    expect((await synced(bia, live.vharn)).tokens.map(({ sight }) => sight)).toEqual([TORCH]);
  });
});
