import { profileCardResponseDto } from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { users } from '../../src/modules/auth/users.po';
import { campaignMembers } from '../../src/modules/campaigns/campaign-members.po';
import { canonicalPair } from '../../src/modules/friends/friendships.dao';
import { friendships } from '../../src/modules/friends/friendships.po';
import { userBlocks } from '../../src/modules/friends/user-blocks.po';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const READS_PER_MINUTE = 60;

function readCard(user: SignedInUser | null, targetId: string) {
  return live.http(user, { method: 'GET', url: `/api/users/${targetId}/card` });
}

async function cardOf(user: SignedInUser, targetId: string) {
  const response = await readCard(user, targetId);
  expect(response.statusCode).toBe(200);
  return profileCardResponseDto.parse(response.json()).card;
}

function befriend(one: SignedInUser, other: SignedInUser) {
  return live.connection.db.insert(friendships).values(canonicalPair(one.id, other.id));
}

describe('reading another account card over HTTP', () => {
  it('any signed-in account reads it, with the stored stats and preferences', async () => {
    await live.connection.db
      .update(users)
      .set({ rollsCount: 12, natural20Count: 2, gameSystems: 'Tormenta' })
      .where(eq(users.id, live.caio.id));

    const card = await cardOf(live.ana, live.caio.id);

    expect(card).toMatchObject({
      id: live.caio.id,
      name: 'Caio',
      relation: 'none',
      presence: null,
      rollsCount: 12,
      natural20Count: 2,
      gameSystems: 'Tormenta',
    });
  });

  it('without a session it is 401', async () => {
    expect((await readCard(null, live.caio.id)).statusCode).toBe(401);
  });

  it('an unknown or suspended account is 404 PROFILE_NOT_FOUND', async () => {
    await live.connection.db
      .update(users)
      .set({ suspendedAt: new Date() })
      .where(eq(users.id, live.caio.id));

    for (const id of [live.caio.id, UNKNOWN_ID]) {
      const response = await readCard(live.bia, id);
      expect([response.statusCode, response.json().code]).toEqual([404, 'PROFILE_NOT_FOUND']);
    }
  });

  it('who blocked me reads as none, and my own block as blocked', async () => {
    await live.connection.db.insert(userBlocks).values({
      blockerId: live.caio.id,
      blockedId: live.bia.id,
    });

    expect((await cardOf(live.bia, live.caio.id)).relation).toBe('none');
    expect((await cardOf(live.caio, live.bia.id)).relation).toBe('blocked');
  });

  it('a friend reads friend with presence; oneself reads self', async () => {
    await befriend(live.bia, live.caio);

    expect(await cardOf(live.bia, live.caio.id)).toMatchObject({
      relation: 'friend',
      presence: 'offline',
    });
    expect((await cardOf(live.bia, live.bia.id)).relation).toBe('self');
  });

  it('mutualCampaigns has only the tables both play, not one the reader is out of', async () => {
    const card = await cardOf(live.bia, live.caio.id);

    expect(card.mutualCampaigns).toEqual([{ id: live.vharn.id, name: 'Os Sinos de Vharn' }]);
  });

  it('a spectator seat or a juggernaut seat is no table in common nor a counted seat', async () => {
    const duda = await live.signUp('Duda');
    const eva = await live.signUp('Eva');
    await live.joinAsSpectator(duda, live.quelm);
    await live.connection.db.insert(campaignMembers).values({
      campaignId: live.quelm.id,
      userId: eva.id,
      role: 'master',
      juggernautSince: new Date(),
    });

    expect((await cardOf(live.caio, duda.id)).mutualCampaigns).toEqual([]);
    expect(await cardOf(live.caio, eva.id)).toMatchObject({
      mutualCampaigns: [],
      campaignsAsMaster: 0,
      campaignsAsPlayer: 0,
    });
  });

  it('the tables as master and as player count by role', async () => {
    expect(await cardOf(live.bia, live.caio.id)).toMatchObject({
      campaignsAsMaster: 1,
      campaignsAsPlayer: 1,
    });
    expect(await cardOf(live.bia, live.ana.id)).toMatchObject({
      campaignsAsMaster: 1,
      campaignsAsPlayer: 0,
    });
  });

  it('mutualFriends counts the friends both have', async () => {
    const duda = await live.signUp('Duda');
    await befriend(live.bia, live.ana);
    await befriend(live.caio, live.ana);
    await befriend(live.bia, duda);

    expect((await cardOf(live.bia, live.caio.id)).mutualFriends).toBe(1);
  });

  it('the reputation comes as the reader sees it', async () => {
    await live.http(live.bia, {
      method: 'PUT',
      url: `/api/users/${live.caio.id}/reputation`,
      payload: { value: 1 },
    });

    expect((await cardOf(live.bia, live.caio.id)).reputation).toEqual({
      up: 1,
      down: 0,
      myVote: 1,
      percent: null,
    });
  });

  it('the e-mail and the password hash never go out', async () => {
    const body = (await readCard(live.bia, live.caio.id)).body;

    expect(body).not.toMatch(/email|password|hash|@example/i);
  });

  it(`past ${READS_PER_MINUTE} reads a minute the next is 429 with retryAfterSeconds`, async () => {
    for (let index = 0; index < READS_PER_MINUTE; index += 1) {
      await readCard(live.bia, live.caio.id);
    }

    const response = await readCard(live.bia, live.caio.id);

    expect([response.statusCode, response.json().code]).toEqual([429, 'RATE_LIMITED']);
    expect(response.json()).toHaveProperty('retryAfterSeconds');
  });
});
