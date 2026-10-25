import {
  assetResponseDto,
  conditionDefinedDto,
  conditionDefinitionUpdatedDto,
  type AssetDto,
  type BoardStateDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { pngOf } from '../support/images';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

// A 600×300 PNG sent as the image of a condition: the server keeps it square, 256 px.
async function conditionImageOf(user: SignedInUser, table: Table): Promise<AssetDto> {
  const response = await live.http(user, {
    method: 'POST',
    url: `/api/campaigns/${table.id}/assets?purpose=condition`,
    headers: { 'content-type': 'image/png' },
    payload: await pngOf(600, 300),
  });
  if (response.statusCode !== 201) throw new Error(`condition image answered ${response.body}`);
  return assetResponseDto.parse(response.json()).asset;
}

function cegoOf(state: BoardStateDto): BoardStateDto['conditionDefinitions'][number] {
  const found = state.conditionDefinitions.find(({ name }) => name === 'Cego');
  if (!found) throw new Error('no condition named Cego in the snapshot');
  return found;
}

function cegoEdit(conditionId: string, imageAssetId: string | null): Record<string, unknown> {
  return {
    ...envelope(live.vharn.id),
    conditionId,
    name: 'Cego',
    tone: 'harm',
    icon: 'eye-off',
    look: null,
    color: null,
    description: '',
    maxStacks: null,
    imageAssetId,
  };
}

function sangrandoDefine(imageAssetId: string): Record<string, unknown> {
  const fields = { name: 'Sangrando', tone: 'harm', icon: 'droplet', imageAssetId };
  return { ...envelope(live.vharn.id), ...fields };
}

// The master's Kael in the group grid, with Cego on it; answers Cego's id.
async function kaelBlinded(ana: RealtimeClient): Promise<string> {
  const kael = { name: 'Kael', initials: 'KA', col: 2, row: 2 };
  await send(ana, 'token:create', tokenCommandFor(live.vharn, live.caio.id, kael));
  const state = await synced(ana, live.vharn);
  const cego = cegoOf(state).id;
  const tokenId = state.tokens[0]?.id ?? '';
  await send(ana, 'condition:apply', {
    ...envelope(live.vharn.id),
    tokenId,
    conditionId: cego,
    rounds: 0,
  });
  return cego;
}

function kaelConditionImages(state: BoardStateDto): (string | null)[] {
  return (state.tokens[0]?.conditions ?? []).map(({ imageAssetId }) => imageAssetId);
}

async function dudaAtVharn(): Promise<Readonly<{ user: SignedInUser; client: RealtimeClient }>> {
  const user = await live.signUp('Duda');
  await live.joinAsSpectator(user, live.vharn);
  return { user, client: await live.atTable(user, live.vharn) };
}

describe('the image of a condition, live', () => {
  it('Ana giving Cego an image reaches Caio and the spectator, the token shows it and Duda reads it', async () => {
    const image = await conditionImageOf(live.ana, live.vharn);
    const ana = await live.atTable(live.ana, live.vharn);
    const cego = await kaelBlinded(ana);
    const caio = await live.atTable(live.caio, live.vharn);
    const caioEvents = recordEventsOf(caio);
    const duda = await dudaAtVharn();
    const dudaEvents = recordEventsOf(duda.client);

    const ack = await send(ana, 'condition:updateDefinition', cegoEdit(cego, image.id));

    expect(ack).toMatchObject({ ok: true });
    for (const events of [caioEvents, dudaEvents]) {
      const updated = conditionDefinitionUpdatedDto.parse(
        await eventPayload(events, 'condition:definitionUpdated'),
      );
      expect(updated.definition).toMatchObject({ id: cego, imageAssetId: image.id });
    }
    expect(kaelConditionImages(await synced(caio, live.vharn))).toEqual([image.id]);
    const read = await live.http(duda.user, { method: 'GET', url: `/api/assets/${image.id}` });
    expect(read.statusCode).toBe(200);
  });

  it('Ana defining Sangrando with an image reaches Bia in condition:defined', async () => {
    const image = await conditionImageOf(live.ana, live.vharn);
    const ana = await live.atTable(live.ana, live.vharn);
    const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));

    const ack = await send(ana, 'condition:define', sangrandoDefine(image.id));

    expect(ack).toMatchObject({ ok: true });
    const defined = conditionDefinedDto.parse(await eventPayload(biaEvents, 'condition:defined'));
    expect(defined.definition).toMatchObject({ name: 'Sangrando', imageAssetId: image.id });
  });

  it('taking the image away (null) brings the icon back for everyone', async () => {
    const image = await conditionImageOf(live.ana, live.vharn);
    const ana = await live.atTable(live.ana, live.vharn);
    const cego = await kaelBlinded(ana);
    await send(ana, 'condition:updateDefinition', cegoEdit(cego, image.id));
    const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));

    await send(ana, 'condition:updateDefinition', cegoEdit(cego, null));

    const updated = conditionDefinitionUpdatedDto.parse(
      await eventPayload(biaEvents, 'condition:definitionUpdated'),
    );
    expect(updated.definition).toMatchObject({ icon: 'eye-off', imageAssetId: null });
    expect(kaelConditionImages(await synced(ana, live.vharn))).toEqual([null]);
  });
});

describe('an image that is not of the table', () => {
  it('a Quelm image on Vharn’s Cego is ASSET_NOT_FOUND and nobody hears of it', async () => {
    const quelmImage = await conditionImageOf(live.caio, live.quelm);
    const ana = await live.atTable(live.ana, live.vharn);
    const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const cego = cegoOf(await synced(ana, live.vharn)).id;

    const ack = await send(ana, 'condition:updateDefinition', cegoEdit(cego, quelmImage.id));

    expect(ack).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'ASSET_NOT_FOUND' }),
    });
    await silence();
    expect(biaEvents.events.map(({ name }) => name)).not.toContain('condition:definitionUpdated');
    expect(cegoOf(await synced(ana, live.vharn)).imageAssetId).toBeNull();
  });

  it('an image id nobody sent is ASSET_NOT_FOUND on define, and nothing is defined', async () => {
    const ana = await live.atTable(live.ana, live.vharn);

    const ack = await send(ana, 'condition:define', sangrandoDefine(crypto.randomUUID()));

    expect(ack).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'ASSET_NOT_FOUND' }),
    });
    const names = (await synced(ana, live.vharn)).conditionDefinitions.map(({ name }) => name);
    expect(names).not.toContain('Sangrando');
  });

  it('a forged userId is INVALID_BODY and Cego keeps no image', async () => {
    const image = await conditionImageOf(live.ana, live.vharn);
    const ana = await live.atTable(live.ana, live.vharn);
    const cego = cegoOf(await synced(ana, live.vharn)).id;

    const ack = await send(ana, 'condition:updateDefinition', {
      ...cegoEdit(cego, image.id),
      userId: live.bia.id,
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
    expect(cegoOf(await synced(ana, live.vharn)).imageAssetId).toBeNull();
  });
});
