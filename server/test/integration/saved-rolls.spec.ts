import {
  apiErrorDto,
  savedRollDto,
  savedRollNameKey,
  savedRollsResponseDto,
  type SavedRollDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { SavedRollsDao } from '../../src/modules/saved-rolls/saved-rolls.dao';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
const ATTACK = [{ label: null, expression: '1d20+5' }];

function rollsUrl(table: Table = live.vharn): string {
  return `/api/campaigns/${table.id}/saved-rolls`;
}

function post(user: SignedInUser | null, payload: object, table: Table = live.vharn) {
  return live.http(user, { method: 'POST', url: rollsUrl(table), payload });
}

function patch(user: SignedInUser, savedRollId: string, payload: object) {
  return live.http(user, { method: 'PATCH', url: `${rollsUrl()}/${savedRollId}`, payload });
}

function remove(user: SignedInUser, savedRollId: string) {
  return live.http(user, { method: 'DELETE', url: `${rollsUrl()}/${savedRollId}` });
}

async function listOf(user: SignedInUser): Promise<SavedRollDto[]> {
  const response = await live.http(user, { method: 'GET', url: rollsUrl() });
  return savedRollsResponseDto.parse(response.json()).savedRolls;
}

async function saved(user: SignedInUser, name: string): Promise<SavedRollDto> {
  const response = await post(user, { name, parts: ATTACK });
  if (response.statusCode !== 201) throw new Error(`save answered ${response.body}`);
  return savedRollDto.parse(response.json());
}

function errorOf(response: { json: () => unknown }) {
  return apiErrorDto.parse(response.json());
}

async function spectatorDuda(): Promise<SignedInUser> {
  const duda = await live.signUp('Duda');
  await live.joinAsSpectator(duda, live.vharn);
  return duda;
}

describe('the saved rolls over HTTP', () => {
  it('Bia saves "Acerto": 201 with the roll, trimmed', async () => {
    const response = await post(live.bia, {
      name: ' Acerto ',
      parts: [{ label: ' Espada ', expression: ' 1d20+5 ' }],
    });

    expect(response.statusCode).toBe(201);
    expect(savedRollDto.parse(response.json())).toEqual({
      id: expect.any(String),
      name: 'Acerto',
      parts: [{ label: 'Espada', expression: '1d20+5' }],
    });
  });

  it('GET brings only the rolls of Bia, oldest first', async () => {
    const acerto = await saved(live.bia, 'Acerto');
    const bencao = await saved(live.bia, 'Bênção');
    await saved(live.caio, 'Do Caio');

    expect((await listOf(live.bia)).map((roll) => roll.id)).toEqual([acerto.id, bencao.id]);
  });

  it('Caio does not see the rolls of Bia', async () => {
    await saved(live.bia, 'Acerto');

    expect(await listOf(live.caio)).toEqual([]);
  });

  it('Bia renames and changes the pieces: 200 with the roll, and GET has it', async () => {
    const acerto = await saved(live.bia, 'Acerto');
    const parts = [{ label: null, expression: '1d20+7' }];

    const response = await patch(live.bia, acerto.id, { name: 'Acerto com espada', parts });

    expect(response.statusCode).toBe(200);
    expect(await listOf(live.bia)).toEqual([{ id: acerto.id, name: 'Acerto com espada', parts }]);
  });

  it('Bia deletes "Acerto": 204 and GET is empty', async () => {
    const acerto = await saved(live.bia, 'Acerto');

    expect((await remove(live.bia, acerto.id)).statusCode).toBe(204);
    expect(await listOf(live.bia)).toEqual([]);
  });

  it('Caio PATCH and DELETE on the roll of Bia are 404 SAVED_ROLL_NOT_FOUND and it stays', async () => {
    const acerto = await saved(live.bia, 'Acerto');

    const patched = await patch(live.caio, acerto.id, { name: 'Meu' });
    const deleted = await remove(live.caio, acerto.id);

    expect([patched.statusCode, deleted.statusCode]).toEqual([404, 404]);
    expect(errorOf(patched)).toEqual({
      code: 'SAVED_ROLL_NOT_FOUND',
      message: 'Saved roll not found',
    });
    expect((await listOf(live.bia)).map((roll) => roll.name)).toEqual(['Acerto']);
  });

  it('a malformed savedRollId is 404 SAVED_ROLL_NOT_FOUND', async () => {
    const response = await remove(live.bia, 'not-a-uuid');

    expect(response.statusCode).toBe(404);
    expect(errorOf(response).code).toBe('SAVED_ROLL_NOT_FOUND');
  });

  it('Duda, a spectator, POST and GET are 403 FORBIDDEN', async () => {
    const duda = await spectatorDuda();

    const posted = await post(duda, { name: 'Acerto', parts: ATTACK });
    const listed = await live.http(duda, { method: 'GET', url: rollsUrl() });

    expect([posted.statusCode, listed.statusCode]).toEqual([403, 403]);
    expect(errorOf(posted).code).toBe('FORBIDDEN');
  });

  it('Bia on the table of Quelm, where she is not a member, is 404 CAMPAIGN_NOT_FOUND (critério 14)', async () => {
    const response = await post(live.bia, { name: 'Acerto', parts: ATTACK }, live.quelm);

    expect(response.statusCode).toBe(404);
    expect(errorOf(response)).toEqual({
      code: 'CAMPAIGN_NOT_FOUND',
      message: 'Campaign not found',
    });
  });

  it('"ACÉRTO" after "Acerto" is 409 SAVED_ROLL_NAME_TAKEN; Caio may use the name', async () => {
    await saved(live.bia, 'Acerto');

    const again = await post(live.bia, { name: 'ACÉRTO', parts: ATTACK });

    expect(again.statusCode).toBe(409);
    expect(errorOf(again).code).toBe('SAVED_ROLL_NAME_TAKEN');
    expect((await post(live.caio, { name: 'ACÉRTO', parts: ATTACK })).statusCode).toBe(201);
  });

  it('with 50 kept, the 51st is 422 SAVED_ROLLS_LIMIT', async () => {
    const rolls = new SavedRollsDao(live.connection.db);
    for (let index = 1; index <= 50; index += 1) {
      const name = `Rolagem ${index}`;
      const row = { name, nameKey: savedRollNameKey(name), parts: ATTACK };
      await rolls.insert({ campaignId: live.vharn.id, userId: live.bia.id, ...row });
    }

    const response = await post(live.bia, { name: 'Mais uma', parts: ATTACK });

    expect(response.statusCode).toBe(422);
    expect(errorOf(response).code).toBe('SAVED_ROLLS_LIMIT');
  });

  it('"2d" is 400 INVALID_DICE_EXPRESSION citing piece 2 and the reason', async () => {
    const parts = [...ATTACK, { label: null, expression: '2d' }];

    const response = await post(live.bia, { name: 'Quebrada', parts });

    expect(response.statusCode).toBe(400);
    expect(errorOf(response)).toEqual({
      code: 'INVALID_DICE_EXPRESSION',
      message: expect.stringMatching(
        /^part 2 \("2d"\) cannot be read: Expected the number of sides/,
      ),
    });
  });

  it('an empty PATCH is 400 INVALID_BODY', async () => {
    const acerto = await saved(live.bia, 'Acerto');

    const response = await patch(live.bia, acerto.id, {});

    expect(response.statusCode).toBe(400);
    expect(errorOf(response).code).toBe('INVALID_BODY');
  });

  it('without a session it is 401', async () => {
    const response = await post(null, { name: 'Acerto', parts: ATTACK });

    expect(response.statusCode).toBe(401);
  });

  it('the 31st write in the minute (POST, PATCH and DELETE summed) is 429 with retryAfterSeconds', async () => {
    const acerto = await saved(live.bia, 'Acerto');
    for (let index = 1; index <= 28; index += 1) {
      await patch(live.bia, acerto.id, { name: `Acerto ${index}` });
    }
    expect((await remove(live.bia, acerto.id)).statusCode).toBe(204);

    const response = await post(live.bia, { name: 'Outra', parts: ATTACK });

    expect(response.statusCode).toBe(429);
    expect(errorOf(response)).toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterSeconds: expect.any(Number),
    });
    expect((await post(live.caio, { name: 'Do Caio', parts: ATTACK })).statusCode).toBe(201);
  });
});
