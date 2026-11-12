import { apiErrorDto, savedColorsResponseDto } from '@lorkarium/contracts';
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { setAccountPlan } from '../support/account-plans';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

// A saved color is a customization: the accounts get a plan that has it (free: the plan's spec).
beforeEach(async () => {
  await setAccountPlan(live.connection.db, live.bia.id, 'amigo_do_dono');
  await setAccountPlan(live.connection.db, live.caio.id, 'amigo_do_dono');
});
const COLORS_URL = '/api/account/saved-colors';
const LIMIT = 24;

function post(user: SignedInUser | null, payload: object) {
  return live.http(user, { method: 'POST', url: COLORS_URL, payload });
}

function remove(user: SignedInUser | null, digits: string) {
  return live.http(user, { method: 'DELETE', url: `${COLORS_URL}/${digits}` });
}

function colorNumbered(index: number): string {
  return `#0000${index.toString(16).padStart(2, '0')}`;
}

function colorsIn(response: { json: () => unknown }): string[] {
  return savedColorsResponseDto.parse(response.json()).colors;
}

async function listOf(user: SignedInUser | null): Promise<string[]> {
  return colorsIn(await live.http(user, { method: 'GET', url: COLORS_URL }));
}

async function fillUp(user: SignedInUser, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const response = await post(user, { color: colorNumbered(index) });
    if (response.statusCode !== 200) throw new Error(`save answered ${response.body}`);
  }
}

async function rowCountOf(user: SignedInUser): Promise<number> {
  const counted = await live.connection.db.execute(
    sql`SELECT count(*)::int AS total FROM account_saved_colors WHERE user_id = ${user.id}`,
  );
  return (counted.rows[0] as { total: number }).total;
}

describe('the saved colors over HTTP', () => {
  it('GET on an account with no colors answers an empty list', async () => {
    const response = await live.http(live.bia, { method: 'GET', url: COLORS_URL });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ colors: [] });
  });

  it("POST '#FFAA00' keeps '#ffaa00' and answers the list", async () => {
    const response = await post(live.bia, { color: '#FFAA00' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ colors: ['#ffaa00'] });
    expect(await listOf(live.bia)).toEqual(['#ffaa00']);
  });

  it('the most recent color comes first', async () => {
    await post(live.bia, { color: '#aabbcc' });

    const response = await post(live.bia, { color: '#336699' });

    expect(colorsIn(response)).toEqual(['#336699', '#aabbcc']);
  });

  it('saving a color again answers 200 with the same list, in the same order', async () => {
    await post(live.bia, { color: '#aabbcc' });
    await post(live.bia, { color: '#336699' });

    const response = await post(live.bia, { color: '#aabbcc' });

    expect(response.statusCode).toBe(200);
    expect(colorsIn(response)).toEqual(['#336699', '#aabbcc']);
  });

  it('the 25th color is 409 SAVED_COLORS_LIMIT and the list stays intact', async () => {
    await fillUp(live.bia, LIMIT);
    const before = await listOf(live.bia);

    const response = await post(live.bia, { color: '#ffffff' });

    expect(response.statusCode).toBe(409);
    expect(apiErrorDto.parse(response.json()).code).toBe('SAVED_COLORS_LIMIT');
    expect(await listOf(live.bia)).toEqual(before);
  });

  it('at the limit, saving a color already kept still answers 200', async () => {
    await fillUp(live.bia, LIMIT);

    const response = await post(live.bia, { color: colorNumbered(3) });

    expect(response.statusCode).toBe(200);
    expect(colorsIn(response)).toHaveLength(LIMIT);
  });

  it('30 POST at once keep exactly 24 rows, and the other 6 are 409', async () => {
    const saves = Array.from({ length: 30 }, (_, index) =>
      post(live.bia, { color: colorNumbered(index) }),
    );

    const responses = await Promise.all(saves);

    const statuses = responses.map((response) => response.statusCode);
    expect(statuses.filter((status) => status === 200)).toHaveLength(LIMIT);
    expect(statuses.filter((status) => status === 409)).toHaveLength(6);
    expect(await rowCountOf(live.bia)).toBe(LIMIT);
  });

  it('DELETE takes the color off and answers the rest', async () => {
    await post(live.bia, { color: '#aabbcc' });
    await post(live.bia, { color: '#336699' });

    const response = await remove(live.bia, 'aabbcc');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ colors: ['#336699'] });
  });

  it('DELETE of a color the account does not keep answers 200 with the same list', async () => {
    await post(live.bia, { color: '#336699' });

    const response = await remove(live.bia, 'aabbcc');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ colors: ['#336699'] });
  });

  it('deleting one color at the limit opens room for a new one', async () => {
    await fillUp(live.bia, LIMIT);
    await remove(live.bia, colorNumbered(0).slice(1));

    const response = await post(live.bia, { color: '#ffffff' });

    expect(response.statusCode).toBe(200);
    expect(colorsIn(response)[0]).toBe('#ffffff');
  });

  it('without a session the three routes are 401', async () => {
    const responses = [
      await live.http(null, { method: 'GET', url: COLORS_URL }),
      await post(null, { color: '#aabbcc' }),
      await remove(null, 'aabbcc'),
    ];

    expect(responses.map((response) => response.statusCode)).toEqual([401, 401, 401]);
  });

  it.each([
    ['a short hex', { color: '#fff' }],
    ['a css function', { color: 'url(x)' }],
    ['a palette name', { color: 'gold' }],
    ['no color', {}],
  ])('POST with %s is 400 INVALID_BODY and keeps nothing', async (_label, payload) => {
    const response = await post(live.bia, payload);

    expect(response.statusCode).toBe(400);
    expect(apiErrorDto.parse(response.json()).code).toBe('INVALID_BODY');
    expect(await listOf(live.bia)).toEqual([]);
  });

  it('a userId in the body is 400 and nothing reaches the account it names', async () => {
    const response = await post(live.bia, { color: '#aabbcc', userId: live.caio.id });

    expect(response.statusCode).toBe(400);
    expect(apiErrorDto.parse(response.json()).code).toBe('INVALID_BODY');
    expect(await listOf(live.caio)).toEqual([]);
  });

  it.each(['xyz123', '%23aabbcc', 'abc'])('DELETE of %s is 400 INVALID_BODY', async (digits) => {
    const response = await remove(live.bia, digits);

    expect(response.statusCode).toBe(400);
    expect(apiErrorDto.parse(response.json()).code).toBe('INVALID_BODY');
  });

  it('the 31st POST in the minute is 429 RATE_LIMITED, telling when to retry', async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) await post(live.bia, { color: '#aabbcc' });

    const response = await post(live.bia, { color: '#aabbcc' });

    expect(response.statusCode).toBe(429);
    const error = apiErrorDto.parse(response.json());
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('POST and DELETE share the 30 writes of the minute, and each person has their own', async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) await post(live.bia, { color: '#aabbcc' });

    expect((await remove(live.bia, 'aabbcc')).statusCode).toBe(429);
    expect((await remove(live.caio, 'aabbcc')).statusCode).toBe(200);
  });

  it('reading is not counted among the writes', async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) await post(live.bia, { color: '#aabbcc' });

    expect(await listOf(live.bia)).toEqual(['#aabbcc']);
  });

  it('Caio does not read the list of Bia', async () => {
    await post(live.bia, { color: '#aabbcc' });

    expect(await listOf(live.caio)).toEqual([]);
  });

  it('Caio does not delete from the list of Bia, even asking for her color', async () => {
    await post(live.bia, { color: '#aabbcc' });

    await remove(live.caio, 'aabbcc');

    expect(await listOf(live.bia)).toEqual(['#aabbcc']);
  });
});
