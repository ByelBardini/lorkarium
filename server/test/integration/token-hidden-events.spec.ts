import { tokenUpdatedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { expectNoTrace, hiddenTable, namesOf, type HiddenTable } from '../support/hidden-tokens';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import type { EventRecorder } from '../support/realtime-client';
import { tokenCommandFor, useTokenTable } from '../support/token-table';

describe('token commands that touch a hidden token', () => {
  const live = useTokenTable();
  const on = (fields: object): object => ({ ...envelope(live.vharn.id), ...fields });

  // Every case: Caio, who does not control the Lobo, never gets its id.
  async function caioAfter(table: HiddenTable): Promise<EventRecorder> {
    await silence();
    expectNoTrace(table.caio, table.loboId);
    return table.caio;
  }

  function loboUpdate(table: HiddenTable, controllerIds: string[]): object {
    const fields = { name: 'Lobo', initials: 'LO', side: 'ally', width: 2, height: 2 };
    return on({ tokenId: table.loboId, ...fields, controllerIds, bars: [] });
  }

  it('token:dragMany of the Lobo by Bia: Caio gets nothing (a drag has no version)', async () => {
    const table = await hiddenTable(live);
    const drags = [{ tokenId: table.loboId, cell: { col: 9, row: 2 } }];

    expect(await send(table.bia.client, 'token:dragMany', on({ drags }))).toMatchObject({
      ok: true,
    });

    expect(await eventPayload(table.ana, 'token:draggedMany')).toMatchObject({ drags });
    expect(namesOf(await caioAfter(table))).toEqual([]);
  });

  it('token:dragMany of the Lobo and the Kael reaches Caio with only the Kael', async () => {
    const table = await hiddenTable(live);
    const kael = { tokenId: table.kaelId, cell: { col: 7, row: 8 } };
    const drags = [{ tokenId: table.loboId, cell: { col: 9, row: 2 } }, kael];

    await send(table.ana.client, 'token:dragMany', on({ drags }));

    expect(await eventPayload(table.caio, 'token:draggedMany')).toMatchObject({ drags: [kael] });
    await caioAfter(table);
  });

  it('token:delete of the Lobo: Ana and Bia get it gone, Caio board:advanced and an empty torch list', async () => {
    const table = await hiddenTable(live);

    expect(await send(table.ana.client, 'token:delete', on({ tokenId: table.loboId }))).toEqual({
      ok: true,
      version: 3,
    });

    expect(await eventPayload(table.bia, 'token:deletedMany')).toMatchObject({
      tokenIds: [table.loboId],
    });
    expect(await eventPayload(table.caio, 'board:advanced')).toMatchObject({ version: 3 });
    expect(await eventPayload(table.caio, 'token:veiledLightsChanged')).toMatchObject({
      lights: [],
    });
    await caioAfter(table);
  });

  it.each([
    [
      'token:setLayer',
      'token:layerChanged',
      (t: HiddenTable) => ({ tokenIds: [t.loboId, t.kaelId], layer: 'objects' }),
    ],
    [
      'token:restyleMany',
      'token:restyledMany',
      (t: HiddenTable) => ({ tokenIds: [t.loboId, t.kaelId], style: { frame: 'round' } }),
    ],
  ])(
    '%s of the Lobo and the Kael reaches Caio with only the Kael',
    async (command, event, payload) => {
      const table = await hiddenTable(live);

      await send(table.ana.client, command, on(payload(table)));

      expect(await eventPayload(table.caio, event)).toMatchObject({ tokenIds: [table.kaelId] });
      expect(await eventPayload(table.bia, event)).toMatchObject({
        tokenIds: [table.loboId, table.kaelId],
      });
      await caioAfter(table);
    },
  );

  it('token:faceMany of the lit Lobo and the Kael: Caio gets the Kael and the torch looking its new way', async () => {
    const table = await hiddenTable(live);
    const faces = [
      { tokenId: table.loboId, facing: 90 },
      { tokenId: table.kaelId, facing: 180 },
    ];

    await send(table.ana.client, 'token:faceMany', on({ faces }));

    expect(await eventPayload(table.caio, 'token:facedMany')).toMatchObject({ faces: [faces[1]] });
    expect(await eventPayload(table.caio, 'token:veiledLightsChanged')).toMatchObject({
      lights: [{ x: 4, y: 5, facing: 90 }],
    });
    await caioAfter(table);
  });

  it('token:resizeMany of the Lobo and the Kael reaches Caio with only the Kael', async () => {
    const table = await hiddenTable(live);
    const resizes = [
      { tokenId: table.loboId, col: 3, row: 4, width: 1, height: 1 },
      { tokenId: table.kaelId, col: 7, row: 4, width: 2, height: 2 },
    ];

    await send(table.ana.client, 'token:resizeMany', on({ resizes }));

    expect(await eventPayload(table.caio, 'token:resizedMany')).toMatchObject({
      resizes: [resizes[1]],
    });
    expect(await eventPayload(table.caio, 'token:veiledLightsChanged')).toMatchObject({
      lights: [{ x: 3.5, y: 4.5 }],
    });
    await caioAfter(table);
  });

  it('token:setForm of the Lobo by Bia: Bia gets the form, Caio board:advanced and the torch moved', async () => {
    const table = await hiddenTable(live);
    const cub = {
      id: crypto.randomUUID(),
      name: 'Filhote',
      imageAssetId: null,
      width: 1,
      height: 1,
      frame: 'square',
    };
    await send(table.ana.client, 'token:update', {
      ...loboUpdate(table, [live.bia.id]),
      forms: [cub],
    });
    const lobo = (await synced(table.ana.client, live.vharn)).tokens.find(
      ({ id }) => id === table.loboId,
    );
    const formId = lobo?.forms[0]?.id ?? '';

    const ack = await send(
      table.bia.client,
      'token:setForm',
      on({ tokenId: table.loboId, formId }),
    );

    expect(ack).toMatchObject({ ok: true });
    expect(await eventPayload(table.bia, 'token:formChanged')).toMatchObject({
      tokenId: table.loboId,
      box: { col: 3, row: 4, width: 1, height: 1 },
    });
    const caio = await caioAfter(table);
    const advanced = caio.events.filter(({ name }) => name === 'board:advanced');
    expect(advanced.at(-1)?.payload).toMatchObject({ version: ack.ok ? ack.version : -1 });
  });

  it('token:adjustBar on the Lobo by Bia: Ana and Bia get token:updated, Caio board:advanced', async () => {
    const table = await hiddenTable(live);
    const lobo = (await synced(table.bia.client, live.vharn)).tokens.find(
      ({ id }) => id === table.loboId,
    );
    const change = { op: 'add', amount: -3 };

    await send(
      table.bia.client,
      'token:adjustBar',
      on({ tokenId: table.loboId, barId: lobo?.bars[0]?.id, change }),
    );

    expect(await eventPayload(table.ana, 'token:updated')).toMatchObject({
      token: { id: table.loboId },
    });
    expect(await eventPayload(table.caio, 'board:advanced')).toMatchObject({ version: 3 });
    expect(namesOf(await caioAfter(table))).toEqual(['board:advanced']);
  });

  it('token:update of the Lobo keeping Bia: Caio gets board:advanced and its torch again', async () => {
    const table = await hiddenTable(live);

    await send(table.ana.client, 'token:update', loboUpdate(table, [live.bia.id]));

    expect(await eventPayload(table.bia, 'token:updated')).toMatchObject({
      token: { id: table.loboId },
    });
    expect(await eventPayload(table.caio, 'board:advanced')).toMatchObject({ version: 3 });
    await caioAfter(table);
  });

  it('token:update taking Bia out of the control of the hidden Lobo: Bia gets token:deleted', async () => {
    const table = await hiddenTable(live);

    await send(table.ana.client, 'token:update', loboUpdate(table, []));

    expect(await eventPayload(table.bia, 'token:deleted')).toMatchObject({
      version: 3,
      tokenId: table.loboId,
    });
    await silence();
    expect(namesOf(table.bia)).not.toContain('token:updated');
    expect(namesOf(table.bia)).not.toContain('board:advanced');
    expect(namesOf(await caioAfter(table))).toContain('board:advanced');
  });

  it('token:update putting Caio in the control of the hidden Lobo: Caio gets it whole by token:updated', async () => {
    const table = await hiddenTable(live);

    await send(table.ana.client, 'token:update', loboUpdate(table, [live.bia.id, live.caio.id]));

    const updated = tokenUpdatedDto.parse(await eventPayload(table.caio, 'token:updated'));
    expect(updated.token).toMatchObject({ id: table.loboId, hidden: true, canControl: true });
  });

  it('token:createMany of a hidden copy: Ana and Bia get it, Caio board:advanced and the torch', async () => {
    const table = await hiddenTable(live);
    const copy = tokenCommandFor(live.vharn, live.bia.id, {
      name: 'Lobo 2',
      light: { bright: 2, dim: 2 },
      hidden: true,
    }) as Record<string, unknown>;
    const item = { ...copy };
    delete item.actionId;
    delete item.campaignId;

    await send(table.ana.client, 'token:createMany', on({ tokens: [item] }));

    const pasted = (await eventPayload(table.bia, 'token:createdMany')) as {
      tokens: { id: string; hidden: boolean }[];
    };
    expect(pasted.tokens.map(({ hidden }) => hidden)).toEqual([true]);
    expect(await eventPayload(table.caio, 'board:advanced')).toMatchObject({ version: 3 });
    expect(await eventPayload(table.caio, 'token:veiledLightsChanged')).toMatchObject({
      lights: [{ bright: 4 }, { bright: 2 }],
    });
    await silence();
    expect(JSON.stringify(table.caio.events)).not.toContain(pasted.tokens[0]?.id ?? 'none');
  });
});
