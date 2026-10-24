import {
  libraryDto,
  librarySceneDto,
  sceneFolderDto,
  type LibraryDto,
  type SceneFolderDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { SceneFoldersDao } from '../../src/modules/library/scene-folders.dao';
import { silence } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

function foldersUrl(): string {
  return `/api/campaigns/${live.vharn.id}/scene-folders`;
}

async function createFolder(name: string, parentId?: string): Promise<SceneFolderDto> {
  const payload = parentId ? { name, parentId } : { name };
  const response = await live.http(live.ana, { method: 'POST', url: foldersUrl(), payload });
  if (response.statusCode !== 201) throw new Error(`create folder answered ${response.body}`);
  return sceneFolderDto.parse(response.json());
}

function patchFolder(user: SignedInUser, folderId: string, payload: object) {
  return live.http(user, { method: 'PATCH', url: `${foldersUrl()}/${folderId}`, payload });
}

function deleteFolder(user: SignedInUser, folderId: string) {
  return live.http(user, { method: 'DELETE', url: `${foldersUrl()}/${folderId}` });
}

async function gridIn(folderId: string, name: string): Promise<string> {
  const url = `/api/campaigns/${live.vharn.id}/scenes`;
  const payload = { name, folderId };
  const response = await live.http(live.ana, { method: 'POST', url, payload });
  return librarySceneDto.parse(response.json()).id;
}

async function libraryOfAna(): Promise<LibraryDto> {
  const url = `/api/campaigns/${live.vharn.id}/scenes`;
  return libraryDto.parse((await live.http(live.ana, { method: 'GET', url })).json());
}

// d1 › d2 › … › dN, each inside the one before.
async function chainOf(levels: number): Promise<SceneFolderDto[]> {
  const chain: SceneFolderDto[] = [];
  for (let level = 1; level <= levels; level += 1) {
    chain.push(await createFolder(`d${level}`, chain.at(-1)?.id));
  }
  return chain;
}

describe('the folders of the library over HTTP', () => {
  it('Ana creates "Ato 1" and "Masmorra" inside it, and both come in the list', async () => {
    const ato1 = await createFolder('Ato 1');
    const masmorra = await createFolder('Masmorra', ato1.id);

    expect(masmorra.parentId).toBe(ato1.id);
    expect((await libraryOfAna()).folders).toEqual([
      { id: ato1.id, name: 'Ato 1', parentId: null },
      { id: masmorra.id, name: 'Masmorra', parentId: ato1.id },
    ]);
  });

  it('renaming saves the trimmed name', async () => {
    const ato1 = await createFolder('Ato 1');

    const response = await patchFolder(live.ana, ato1.id, { name: '  Prólogo ' });

    expect(response.statusCode).toBe(200);
    expect(sceneFolderDto.parse(response.json()).name).toBe('Prólogo');
  });

  it('moving Masmorra with parentId null takes it to the root', async () => {
    const ato1 = await createFolder('Ato 1');
    const masmorra = await createFolder('Masmorra', ato1.id);

    const response = await patchFolder(live.ana, masmorra.id, { parentId: null });

    expect(sceneFolderDto.parse(response.json()).parentId).toBeNull();
  });

  it('deleting Ato 1 lifts its subfolder and its 3 grids to the root and deletes no grid', async () => {
    const ato1 = await createFolder('Ato 1');
    const masmorra = await createFolder('Masmorra', ato1.id);
    const grids = [await gridIn(ato1.id, 'Cripta'), await gridIn(ato1.id, 'Ossuário')];
    grids.push(await gridIn(ato1.id, 'Torre'));

    const response = await deleteFolder(live.ana, ato1.id);

    expect(response.statusCode).toBe(204);
    const library = await libraryOfAna();
    expect(library.folders).toEqual([{ id: masmorra.id, name: 'Masmorra', parentId: null }]);
    const lifted = library.scenes.filter(({ id }) => grids.includes(id));
    expect(lifted.map(({ folderId }) => folderId)).toEqual([null, null, null]);
  });

  it('deleting Masmorra lifts its grid to Ato 1, not to the root', async () => {
    const ato1 = await createFolder('Ato 1');
    const masmorra = await createFolder('Masmorra', ato1.id);
    const cripta = await gridIn(masmorra.id, 'Cripta');

    await deleteFolder(live.ana, masmorra.id);

    const library = await libraryOfAna();
    expect(library.scenes.find(({ id }) => id === cripta)?.folderId).toBe(ato1.id);
  });

  it('moving Ato 1 into Masmorra, its child, is 409 FOLDER_CYCLE', async () => {
    const ato1 = await createFolder('Ato 1');
    const masmorra = await createFolder('Masmorra', ato1.id);

    const response = await patchFolder(live.ana, ato1.id, { parentId: masmorra.id });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'FOLDER_CYCLE' });
  });

  it('creating at the 6th level is 422 FOLDER_TOO_DEEP', async () => {
    const chain = await chainOf(5);
    const payload = { name: 'd6', parentId: chain.at(-1)?.id };

    const response = await live.http(live.ana, { method: 'POST', url: foldersUrl(), payload });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'FOLDER_TOO_DEEP' });
  });

  it('Bia creating, renaming or deleting a folder is 403 FORBIDDEN', async () => {
    const ato1 = await createFolder('Ato 1');
    const created = await live.http(live.bia, {
      method: 'POST',
      url: foldersUrl(),
      payload: { name: 'Minha' },
    });

    const renamed = await patchFolder(live.bia, ato1.id, { name: 'Minha' });
    const deleted = await deleteFolder(live.bia, ato1.id);

    const statuses = [created.statusCode, renamed.statusCode, deleted.statusCode];
    expect(statuses).toEqual([403, 403, 403]);
  });

  it('a folder of Quelm in the URL of Vharn is 404 FOLDER_NOT_FOUND and stays', async () => {
    const folders = new SceneFoldersDao(live.connection.db);
    const quelmFolder = await folders.insert({ campaignId: live.quelm.id, name: 'Quelm' });

    const renamed = await patchFolder(live.ana, quelmFolder.id, { name: 'Roubada' });
    const deleted = await deleteFolder(live.ana, quelmFolder.id);

    expect([renamed.statusCode, deleted.statusCode]).toEqual([404, 404]);
    expect(renamed.json()).toMatchObject({ code: 'FOLDER_NOT_FOUND' });
    expect(await folders.listOfCampaign(live.quelm.id)).toEqual([
      expect.objectContaining({ name: 'Quelm' }),
    ]);
  });

  it('a name of 41 characters is 400 INVALID_BODY', async () => {
    const payload = { name: 'x'.repeat(41) };

    const response = await live.http(live.ana, { method: 'POST', url: foldersUrl(), payload });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'INVALID_BODY' });
  });

  it('Bia hears library:changed after each folder change', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));

    const ato1 = await createFolder('Ato 1');
    await patchFolder(live.ana, ato1.id, { name: 'Prólogo' });
    await deleteFolder(live.ana, ato1.id);

    await bia.until(3);
    await silence();
    expect(bia.events.filter(({ name }) => name === 'library:changed')).toHaveLength(3);
  });
});
