import { profileCardResponseDto, profileResponseDto } from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { users } from '../../src/modules/auth/users.po';
import { badges, userBadges } from '../../src/modules/badges/badges.po';
import { userBlocks } from '../../src/modules/friends/user-blocks.po';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

const LOOKUPS_PER_MINUTE = 30;
const VETERANO_IMAGE = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';
const MESTRE_IMAGE = '8d7c6b5a-4f3e-4d2c-8b1a-0f9e8d7c6b5a';

function lookUp(user: SignedInUser | null, username: string) {
  const url = `/api/users/by-username/${encodeURIComponent(username)}/card`;
  return live.http(user, { method: 'GET', url });
}

async function cardByName(user: SignedInUser, username: string) {
  const response = await lookUp(user, username);
  expect(response.statusCode).toBe(200);
  return profileCardResponseDto.parse(response.json()).card;
}

// Mestre comes first in the catalog; a badge without an image never shows.
async function grantToCaio(): Promise<void> {
  const rows = await live.connection.db
    .insert(badges)
    .values([
      { name: 'Veterano', description: 'Jogou 100 sessões', imageId: VETERANO_IMAGE, position: 1 },
      { name: 'Mestre', description: 'Mestrou 10 mesas', imageId: MESTRE_IMAGE, position: 0 },
      { name: 'Rascunho', description: 'Sem imagem', imageId: null, position: 2 },
    ])
    .returning({ id: badges.id });
  const grants = rows.map(({ id }) => ({ userId: live.caio.id, badgeId: id }));
  await live.connection.db.insert(userBadges).values(grants);
}

describe('finding a card by the @ over HTTP', () => {
  it('the @ in any case, with or without "@", answers the card with the reader relation', async () => {
    for (const typed of ['Caio', '@caio', 'CAIO']) {
      expect(await cardByName(live.bia, typed)).toMatchObject({
        id: live.caio.id,
        username: 'caio',
        relation: 'none',
      });
    }
  });

  it("reading one's own @ is self", async () => {
    expect((await cardByName(live.caio, 'caio')).relation).toBe('self');
  });

  it('who blocked the reader is found with relation none', async () => {
    await live.connection.db.insert(userBlocks).values({
      blockerId: live.caio.id,
      blockedId: live.bia.id,
    });

    expect((await cardByName(live.bia, 'caio')).relation).toBe('none');
  });

  it('an unknown @ and a suspended account answer the very same 404', async () => {
    await live.connection.db
      .update(users)
      .set({ suspendedAt: new Date() })
      .where(eq(users.id, live.caio.id));

    const suspended = await lookUp(live.bia, 'caio');
    const unknown = await lookUp(live.bia, 'naoexiste');

    expect([suspended.statusCode, suspended.json()]).toEqual([unknown.statusCode, unknown.json()]);
    expect([unknown.statusCode, unknown.json().code]).toEqual([404, 'PROFILE_NOT_FOUND']);
  });

  it('an e-mail or a text outside the @ format is 400, never a lookup', async () => {
    for (const typed of ['caio@lorkarium.dev', 'b']) {
      const response = await lookUp(live.bia, typed);
      expect([response.statusCode, response.json().code]).toEqual([400, 'INVALID_BODY']);
    }
  });

  it('without a session it is 401', async () => {
    expect((await lookUp(null, 'caio')).statusCode).toBe(401);
  });

  it('the 31st lookup in a minute is 429 with retryAfterSeconds', async () => {
    for (let index = 0; index < LOOKUPS_PER_MINUTE; index += 1) {
      expect((await lookUp(live.bia, 'naoexiste')).statusCode).toBe(404);
    }

    const limited = await lookUp(live.bia, 'caio');

    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ code: 'RATE_LIMITED' });
    expect(limited.json().retryAfterSeconds).toBeGreaterThan(0);
  });

  it('the answer never carries the e-mail nor the password hash', async () => {
    const body = (await lookUp(live.bia, 'caio')).body;

    expect(body).not.toMatch(/@lorkarium|@mesa|email|password|hash/i);
  });
});

describe('badges on the card and on the own profile', () => {
  it('the card shows the badges with an image, in catalog order', async () => {
    await grantToCaio();

    const card = await cardByName(live.bia, 'caio');
    const byId = await live.http(live.bia, {
      method: 'GET',
      url: `/api/users/${live.caio.id}/card`,
    });

    expect(card.badges.map((badge) => [badge.name, badge.imageId])).toEqual([
      ['Mestre', MESTRE_IMAGE],
      ['Veterano', VETERANO_IMAGE],
    ]);
    expect(profileCardResponseDto.parse(byId.json()).card.badges).toEqual(card.badges);
  });

  it('GET /account/profile carries the own badges; an account without any reads []', async () => {
    await grantToCaio();

    const caio = await live.http(live.caio, { method: 'GET', url: '/api/account/profile' });
    const bia = await live.http(live.bia, { method: 'GET', url: '/api/account/profile' });

    const names = profileResponseDto.parse(caio.json()).profile.badges.map((badge) => badge.name);
    expect(names).toEqual(['Mestre', 'Veterano']);
    expect(profileResponseDto.parse(bia.json()).profile.badges).toEqual([]);
    expect((await cardByName(live.caio, 'bia')).badges).toEqual([]);
  });
});
