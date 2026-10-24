import {
  libraryChangedDto,
  libraryDto,
  librarySceneDto,
  sceneUpdatedDto,
  type LibraryDto,
  type LibrarySceneDto,
} from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { SceneFoldersDao } from '../../src/modules/library/scene-folders.dao';
import { scenes } from '../../src/modules/scenes/scenes.po';
import { tokens } from '../../src/modules/tokens/tokens.po';
import { silence } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

function libraryUrl(table: Table): string {
  return `/api/campaigns/${table.id}/scenes`;
}

async function libraryOf(user: SignedInUser, table: Table): Promise<LibraryDto> {
  const response = await live.http(user, { method: 'GET', url: libraryUrl(table) });
  if (response.statusCode !== 200) throw new Error(`list answered ${response.body}`);
  return libraryDto.parse(response.json());
}

async function createGrid(payload: object = {}): Promise<LibrarySceneDto> {
  const url = libraryUrl(live.vharn);
  const response = await live.http(live.ana, { method: 'POST', url, payload });
  if (response.statusCode !== 201) throw new Error(`create answered ${response.body}`);
  return librarySceneDto.parse(response.json());
}

function patchGrid(user: SignedInUser, sceneId: string, payload: object) {
  const url = `${libraryUrl(live.vharn)}/${sceneId}`;
  return live.http(user, { method: 'PATCH', url, payload });
}

function deleteGrid(user: SignedInUser, sceneId: string) {
  return live.http(user, { method: 'DELETE', url: `${libraryUrl(live.vharn)}/${sceneId}` });
}

async function addFolder(table: Table, name: string): Promise<string> {
  const folder = await new SceneFoldersDao(live.connection.db).insert({
    campaignId: table.id,
    name,
  });
  return folder.id;
}

async function placeGoblins(sceneId: string, count: number): Promise<void> {
  const goblins = Array.from({ length: count }, (_, index) => ({
    sceneId,
    name: `Goblin ${index + 1}`,
    initials: 'GO',
    side: 'enemy' as const,
    col: index,
    row: 0,
  }));
  await live.connection.db.insert(tokens).values(goblins);
}

describe('the grids of the library over HTTP', () => {
  it('Ana lists every grid with the group one, the token counts and the folders', async () => {
    const ato1 = await addFolder(live.vharn, 'Ato 1');
    const cripta = await createGrid({ name: 'Cripta', folderId: ato1 });
    await placeGoblins(cripta.id, 3);

    const library = await libraryOf(live.ana, live.vharn);

    expect(library.activeSceneId).not.toBeNull();
    expect(library.scenes.map(({ id, tokenCount }) => [id, tokenCount])).toEqual([
      [library.activeSceneId, 0],
      [cripta.id, 3],
    ]);
    expect(library.folders).toEqual([{ id: ato1, name: 'Ato 1', parentId: null }]);
  });

  it('Bia sees only the group grid and the public ones, without counts nor private folders', async () => {
    const ato2 = await addFolder(live.vharn, 'Ato 2');
    await createGrid({ name: 'Ossuário', folderId: ato2 });
    const torre = await createGrid({ name: 'Torre' });
    await patchGrid(live.ana, torre.id, { visibility: 'public' });

    const library = await libraryOf(live.bia, live.vharn);

    expect(library.scenes.map(({ id }) => id)).toEqual([library.activeSceneId, torre.id]);
    expect(library.scenes.map(({ tokenCount }) => tokenCount)).toEqual([null, null]);
    expect(library.folders).toEqual([]);
  });

  it('Ana creating in Ato 1 gets 201 with an unnamed, private 20×12 grid', async () => {
    const ato1 = await addFolder(live.vharn, 'Ato 1');

    const created = await createGrid({ folderId: ato1 });

    expect(created).toMatchObject({
      name: 'Grid sem nome',
      folderId: ato1,
      visibility: 'private',
      widthCells: 20,
      heightCells: 12,
      background: null,
      tokenCount: 0,
    });
  });

  it('a name with spaces around is saved trimmed', async () => {
    const grid = await createGrid();

    const response = await patchGrid(live.ana, grid.id, { name: '  Torre ' });

    expect(response.statusCode).toBe(200);
    expect(librarySceneDto.parse(response.json()).name).toBe('Torre');
  });

  it('publishing a grid puts it in the list of Bia', async () => {
    const torre = await createGrid({ name: 'Torre' });
    const before = await libraryOf(live.bia, live.vharn);

    await patchGrid(live.ana, torre.id, { visibility: 'public' });

    expect(before.scenes.map(({ id }) => id)).not.toContain(torre.id);
    const after = await libraryOf(live.bia, live.vharn);
    expect(after.scenes.map(({ id }) => id)).toContain(torre.id);
  });

  it('deleting a grid answers 204 and takes its tokens in the cascade', async () => {
    const cripta = await createGrid({ name: 'Cripta' });
    await placeGoblins(cripta.id, 2);

    const response = await deleteGrid(live.ana, cripta.id);

    expect(response.statusCode).toBe(204);
    const left = await live.connection.db
      .select()
      .from(tokens)
      .where(eq(tokens.sceneId, cripta.id));
    expect(left).toEqual([]);
    expect((await libraryOf(live.ana, live.vharn)).scenes.map(({ id }) => id)).not.toContain(
      cripta.id,
    );
  });

  it.each(['POST', 'PATCH', 'DELETE'] as const)(
    'Bia sending %s is 403 FORBIDDEN',
    async (method) => {
      const grid = await createGrid();
      const url =
        method === 'POST' ? libraryUrl(live.vharn) : `${libraryUrl(live.vharn)}/${grid.id}`;
      const payload = method === 'DELETE' ? undefined : { name: 'Minha' };

      const response = await live.http(live.bia, { method, url, payload });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'FORBIDDEN' });
    },
  );

  it('deleting the group grid is 409 SCENE_IS_ACTIVE', async () => {
    const { activeSceneId } = await libraryOf(live.ana, live.vharn);

    const response = await deleteGrid(live.ana, activeSceneId ?? 'none');

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'SCENE_IS_ACTIVE' });
  });

  it('a grid of Quelm in the URL of Vharn is 404 SCENE_NOT_FOUND and stays untouched', async () => {
    const quelm = await libraryOf(live.caio, live.quelm);
    const quelmGridId = quelm.activeSceneId ?? 'none';

    const renamed = await patchGrid(live.ana, quelmGridId, { name: 'Roubada' });
    const deleted = await deleteGrid(live.ana, quelmGridId);

    expect([renamed.statusCode, deleted.statusCode]).toEqual([404, 404]);
    expect(renamed.json()).toMatchObject({ code: 'SCENE_NOT_FOUND' });
    expect((await libraryOf(live.caio, live.quelm)).scenes[0]?.name).not.toBe('Roubada');
  });

  it('Bia, who is not at Quelm, listing it is 404 CAMPAIGN_NOT_FOUND', async () => {
    const response = await live.http(live.bia, { method: 'GET', url: libraryUrl(live.quelm) });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
  });

  it('a folder of Quelm as the folder of a Vharn grid is 404 FOLDER_NOT_FOUND', async () => {
    const quelmFolder = await addFolder(live.quelm, 'Quelm');
    const url = libraryUrl(live.vharn);

    const response = await live.http(live.ana, {
      method: 'POST',
      url,
      payload: { folderId: quelmFolder },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'FOLDER_NOT_FOUND' });
  });

  it.each([
    ['an empty name', { name: '' }],
    ['a name of 61 characters', { name: 'x'.repeat(61) }],
    ['a campaignId in the body', { campaignId: '3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10' }],
  ])('%s is 400 INVALID_BODY', async (_case, payload) => {
    const url = libraryUrl(live.vharn);

    const response = await live.http(live.ana, { method: 'POST', url, payload });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'INVALID_BODY' });
  });

  it('without a session cookie the list is 401', async () => {
    const response = await live.http(null, { method: 'GET', url: libraryUrl(live.vharn) });

    expect(response.statusCode).toBe(401);
  });

  it('Ana and Bia hear library:changed after each change, and the table of Quelm does not', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const quelm = recordEventsOf(await live.atTable(live.caio, live.quelm));

    const grid = await createGrid();
    await patchGrid(live.ana, grid.id, { name: 'Torre' });
    await deleteGrid(live.ana, grid.id);

    await Promise.all([ana.until(3), bia.until(3)]);
    await silence();
    const heard = bia.events.filter(({ name }) => name === 'library:changed');
    expect(heard.map(({ payload }) => libraryChangedDto.parse(payload).campaignId)).toEqual([
      live.vharn.id,
      live.vharn.id,
      live.vharn.id,
    ]);
    expect(ana.events.filter(({ name }) => name === 'library:changed')).toHaveLength(3);
    expect(quelm.events.filter(({ name }) => name === 'library:changed')).toEqual([]);
  });

  it('renaming the group grid reaches Bia in its rooms as scene:updated, one version up', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const quelm = recordEventsOf(await live.atTable(live.caio, live.quelm));
    const { activeSceneId } = await libraryOf(live.ana, live.vharn);
    const before = await live.connection.db
      .select({ version: scenes.version })
      .from(scenes)
      .where(eq(scenes.id, activeSceneId ?? ''));

    await patchGrid(live.ana, activeSceneId ?? '', { name: 'Salão' });

    await bia.until(2);
    await silence();
    const updates = bia.events.filter(({ name }) => name === 'scene:updated');
    expect(updates.map(({ payload }) => sceneUpdatedDto.parse(payload))).toMatchObject([
      { sceneId: activeSceneId, version: (before[0]?.version ?? 0) + 1, scene: { name: 'Salão' } },
    ]);
    expect(quelm.events.filter(({ name }) => name === 'scene:updated')).toEqual([]);
  });

  it('a refused change tells nobody', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));

    await live.http(live.bia, { method: 'POST', url: libraryUrl(live.vharn), payload: {} });

    await silence();
    expect(bia.events.filter(({ name }) => name === 'library:changed')).toEqual([]);
  });

  it('a restart of the app keeps the grids, their names and their visibility', async () => {
    const torre = await createGrid({ name: 'Torre' });
    await patchGrid(live.ana, torre.id, { visibility: 'public' });

    await live.restart();

    const library = await libraryOf(live.ana, live.vharn);
    expect(library.scenes.find(({ id }) => id === torre.id)).toMatchObject({
      name: 'Torre',
      visibility: 'public',
    });
  });
});
