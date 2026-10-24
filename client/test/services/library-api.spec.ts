import { beforeEach, describe, expect, it } from 'vitest';
import { HttpLibraryApi } from '@/services/library-api';
import { VHARN } from '../support/campaigns-api-fake';
import { HttpTransportFake } from '../support/http-transport-fake';
import { ATO_1, CATACUMBAS, libraryScene, vharnLibrary } from '../support/library-fixtures';
import { TORRE_SCENE } from '../support/scene-tab-fixtures';

const SCENES = `/campaigns/${VHARN.id}/scenes`;
const TORRE = `${SCENES}/${TORRE_SCENE.id}`;
const FOLDERS = `/campaigns/${VHARN.id}/scene-folders`;
const CATACUMBAS_PATH = `${FOLDERS}/${CATACUMBAS.id}`;

function apiError(code: string) {
  return { code, message: 'x' };
}

describe('HttpLibraryApi', () => {
  let transport: HttpTransportFake;
  let api: HttpLibraryApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpLibraryApi(transport);
  });

  it('list gets the library of the table and yields it', async () => {
    transport.respondWith(200, vharnLibrary());
    expect(await api.list(VHARN.id)).toEqual({ ok: true, value: vharnLibrary() });
    expect(transport.requests).toEqual([{ method: 'GET', path: SCENES, body: undefined }]);
  });

  it('createScene posts the name and folder and yields the new grid', async () => {
    const torre = libraryScene(TORRE_SCENE, { folderId: CATACUMBAS.id });
    transport.respondWith(201, torre);
    const input = { name: 'Torre', folderId: CATACUMBAS.id };
    expect(await api.createScene(VHARN.id, input)).toEqual({ ok: true, value: torre });
    expect(transport.requests).toEqual([{ method: 'POST', path: SCENES, body: input }]);
  });

  it('updateScene patches the grid with the changes alone', async () => {
    const torre = libraryScene(TORRE_SCENE, { visibility: 'public' });
    transport.respondWith(200, torre);
    const changes = { visibility: 'public' } as const;
    expect(await api.updateScene(VHARN.id, TORRE_SCENE.id, changes)).toEqual({
      ok: true,
      value: torre,
    });
    expect(transport.requests).toEqual([{ method: 'PATCH', path: TORRE, body: changes }]);
  });

  it('duplicateScene posts to the copies of the grid and yields the copy', async () => {
    const copy = libraryScene({ ...TORRE_SCENE, id: ATO_1.id, name: 'Torre (cópia)' });
    transport.respondWith(201, copy);
    expect(await api.duplicateScene(VHARN.id, TORRE_SCENE.id)).toEqual({ ok: true, value: copy });
    expect(transport.requests).toEqual([
      { method: 'POST', path: `${TORRE}/copies`, body: undefined },
    ]);
  });

  it('removeScene deletes the grid and a 204 yields ok', async () => {
    transport.respondWith(204, null);
    expect(await api.removeScene(VHARN.id, TORRE_SCENE.id)).toEqual({ ok: true, value: null });
    expect(transport.requests).toEqual([{ method: 'DELETE', path: TORRE, body: undefined }]);
  });

  it('createFolder posts the name and parent and yields the folder', async () => {
    transport.respondWith(201, CATACUMBAS);
    const input = { name: 'Catacumbas', parentId: ATO_1.id };
    expect(await api.createFolder(VHARN.id, input)).toEqual({ ok: true, value: CATACUMBAS });
    expect(transport.requests).toEqual([{ method: 'POST', path: FOLDERS, body: input }]);
  });

  it('updateFolder patches the folder (parentId null takes it to the root)', async () => {
    transport.respondWith(200, { ...CATACUMBAS, parentId: null });
    const result = await api.updateFolder(VHARN.id, CATACUMBAS.id, { parentId: null });
    expect(result).toEqual({ ok: true, value: { ...CATACUMBAS, parentId: null } });
    expect(transport.requests).toEqual([
      { method: 'PATCH', path: CATACUMBAS_PATH, body: { parentId: null } },
    ]);
  });

  it('removeFolder deletes the folder and a 204 yields ok', async () => {
    transport.respondWith(204, null);
    expect(await api.removeFolder(VHARN.id, CATACUMBAS.id)).toEqual({ ok: true, value: null });
    expect(transport.requests).toEqual([
      { method: 'DELETE', path: CATACUMBAS_PATH, body: undefined },
    ]);
  });

  it.each([
    [409, 'SCENE_IS_ACTIVE', 'scene_is_active'],
    [409, 'FOLDER_CYCLE', 'folder_cycle'],
    [422, 'FOLDER_TOO_DEEP', 'folder_too_deep'],
    [404, 'FOLDER_NOT_FOUND', 'folder_not_found'],
    [404, 'SCENE_NOT_FOUND', 'not_found'],
    [404, 'CAMPAIGN_NOT_FOUND', 'not_found'],
    [403, 'FORBIDDEN', 'forbidden'],
    [400, 'INVALID_BODY', 'invalid'],
    [401, 'UNAUTHENTICATED', 'unauthenticated'],
    [409, 'SOMETHING_ELSE', 'unexpected'],
    [500, 'INTERNAL_ERROR', 'unexpected'],
  ])('a %s with %s is the %s failure', async (status, code, kind) => {
    transport.respondWith(status, apiError(code));
    expect(await api.removeScene(VHARN.id, TORRE_SCENE.id)).toEqual({
      ok: false,
      failure: { kind },
    });
  });

  it('a network failure is offline', async () => {
    transport.failWithNetworkDown();
    expect(await api.list(VHARN.id)).toEqual({ ok: false, failure: { kind: 'offline' } });
  });

  it('a 200 body outside the DTO is unexpected', async () => {
    transport.respondWith(200, { ...vharnLibrary(), scenes: [{ id: TORRE_SCENE.id }] });
    expect(await api.list(VHARN.id)).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it('ids go into the path encoded, never as raw text', async () => {
    transport.respondWith(204, null);
    await api.removeScene('a/b', '../x');
    expect(transport.requests[0]?.path).toBe('/campaigns/a%2Fb/scenes/..%2Fx');
  });
});
