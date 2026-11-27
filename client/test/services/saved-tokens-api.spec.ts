import { beforeEach, describe, expect, it } from 'vitest';
import { HttpSavedTokensApi } from '@/services/saved-tokens-api';
import { VHARN } from '../support/campaigns-api-fake';
import { HttpTransportFake } from '../support/http-transport-fake';
import { MORTOS_ID, ZOMBIE_ID, skeletonSaved, zombieSaved } from '../support/saved-token-fixtures';

const SAVED_TOKENS = `/campaigns/${VHARN.id}/saved-tokens`;
const ZOMBIE_PATH = `${SAVED_TOKENS}/${ZOMBIE_ID}`;
const FOLDERS = `/campaigns/${VHARN.id}/saved-token-folders`;

function apiError(code: string, extra: object = {}) {
  return { code, message: 'x', ...extra };
}

describe('HttpSavedTokensApi', () => {
  let transport: HttpTransportFake;
  let api: HttpSavedTokensApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpSavedTokensApi(transport);
  });

  it('list gets the saved tokens of the table and yields them in order', async () => {
    transport.respondWith(200, { savedTokens: [zombieSaved(), skeletonSaved()] });

    expect(await api.list(VHARN.id)).toEqual({ ok: true, value: [zombieSaved(), skeletonSaved()] });
    expect(transport.requests).toEqual([{ method: 'GET', path: SAVED_TOKENS, body: undefined }]);
  });

  it('create posts the name and the token and yields the new saved token', async () => {
    transport.respondWith(201, zombieSaved());
    const input = { name: 'Zumbi', token: zombieSaved().token };

    expect(await api.create(VHARN.id, input)).toEqual({ ok: true, value: zombieSaved() });
    expect(transport.requests).toEqual([{ method: 'POST', path: SAVED_TOKENS, body: input }]);
  });

  it('update patches that saved token with the changes alone', async () => {
    const moved = zombieSaved({ folderId: MORTOS_ID });
    transport.respondWith(200, moved);

    expect(await api.update(VHARN.id, ZOMBIE_ID, { folderId: MORTOS_ID })).toEqual({
      ok: true,
      value: moved,
    });
    expect(transport.requests[0]).toEqual({
      method: 'PATCH',
      path: ZOMBIE_PATH,
      body: { folderId: MORTOS_ID },
    });
  });

  it('remove deletes that saved token and a 204 yields ok', async () => {
    transport.respondWith(204, null);

    expect(await api.remove(VHARN.id, ZOMBIE_ID)).toEqual({ ok: true, value: null });
    expect(transport.requests[0]).toMatchObject({ method: 'DELETE', path: ZOMBIE_PATH });
  });

  it('the folders: list, create, rename and remove at their own path', async () => {
    const mortos = { id: MORTOS_ID, name: 'Mortos-vivos' };
    transport.respondWith(200, { folders: [mortos] }).respondWith(201, mortos);
    transport.respondWith(200, { ...mortos, name: 'Mortos' }).respondWith(204, null);

    expect(await api.listFolders(VHARN.id)).toEqual({ ok: true, value: [mortos] });
    expect(await api.createFolder(VHARN.id, 'Mortos-vivos')).toEqual({ ok: true, value: mortos });
    await api.renameFolder(VHARN.id, MORTOS_ID, 'Mortos');
    await api.removeFolder(VHARN.id, MORTOS_ID);

    expect(transport.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      `GET ${FOLDERS}`,
      `POST ${FOLDERS}`,
      `PATCH ${FOLDERS}/${MORTOS_ID}`,
      `DELETE ${FOLDERS}/${MORTOS_ID}`,
    ]);
  });

  it.each([
    [422, 'SAVED_TOKENS_LIMIT', 'limit'],
    [409, 'SAVED_TOKEN_FOLDER_NAME_TAKEN', 'folder_name_taken'],
    [422, 'SAVED_TOKEN_FOLDERS_LIMIT', 'folder_limit'],
    [404, 'SAVED_TOKEN_FOLDER_NOT_FOUND', 'folder_not_found'],
    [404, 'ASSET_NOT_FOUND', 'image_not_found'],
    [404, 'SAVED_TOKEN_NOT_FOUND', 'not_found'],
    [403, 'FORBIDDEN', 'forbidden'],
    [400, 'INVALID_BODY', 'invalid'],
    [401, 'UNAUTHENTICATED', 'unauthenticated'],
    [500, 'INTERNAL_ERROR', 'unexpected'],
  ])('a %i %s answers %s', async (status, code, kind) => {
    transport.respondWith(status, apiError(code));

    expect(await api.create(VHARN.id, { name: 'Zumbi', token: zombieSaved().token })).toEqual({
      ok: false,
      failure: { kind },
    });
  });

  it('a 403 PLAN_LIMIT answers plan_limit with the resource and the holder', async () => {
    const planLimit = { resource: 'savedTokens', limit: 5, plan: 'apoiador', holder: 'account' };
    transport.respondWith(403, apiError('PLAN_LIMIT', { planLimit }));

    const result = await api.create(VHARN.id, { name: 'Zumbi', token: zombieSaved().token });

    expect(result).toMatchObject({ ok: false, failure: { kind: 'plan_limit' } });
  });

  it('a 429 answers rate_limited with the seconds of Retry-After', async () => {
    transport.respondWith(429, apiError('RATE_LIMITED'), { 'retry-after': '12' });

    expect(await api.remove(VHARN.id, ZOMBIE_ID)).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 12 },
    });
  });

  it('a network down answers offline, and a body outside the DTO unexpected', async () => {
    transport.failWithNetworkDown();
    transport.respondWith(200, { savedTokens: [{ ...zombieSaved(), id: 'not-a-uuid' }] });

    expect(await api.list(VHARN.id)).toEqual({ ok: false, failure: { kind: 'offline' } });
    expect(await api.list(VHARN.id)).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });
});
