import { setAccountPlan } from '../support/account-plans';
import { characterChangedEventDto, type TokenFormDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { gridState, linkToPlayerCharacter, tokenIn } from '../support/characters';
import { gridAck, newGrid, setGridVisibility } from '../support/grids';
import { envelope, eventPayload, send, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();
// Before the plans: the owners of Vharn and Quelm on amigo_do_dono (test accounts are born free).
beforeEach(async () => {
  await setAccountPlan(live.connection.db, live.ana.id, 'amigo_do_dono');
  await setAccountPlan(live.connection.db, live.caio.id, 'amigo_do_dono');
});

function formOf(name: string, size: number): TokenFormDto {
  const frame = size > 1 ? 'round' : 'square';
  return { id: crypto.randomUUID(), name, imageAssetId: null, width: size, height: size, frame };
}

async function newToken(ana: RealtimeClient, sceneId?: string): Promise<string> {
  const events = recordEventsOf(ana);
  const inGrid = sceneId === undefined ? {} : { sceneId };
  await send(ana, 'token:create', { ...tokenCommandFor(live.vharn, live.bia.id), ...inGrid });
  return (await createdTokenOf(events)).id;
}

// Lyra of Bia on the Salão and on the public Estrada, both wearing her character; all three have
// the Estrada open.
async function lyraOnTwoGrids() {
  const ana = await live.atTable(live.ana, live.vharn);
  const bia = await live.atTable(live.bia, live.vharn);
  const caio = await live.atTable(live.caio, live.vharn);
  const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada');
  await setGridVisibility(live, live.ana, live.vharn, estrada, 'public');
  for (const client of [ana, bia, caio]) await gridAck(client, 'scene:watch', live.vharn, estrada);
  const salaoLyra = await newToken(ana);
  const estradaLyra = await newToken(ana, estrada);
  const link = { memberId: live.bia.id };
  await linkToPlayerCharacter(live, ana, live.vharn, { ...link, tokenId: salaoLyra });
  const onEstrada = { ...link, sceneId: estrada, tokenId: estradaLyra };
  await linkToPlayerCharacter(live, ana, live.vharn, onEstrada);
  return { ana, bia, caio, estrada, salaoLyra, estradaLyra };
}

type Table = Awaited<ReturnType<typeof lyraOnTwoGrids>>;

async function saveForms(table: Table, forms: readonly TokenFormDto[]) {
  const command = tokenCommandFor(live.vharn, live.bia.id);
  const update = { ...command, ...envelope(live.vharn.id), tokenId: table.salaoLyra, forms };
  delete (update as { col?: number }).col;
  delete (update as { row?: number }).row;
  return send(table.ana, 'token:update', update);
}

async function salaoToken({ ana, salaoLyra }: Table) {
  return tokenIn(await synced(ana, live.vharn), salaoLyra);
}

async function estradaToken({ ana, estrada, estradaLyra }: Table) {
  return tokenIn(await gridState(ana, live.vharn, estrada), estradaLyra);
}

function wolfOf(forms: readonly TokenFormDto[]): TokenFormDto {
  const wolf = forms.find(({ name }) => name === 'Lobo');
  if (!wolf) throw new Error('the character has no Lobo');
  return wolf;
}

const elfAndWolf = () => [formOf('Elfa', 1), formOf('Lobo', 2)];

describe('the forms of a character, in every grid of its tokens', () => {
  // Regression: a form saved on a linked token stayed on that grid alone (2026-11-02).
  it('saved on the Salão, the Estrada has them, with the same ids', async () => {
    const table = await lyraOnTwoGrids();

    expect(await saveForms(table, elfAndWolf())).toMatchObject({ ok: true });

    const onSalao = (await salaoToken(table)).forms;
    expect(onSalao.map(({ name }) => name)).toEqual(['Elfa', 'Lobo']);
    expect((await estradaToken(table)).forms).toEqual(onSalao);
  });

  it('character:changed tells Bia the list and hides it from Caio', async () => {
    const table = await lyraOnTwoGrids();
    const biaEvents = recordEventsOf(table.bia);
    const caioEvents = recordEventsOf(table.caio);

    await saveForms(table, elfAndWolf());

    const toBia = characterChangedEventDto.parse(
      await eventPayload(biaEvents, 'character:changed'),
    );
    const toCaio = characterChangedEventDto.parse(
      await eventPayload(caioEvents, 'character:changed'),
    );
    expect(toBia.characters[0]?.forms).toHaveLength(2);
    expect(toCaio.characters[0]?.forms).toEqual([]);
  });

  it('the wolf on the Salão: the Estrada keeps its size and shows no form', async () => {
    const table = await lyraOnTwoGrids();
    await saveForms(table, elfAndWolf());
    const wolf = wolfOf((await salaoToken(table)).forms);

    const command = { ...envelope(live.vharn.id), tokenId: table.salaoLyra, formId: wolf.id };
    expect(await send(table.bia, 'token:setForm', command)).toMatchObject({ ok: true });

    expect(await salaoToken(table)).toMatchObject({ activeFormId: wolf.id, width: 2, height: 2 });
    expect(await estradaToken(table)).toMatchObject({ activeFormId: null, width: 1, height: 1 });
  });

  it('a form saved on the Salão can be chosen on the Estrada', async () => {
    const table = await lyraOnTwoGrids();
    await saveForms(table, elfAndWolf());
    const wolf = wolfOf((await estradaToken(table)).forms);

    const command = {
      ...envelope(live.vharn.id),
      sceneId: table.estrada,
      tokenId: table.estradaLyra,
      formId: wolf.id,
    };
    expect(await send(table.bia, 'token:setForm', command)).toMatchObject({ ok: true });

    expect(await estradaToken(table)).toMatchObject({ activeFormId: wolf.id, width: 2 });
    expect(await salaoToken(table)).toMatchObject({ activeFormId: null, width: 1 });
  });

  it('editing the list keeps the form the Estrada shows; dropping it clears it', async () => {
    const table = await lyraOnTwoGrids();
    await saveForms(table, elfAndWolf());
    const forms = (await estradaToken(table)).forms;
    const wolf = wolfOf(forms);
    const command = {
      ...envelope(live.vharn.id),
      sceneId: table.estrada,
      tokenId: table.estradaLyra,
      formId: wolf.id,
    };
    await send(table.bia, 'token:setForm', command);

    await saveForms(table, [wolf, ...forms.filter(({ id }) => id !== wolf.id), formOf('Corvo', 1)]);
    expect(await estradaToken(table)).toMatchObject({ activeFormId: wolf.id });
    expect((await estradaToken(table)).forms.map(({ name }) => name)).toEqual([
      'Lobo',
      'Elfa',
      'Corvo',
    ]);

    await saveForms(table, [formOf('Só uma', 1)]);
    expect(await estradaToken(table)).toMatchObject({ activeFormId: null });
    expect((await salaoToken(table)).forms.map(({ name }) => name)).toEqual(['Só uma']);
  });

  it('unlinking leaves the token with a copy; the character keeps its own', async () => {
    const table = await lyraOnTwoGrids();
    await saveForms(table, elfAndWolf());
    const shared = (await estradaToken(table)).forms;

    const unlink = { ...envelope(live.vharn.id), tokenId: table.salaoLyra };
    expect(await send(table.ana, 'token:unlinkFromCharacter', unlink)).toMatchObject({ ok: true });

    const copy = (await salaoToken(table)).forms;
    expect(copy.map(({ name }) => name)).toEqual(['Elfa', 'Lobo']);
    expect(copy.some(({ id }) => shared.some((form) => form.id === id))).toBe(false);
    expect((await estradaToken(table)).forms).toEqual(shared);
  });

  it('linking a free token with forms hands them to the character', async () => {
    const table = await lyraOnTwoGrids();
    await saveForms(table, [formOf('Elfa', 1)]);
    const unlink = { ...envelope(live.vharn.id), tokenId: table.salaoLyra };
    await send(table.ana, 'token:unlinkFromCharacter', unlink);
    const { forms } = await salaoToken(table);
    await saveForms(table, [...forms, formOf('Lobo', 2)]);

    const link = { memberId: live.bia.id, tokenId: table.salaoLyra };
    await linkToPlayerCharacter(live, table.ana, live.vharn, link);

    const names = (await estradaToken(table)).forms.map(({ name }) => name);
    expect(names).toEqual(['Elfa', 'Lobo']);
  });
});
