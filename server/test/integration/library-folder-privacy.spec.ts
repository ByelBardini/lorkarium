import {
  libraryDto,
  librarySceneDto,
  sceneClosedDto,
  sceneFolderDto,
  type LibraryDto,
  type SceneFolderDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { DocumentHttpHarness } from '../support/document-http';
import { activateGrid, gridAck, setGridVisibility } from '../support/grids';
import { eventPayload } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
const documents = new DocumentHttpHarness(live);

function foldersUrl(): string {
  return `/api/campaigns/${live.vharn.id}/scene-folders`;
}

async function createFolder(
  name: string,
  options: Readonly<{ parentId?: string; visibility?: 'private' | 'public' }> = {},
): Promise<SceneFolderDto> {
  const payload = { name, ...options };
  const response = await live.http(live.ana, { method: 'POST', url: foldersUrl(), payload });
  expect(response.statusCode, response.body).toBe(201);
  return sceneFolderDto.parse(response.json());
}

async function setFolderVisibility(folderId: string, visibility: 'private' | 'public') {
  const url = `${foldersUrl()}/${folderId}`;
  const payload = { visibility };
  const response = await live.http(live.ana, { method: 'PATCH', url, payload });
  expect(response.statusCode, response.body).toBe(200);
}

function scenesUrl(): string {
  return `/api/campaigns/${live.vharn.id}/scenes`;
}

async function publicGridIn(folderId: string | null, name: string): Promise<string> {
  const payload = { name, folderId };
  const response = await live.http(live.ana, { method: 'POST', url: scenesUrl(), payload });
  const id = librarySceneDto.parse(response.json()).id;
  await setGridVisibility(live, live.ana, live.vharn, id, 'public');
  return id;
}

async function libraryOf(user: SignedInUser): Promise<LibraryDto> {
  return libraryDto.parse((await live.http(user, { method: 'GET', url: scenesUrl() })).json());
}

function namesOf(items: readonly Readonly<{ name: string }>[]): string[] {
  return items.map(({ name }) => name);
}

describe('a private folder of the library', () => {
  it('is born public when the master does not choose', async () => {
    expect((await createFolder('Ato 1')).visibility).toBe('public');
  });

  it('hides from Bia a public grid inside it and a public subfolder under it; Ana sees both', async () => {
    const segredos = await createFolder('Segredos', { visibility: 'private' });
    const cofre = await createFolder('Cofre', { parentId: segredos.id });
    await publicGridIn(segredos.id, 'Torre');
    await publicGridIn(cofre.id, 'Cripta');

    const ofBia = await libraryOf(live.bia);
    expect(namesOf(ofBia.scenes)).not.toEqual(expect.arrayContaining(['Torre']));
    expect(namesOf(ofBia.scenes)).not.toEqual(expect.arrayContaining(['Cripta']));
    expect(ofBia.folders).toEqual([]);

    const ofAna = await libraryOf(live.ana);
    expect(namesOf(ofAna.scenes)).toEqual(expect.arrayContaining(['Torre', 'Cripta']));
    expect(namesOf(ofAna.folders)).toEqual(expect.arrayContaining(['Segredos', 'Cofre']));
  });

  it('a grid it hides is SCENE_NOT_FOUND to Bia even by its id', async () => {
    const segredos = await createFolder('Segredos', { visibility: 'private' });
    const torre = await publicGridIn(segredos.id, 'Torre');
    const bia = await live.atTable(live.bia, live.vharn);

    expect(await gridAck(bia, 'scene:watch', live.vharn, torre)).toMatchObject({
      ok: false,
      error: { code: 'SCENE_NOT_FOUND' },
    });
  });

  it('the group grid stays in reach inside it, and Bia sees that folder with only that grid', async () => {
    const segredos = await createFolder('Segredos', { visibility: 'private' });
    const salao = await publicGridIn(segredos.id, 'Salão');
    await publicGridIn(segredos.id, 'Torre');
    const ana = await live.atTable(live.ana, live.vharn);
    await activateGrid(ana, live.vharn, salao);

    const ofBia = await libraryOf(live.bia);
    expect(namesOf(ofBia.folders)).toEqual(['Segredos']);
    expect(namesOf(ofBia.scenes)).toEqual(expect.arrayContaining(['Salão']));
    expect(namesOf(ofBia.scenes)).not.toEqual(expect.arrayContaining(['Torre']));
  });

  it('hiding the folder takes Bia out of a public grid she had open inside it', async () => {
    const ato = await createFolder('Ato 1');
    const torre = await publicGridIn(ato.id, 'Torre');
    const bia = await live.atTable(live.bia, live.vharn);
    const events = recordEventsOf(bia);
    await gridAck(bia, 'scene:watch', live.vharn, torre);

    await setFolderVisibility(ato.id, 'private');

    const closed = sceneClosedDto.parse(await eventPayload(events, 'scene:closed'));
    expect(closed).toMatchObject({ sceneId: torre, reason: 'private' });
  });

  it('moving an open grid into it takes Bia out too', async () => {
    const torre = await publicGridIn(null, 'Torre');
    const segredos = await createFolder('Segredos', { visibility: 'private' });
    const bia = await live.atTable(live.bia, live.vharn);
    const events = recordEventsOf(bia);
    await gridAck(bia, 'scene:watch', live.vharn, torre);

    const url = `${scenesUrl()}/${torre}`;
    await live.http(live.ana, { method: 'PATCH', url, payload: { folderId: segredos.id } });

    const closed = sceneClosedDto.parse(await eventPayload(events, 'scene:closed'));
    expect(closed).toMatchObject({ sceneId: torre, reason: 'private' });
  });

  it('making it public gives everything back as it was marked', async () => {
    const segredos = await createFolder('Segredos', { visibility: 'private' });
    await publicGridIn(segredos.id, 'Torre');

    await setFolderVisibility(segredos.id, 'public');

    expect(namesOf((await libraryOf(live.bia)).scenes)).toEqual(expect.arrayContaining(['Torre']));
  });

  it('hides a public document from Bia by its id, unless she owns it', async () => {
    const segredos = await createFolder('Segredos', { visibility: 'private' });
    const diario = await documents.administer(await documents.create({ folderId: segredos.id }), {
      visibility: 'public',
    });
    const read = { method: 'GET', url: documents.url(diario.id) } as const;
    expect((await live.http(live.bia, read)).statusCode).toBe(404);

    await documents.administer(diario, { ownerIds: [live.bia.id] });

    expect((await live.http(live.bia, read)).statusCode).toBe(200);
  });
});
