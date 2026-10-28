import {
  tokenFormChangedDto,
  tokensCreatedDto,
  type TokenDto,
  type TokenFormDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { castIdOf, gridState, linkToCard, tokenIn } from '../support/characters';
import { gridAck, newGrid, setGridVisibility } from '../support/grids';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import {
  recordEventsOf,
  type EventRecorder,
  type RealtimeClient,
} from '../support/realtime-client';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

function formOf(name: string, size: number, imageAssetId: string | null = null): TokenFormDto {
  const frame = size > 1 ? 'round' : 'square';
  return { id: crypto.randomUUID(), name, imageAssetId, width: size, height: size, frame };
}

// Ana, Bia and Caio at Vharn; Lyra of Bia on the group grid with the elf, the wolf (Bia's image,
// 2×2) and the raven, saved by Ana through token:update. Each client is recorded after that.
async function lyraWithForms() {
  const ana = await live.atTable(live.ana, live.vharn);
  const bia = await live.atTable(live.bia, live.vharn);
  const caio = await live.atTable(live.caio, live.vharn);
  const created = recordEventsOf(ana);
  const command = tokenCommandFor(live.vharn, live.bia.id);
  await send(ana, 'token:create', command);
  const lyraId = (await createdTokenOf(created)).id;
  const wolfImage = (await live.sendImage(live.bia, live.vharn)).id;
  const sent = [formOf('Elfa', 1), formOf('Lobo atroz', 2, wolfImage), formOf('Corvo', 0.5)];
  const update = { ...command, ...envelope(live.vharn.id), tokenId: lyraId, forms: sent };
  delete (update as { col?: number }).col;
  delete (update as { row?: number }).row;
  const ack = await send(ana, 'token:update', update);
  if (!ack.ok) throw new Error(`token:update refused with ${ack.error.code}`);
  const forms = tokenIn(await synced(ana, live.vharn), lyraId).forms;
  const recorders = [recordEventsOf(ana), recordEventsOf(bia), recordEventsOf(caio)] as const;
  return { ana, bia, caio, lyraId, forms, wolfImage, recorders };
}

function setForm(tokenId: string, formId: string, extra: object = {}): object {
  return { ...envelope(live.vharn.id), tokenId, formId, ...extra };
}

function wolfOf(forms: readonly TokenFormDto[]): TokenFormDto {
  const wolf = forms.find(({ name }) => name === 'Lobo atroz');
  if (!wolf) throw new Error(`no wolf in ${JSON.stringify(forms)}`);
  return wolf;
}

async function formChangedOf(recorder: EventRecorder) {
  return tokenFormChangedDto.parse(await eventPayload(recorder, 'token:formChanged'));
}

describe('the forms of a token', () => {
  it('saved by Ana, Bia (who controls Lyra) syncs the three in order and Caio gets none', async () => {
    const { bia, caio, lyraId, forms } = await lyraWithForms();

    const ofBia = tokenIn(await synced(bia, live.vharn), lyraId);
    const ofCaio = tokenIn(await synced(caio, live.vharn), lyraId);

    expect(forms.map(({ name }) => name)).toEqual(['Elfa', 'Lobo atroz', 'Corvo']);
    expect(ofBia.forms).toEqual(forms);
    expect(ofCaio.forms).toEqual([]);
    expect(ofCaio.activeFormId).toBeNull();
  });

  it('a form with an image of Quelm is ASSET_NOT_FOUND and the forms stay', async () => {
    const { ana, lyraId, forms } = await lyraWithForms();
    const quelmImage = (await live.sendImage(live.caio, live.quelm)).id;
    const command = tokenCommandFor(live.vharn, live.bia.id);
    const update = { ...command, tokenId: lyraId, forms: [formOf('Roubo', 1, quelmImage)] };
    delete (update as { col?: number }).col;
    delete (update as { row?: number }).row;

    const ack = await send(ana, 'token:update', update);

    expect(ack).toMatchObject({ ok: false, error: { code: 'ASSET_NOT_FOUND' } });
    expect(tokenIn(await synced(ana, live.vharn), lyraId).forms).toEqual(forms);
  });

  it('Caio at Quelm reads nothing of the Lyra of Vharn nor of her forms', async () => {
    await lyraWithForms();
    const caioAtQuelm = await live.atTable(live.caio, live.quelm);

    expect((await synced(caioAtQuelm, live.quelm)).tokens).toEqual([]);
  });

  it('a paste of Lyra in the wolf copies her forms with new ids and shows the copy of the wolf', async () => {
    const { ana, lyraId, forms, recorders } = await lyraWithForms();
    const wolf = wolfOf(forms);
    await send(ana, 'token:setForm', setForm(lyraId, wolf.id));
    const copy: Partial<TokenDto> & Record<string, unknown> = {
      ...tokenCommandFor(live.vharn, live.bia.id),
    };
    delete copy.actionId;
    delete copy.campaignId;
    const item = { ...copy, col: 8, row: 8, forms, activeFormId: wolf.id };

    const ack = await send(ana, 'token:createMany', { ...envelope(live.vharn.id), tokens: [item] });

    expect(ack).toMatchObject({ ok: true });
    const event = tokensCreatedDto.parse(await eventPayload(recorders[0], 'token:createdMany'));
    const [pasted] = event.tokens;
    expect(pasted?.forms.map(({ name }) => name)).toEqual(['Elfa', 'Lobo atroz', 'Corvo']);
    expect(pasted?.forms.some(({ id }) => forms.some((original) => original.id === id))).toBe(
      false,
    );
    expect(pasted?.activeFormId).toBe(pasted?.forms[1]?.id);
  });
});

describe('token:setForm over Socket.IO', () => {
  it('Bia turns Lyra into the wolf: Ana, Bia and Caio hear it and the next sync has it', async () => {
    const { bia, caio, lyraId, forms, wolfImage, recorders } = await lyraWithForms();
    const wolf = wolfOf(forms);

    const ack = await send(bia, 'token:setForm', setForm(lyraId, wolf.id));

    expect(ack).toMatchObject({ ok: true });
    for (const recorder of recorders) {
      expect(await formChangedOf(recorder)).toMatchObject({
        tokenId: lyraId,
        activeFormId: wolf.id,
        imageAssetId: wolfImage,
        frame: 'round',
        box: { col: 3, row: 4, width: 2, height: 2 },
      });
    }
    const seen = tokenIn(await synced(caio, live.vharn), lyraId);
    expect(seen).toMatchObject({ activeFormId: wolf.id, imageAssetId: wolfImage, width: 2 });
    expect(seen.frame).toBe('round');
    expect(seen.forms).toEqual([]);
    expect(tokenIn(await synced(bia, live.vharn), lyraId).forms).toHaveLength(3);
  });

  it('Caio, who does not control Lyra, is FORBIDDEN and nobody hears of it', async () => {
    const { caio, lyraId, forms, recorders } = await lyraWithForms();

    const ack = await send(caio, 'token:setForm', setForm(lyraId, wolfOf(forms).id));

    expect(ack).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    await silence();
    expect(recorders[0].events.map(({ name }) => name)).not.toContain('token:formChanged');
  });

  it('a form that is not of Lyra is TOKEN_FORM_NOT_FOUND', async () => {
    const { ana, lyraId } = await lyraWithForms();

    const ack = await send(ana, 'token:setForm', setForm(lyraId, crypto.randomUUID()));

    expect(ack).toMatchObject({ ok: false, error: { code: 'TOKEN_FORM_NOT_FOUND' } });
  });

  it('a token of Quelm is TOKEN_NOT_FOUND and a grid of Quelm is SCENE_NOT_FOUND', async () => {
    const { ana, lyraId, forms } = await lyraWithForms();
    const caioAtQuelm = await live.atTable(live.caio, live.quelm);
    const events = recordEventsOf(caioAtQuelm);
    await send(caioAtQuelm, 'token:create', tokenCommandFor(live.quelm, live.caio.id));
    const quelmTokenId = (await createdTokenOf(events)).id;
    const quelmGrid = (await synced(caioAtQuelm, live.quelm)).scene.id;
    const wolfId = wolfOf(forms).id;

    const onToken = await send(ana, 'token:setForm', setForm(quelmTokenId, wolfId));
    const onGrid = await send(
      ana,
      'token:setForm',
      setForm(lyraId, wolfId, { sceneId: quelmGrid }),
    );

    expect(onToken).toMatchObject({ ok: false, error: { code: 'TOKEN_NOT_FOUND' } });
    expect(onGrid).toMatchObject({ ok: false, error: { code: 'SCENE_NOT_FOUND' } });
  });

  it('a switch carrying a forged userId gets INVALID_BODY', async () => {
    const { bia, lyraId, forms } = await lyraWithForms();

    const forged = setForm(lyraId, wolfOf(forms).id, { userId: live.ana.id });

    expect(await send(bia, 'token:setForm', forged)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_BODY' },
    });
  });

  it('after a restart, the board:sync keeps the wolf', async () => {
    const { bia, lyraId, forms } = await lyraWithForms();
    const wolf = wolfOf(forms);
    await send(bia, 'token:setForm', setForm(lyraId, wolf.id));

    await live.restart();

    const state = await synced(await live.atTable(live.bia, live.vharn), live.vharn);
    expect(tokenIn(state, lyraId)).toMatchObject({ activeFormId: wolf.id, width: 2, height: 2 });
  });

  it('the Lyra linked to her card turns into the wolf on the Salão: the Estrada gets the image, its size stays', async () => {
    const { ana, bia, lyraId, wolfImage } = await lyraWithForms();
    const linked = await linkedOnTwoGrids(ana, bia, lyraId);
    const { castId, estrada, lyraOfEstrada } = linked;
    const anaEvents = recordEventsOf(ana);
    const wolf = wolfOf(tokenIn(await synced(bia, live.vharn), lyraId).forms);

    const ack = await send(bia, 'token:setForm', setForm(lyraId, wolf.id));

    expect(ack).toMatchObject({ ok: true });
    await silence();
    const heard = anaEvents.events
      .filter(({ name }) => name === 'token:formChanged')
      .map(({ payload }) => tokenFormChangedDto.parse(payload));
    expect(heard.map(({ sceneId }) => sceneId)).toEqual([castId, linked.salao]);
    expect(heard[0]).not.toHaveProperty('box');
    const onEstrada = tokenIn(await gridState(bia, live.vharn, estrada), lyraOfEstrada);
    expect(onEstrada).toMatchObject({ imageAssetId: wolfImage, activeFormId: wolf.id, width: 1 });
    expect(onEstrada.frame).toBe('round');
    const onSalao = tokenIn(await synced(bia, live.vharn), lyraId);
    expect(onSalao).toMatchObject({ width: 2, height: 2, activeFormId: wolf.id });
  });
});

// Lyra linked to Bia's card on the Salão (her forms then saved on the anchor) and on the public
// Estrada, which everyone has open.
async function linkedOnTwoGrids(ana: RealtimeClient, bia: RealtimeClient, lyraId: string) {
  const castId = await castIdOf(live, live.ana, live.vharn);
  const salao = (await synced(ana, live.vharn)).scene.id;
  const forms = tokenIn(await synced(ana, live.vharn), lyraId).forms;
  await linkToCard(ana, live.vharn, { tokenId: lyraId, memberId: live.bia.id });
  const command = tokenCommandFor(live.vharn, live.bia.id);
  const update = { ...command, ...envelope(live.vharn.id), tokenId: lyraId, forms };
  delete (update as { col?: number }).col;
  delete (update as { row?: number }).row;
  await send(ana, 'token:update', update);
  const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada');
  await setGridVisibility(live, live.ana, live.vharn, estrada, 'public');
  for (const client of [ana, bia]) await gridAck(client, 'scene:watch', live.vharn, estrada);
  const anaEvents = recordEventsOf(ana);
  await send(ana, 'token:create', { ...command, sceneId: estrada, bars: [] });
  const lyraOfEstrada = (await createdTokenOf(anaEvents)).id;
  const link = { sceneId: estrada, tokenId: lyraOfEstrada, memberId: live.bia.id };
  await linkToCard(ana, live.vharn, link);
  return { castId, salao, estrada, lyraOfEstrada };
}
