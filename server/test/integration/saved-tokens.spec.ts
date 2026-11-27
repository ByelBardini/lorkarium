import {
  apiErrorDto,
  savedTokenDto,
  savedTokenFolderDto,
  savedTokenFoldersResponseDto,
  savedTokensResponseDto,
  type SavedTokenDto,
} from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { assets } from '../../src/modules/assets/assets.po';
import { SavedTokensDao } from '../../src/modules/saved-tokens/saved-tokens.dao';
import { setAccountPlan } from '../support/account-plans';
import { newAssetPo } from '../support/assets-factories';
import { savedTokenPo } from '../support/saved-tokens-factories';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { useTokenTable } from '../support/token-table';

// Ana owns Vharn (Bia and Caio play there); Caio owns Quelm.
const live = useTokenTable();
// The technical ceilings (50 tokens, 20 folders) are of a table without plan limit; the plan's
// own ceilings are in saved-tokens-plan-limit.spec.ts.
beforeEach(() => setAccountPlan(live.connection.db, live.ana.id, 'amigo_do_dono'));

const ZOMBIE = {
  name: 'Zumbi',
  initials: 'ZB',
  side: 'enemy',
  width: 1,
  height: 1,
  aura: { kind: 'color', radius: 1, opacity: 60, color: '#22aa44' },
  bars: [{ label: 'PV', current: 12, max: 12, color: '#cc2222', visibility: 'everyone' }],
};

function tokensUrl(table: Table = live.vharn): string {
  return `/api/campaigns/${table.id}/saved-tokens`;
}

function foldersUrl(table: Table = live.vharn): string {
  return `/api/campaigns/${table.id}/saved-token-folders`;
}

function post(user: SignedInUser | null, payload: object, table: Table = live.vharn) {
  return live.http(user, { method: 'POST', url: tokensUrl(table), payload });
}

function patch(user: SignedInUser, savedTokenId: string, payload: object) {
  return live.http(user, { method: 'PATCH', url: `${tokensUrl()}/${savedTokenId}`, payload });
}

function remove(user: SignedInUser, savedTokenId: string) {
  return live.http(user, { method: 'DELETE', url: `${tokensUrl()}/${savedTokenId}` });
}

async function listOf(user: SignedInUser, table: Table = live.vharn): Promise<SavedTokenDto[]> {
  const response = await live.http(user, { method: 'GET', url: tokensUrl(table) });
  return savedTokensResponseDto.parse(response.json()).savedTokens;
}

async function saved(user: SignedInUser, name: string, token: object = ZOMBIE) {
  const response = await post(user, { name, token });
  if (response.statusCode !== 201) throw new Error(`save answered ${response.body}`);
  return savedTokenDto.parse(response.json());
}

async function imageOf(table: Table): Promise<string> {
  const [row] = await live.connection.db
    .insert(assets)
    .values(newAssetPo({ campaignId: table.id }))
    .returning();
  if (!row) throw new Error('no asset');
  return row.id;
}

function errorOf(response: { json: () => unknown }) {
  return apiErrorDto.parse(response.json());
}

describe('the saved tokens over HTTP', () => {
  it('Bia saves the Zumbi with a portrait and a form: 201 with the token as sent', async () => {
    const portrait = await imageOf(live.vharn);
    const forms = [{ name: 'Podre', imageAssetId: portrait, width: 2, height: 2, frame: 'round' }];
    const token = { ...ZOMBIE, imageAssetId: portrait, forms, activeForm: 0 };

    const response = await post(live.bia, { name: ' Zumbi ', token });

    expect(response.statusCode).toBe(201);
    const body = savedTokenDto.parse(response.json());
    expect(body).toMatchObject({ name: 'Zumbi', folderId: null, planLocked: false });
    expect(body.token).toMatchObject({ imageAssetId: portrait, activeForm: 0, layer: 'tokens' });
    expect(body.token.forms).toEqual(forms);
    expect(body.token.aura).toEqual(ZOMBIE.aura);
  });

  it('GET brings only the saved tokens of Bia at Vharn, oldest first', async () => {
    const zombie = await saved(live.bia, 'Zumbi');
    const skeleton = await saved(live.bia, 'Esqueleto');
    await saved(live.caio, 'Do Caio');

    expect((await listOf(live.bia)).map((entry) => entry.id)).toEqual([zombie.id, skeleton.id]);
    expect((await listOf(live.caio)).map((entry) => entry.name)).toEqual(['Do Caio']);
  });

  it('the list of Caio at Quelm does not bring his saved tokens of Vharn (critério 14)', async () => {
    await setAccountPlan(live.connection.db, live.caio.id, 'amigo_do_dono');
    await saved(live.caio, 'Zumbi');
    const atQuelm = await post(live.caio, { name: 'Lobo', token: ZOMBIE }, live.quelm);

    expect(atQuelm.statusCode).toBe(201);
    expect((await listOf(live.caio, live.quelm)).map((entry) => entry.name)).toEqual(['Lobo']);
    expect((await listOf(live.caio)).map((entry) => entry.name)).toEqual(['Zumbi']);
  });

  it('Bia renames, replaces the token and moves it to a folder: 200 and GET has it', async () => {
    const zombie = await saved(live.bia, 'Zumbi');
    const folder = await live.http(live.bia, {
      method: 'POST',
      url: foldersUrl(),
      payload: { name: 'Mortos' },
    });
    const folderId = savedTokenFolderDto.parse(folder.json()).id;

    const response = await patch(live.bia, zombie.id, {
      name: 'Zumbi grande',
      folderId,
      token: { ...ZOMBIE, width: 2, height: 2 },
    });

    expect(response.statusCode).toBe(200);
    const [listed] = await listOf(live.bia);
    expect(listed).toMatchObject({ name: 'Zumbi grande', folderId });
    expect(listed?.token).toMatchObject({ width: 2, height: 2 });
  });

  it('Caio PATCH and DELETE on the Zumbi of Bia are 404 SAVED_TOKEN_NOT_FOUND and it stays', async () => {
    const zombie = await saved(live.bia, 'Zumbi');

    const renamed = await patch(live.caio, zombie.id, { name: 'Meu' });
    const deleted = await remove(live.caio, zombie.id);

    expect([renamed.statusCode, deleted.statusCode]).toEqual([404, 404]);
    expect(errorOf(renamed).code).toBe('SAVED_TOKEN_NOT_FOUND');
    expect((await listOf(live.bia)).map((entry) => entry.name)).toEqual(['Zumbi']);
  });

  it('Bia deletes the Zumbi: 204 and GET is empty; a malformed id is 404', async () => {
    const zombie = await saved(live.bia, 'Zumbi');

    expect((await remove(live.bia, zombie.id)).statusCode).toBe(204);
    expect(await listOf(live.bia)).toEqual([]);
    expect(errorOf(await remove(live.bia, 'not-a-uuid')).code).toBe('SAVED_TOKEN_NOT_FOUND');
  });

  it('a portrait of Quelm on a saved token of Vharn is 404 ASSET_NOT_FOUND', async () => {
    const foreign = await imageOf(live.quelm);

    const response = await post(live.bia, {
      name: 'Zumbi',
      token: { ...ZOMBIE, imageAssetId: foreign },
    });

    expect(response.statusCode).toBe(404);
    expect(errorOf(response).code).toBe('ASSET_NOT_FOUND');
  });

  it('Duda, a spectator, POST and GET are 403 FORBIDDEN', async () => {
    const duda = await live.signUp('Duda');
    await live.joinAsSpectator(duda, live.vharn);

    const created = await post(duda, { name: 'Zumbi', token: ZOMBIE });
    const listed = await live.http(duda, { method: 'GET', url: tokensUrl() });

    expect([created.statusCode, listed.statusCode]).toEqual([403, 403]);
  });

  it('Ana on Quelm, where she is not a member, is 404 CAMPAIGN_NOT_FOUND', async () => {
    const response = await post(live.ana, { name: 'Zumbi', token: ZOMBIE }, live.quelm);

    expect(response.statusCode).toBe(404);
    expect(errorOf(response).code).toBe('CAMPAIGN_NOT_FOUND');
  });

  it.each([
    [
      'a userId in the body',
      { name: 'Zumbi', token: ZOMBIE, userId: '00000000-0000-4000-8000-000000000000' },
    ],
    ['a place on the token', { name: 'Zumbi', token: { ...ZOMBIE, col: 3 } }],
    ['no name', { token: ZOMBIE }],
  ])('%s is 400 INVALID_BODY', async (_case, payload) => {
    const response = await post(live.bia, payload);

    expect(response.statusCode).toBe(400);
    expect(errorOf(response).code).toBe('INVALID_BODY');
  });

  it('an empty PATCH is 400 INVALID_BODY; without a session it is 401', async () => {
    const zombie = await saved(live.bia, 'Zumbi');

    expect((await patch(live.bia, zombie.id, {})).statusCode).toBe(400);
    expect((await post(null, { name: 'Zumbi', token: ZOMBIE })).statusCode).toBe(401);
  });

  it('with 50 kept, the 51st is 422 SAVED_TOKENS_LIMIT', async () => {
    const dao = new SavedTokensDao(live.connection.db);
    const owner = { campaignId: live.vharn.id, userId: live.bia.id };
    for (let index = 0; index < 50; index += 1) await dao.insert(savedTokenPo(owner), []);

    const response = await post(live.bia, { name: 'Zumbi 51', token: ZOMBIE });

    expect(response.statusCode).toBe(422);
    expect(errorOf(response)).toMatchObject({
      code: 'SAVED_TOKENS_LIMIT',
      message: 'You already keep 50 saved tokens at this table',
    });
  });

  it('the 31st write in the minute (POST, PATCH and DELETE summed) is 429 with retryAfterSeconds', async () => {
    const zombie = await saved(live.bia, 'Zumbi');
    for (let index = 0; index < 14; index += 1)
      await patch(live.bia, zombie.id, { name: `Z${index}` });
    for (let index = 0; index < 15; index += 1) await post(live.bia, { name: 'Z', token: ZOMBIE });

    const response = await remove(live.bia, zombie.id);

    expect(response.statusCode).toBe(429);
    expect(errorOf(response)).toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterSeconds: expect.any(Number),
    });
  });
});

describe('the saved token folders over HTTP', () => {
  function postFolder(user: SignedInUser, name: string) {
    return live.http(user, { method: 'POST', url: foldersUrl(), payload: { name } });
  }

  it('deleting a folder keeps its tokens out of any folder', async () => {
    const folder = savedTokenFolderDto.parse((await postFolder(live.bia, 'Mortos')).json());
    const zombie = await saved(live.bia, 'Zumbi');
    await patch(live.bia, zombie.id, { folderId: folder.id });

    const deleted = await live.http(live.bia, {
      method: 'DELETE',
      url: `${foldersUrl()}/${folder.id}`,
    });

    expect(deleted.statusCode).toBe(204);
    expect((await listOf(live.bia))[0]?.folderId).toBeNull();
  });

  it('a folder of Bia does not exist for Caio: not listed, not usable, not renamable', async () => {
    const folder = savedTokenFolderDto.parse((await postFolder(live.bia, 'Mortos')).json());

    const listed = await live.http(live.caio, { method: 'GET', url: foldersUrl() });
    const used = await post(live.caio, { name: 'Zumbi', folderId: folder.id, token: ZOMBIE });
    const renamed = await live.http(live.caio, {
      method: 'PATCH',
      url: `${foldersUrl()}/${folder.id}`,
      payload: { name: 'Meu' },
    });

    expect(savedTokenFoldersResponseDto.parse(listed.json()).folders).toEqual([]);
    expect(errorOf(used).code).toBe('SAVED_TOKEN_FOLDER_NOT_FOUND');
    expect(renamed.statusCode).toBe(404);
  });

  it('a repeated folder name is 409 SAVED_TOKEN_FOLDER_NAME_TAKEN', async () => {
    await postFolder(live.bia, 'Mortos-vivos');

    const again = await postFolder(live.bia, ' MÓRTOS-VIVOS ');

    expect(again.statusCode).toBe(409);
    expect(errorOf(again).code).toBe('SAVED_TOKEN_FOLDER_NAME_TAKEN');
  });
});
