import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { users } from '../../src/modules/auth/users.po';
import { campaignMembers } from '../../src/modules/campaigns/campaign-members.po';
import { ReputationDao } from '../../src/modules/reputation/reputation.dao';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const WRITES_PER_MINUTE = 30;

function vote(user: SignedInUser | null, targetId: string, value: number) {
  const url = `/api/users/${targetId}/reputation`;
  return live.http(user, { method: 'PUT', url, payload: { value } });
}

function unvote(user: SignedInUser | null, targetId: string) {
  return live.http(user, { method: 'DELETE', url: `/api/users/${targetId}/reputation` });
}

function countsOf(targetId: string, viewerId: string) {
  return new ReputationDao(live.connection.db).countsFor(targetId, viewerId);
}

function codeOf(response: { statusCode: number; json: () => { code?: string } }) {
  return [response.statusCode, response.json().code];
}

describe('voting on the reputation over HTTP', () => {
  it('PUT between players of Vharn answers 204 and the vote is counted', async () => {
    const response = await vote(live.bia, live.caio.id, 1);

    expect(response.statusCode).toBe(204);
    expect(await countsOf(live.caio.id, live.bia.id)).toEqual({ up: 1, down: 0, myVote: 1 });
  });

  it('voting again turns thumbs up into thumbs down without a second vote', async () => {
    await vote(live.bia, live.caio.id, 1);

    await vote(live.bia, live.caio.id, -1);

    expect(await countsOf(live.caio.id, live.bia.id)).toEqual({ up: 0, down: 1, myVote: -1 });
  });

  it('DELETE answers 204, takes the vote off and is idempotent', async () => {
    await vote(live.bia, live.caio.id, 1);

    expect((await unvote(live.bia, live.caio.id)).statusCode).toBe(204);
    expect((await unvote(live.bia, live.caio.id)).statusCode).toBe(204);
    expect(await countsOf(live.caio.id, live.bia.id)).toEqual({ up: 0, down: 0, myVote: null });
  });

  it("another account does not see Bia's vote as its own", async () => {
    await vote(live.bia, live.caio.id, 1);

    expect(await countsOf(live.caio.id, live.ana.id)).toEqual({ up: 1, down: 0, myVote: null });
  });

  it('without a session it is 401', async () => {
    expect((await vote(null, live.caio.id, 1)).statusCode).toBe(401);
    expect((await unvote(null, live.caio.id)).statusCode).toBe(401);
  });

  it('a body other than 1 or -1 is 400', async () => {
    expect((await vote(live.bia, live.caio.id, 0)).statusCode).toBe(400);
  });

  it('voting on oneself is 400 REPUTATION_SELF', async () => {
    expect(codeOf(await vote(live.bia, live.bia.id, 1))).toEqual([400, 'REPUTATION_SELF']);
  });

  it('without a table in common it is 403 and nothing is written', async () => {
    const eva = await live.signUp('Eva');

    expect(codeOf(await vote(live.bia, eva.id, 1))).toEqual([403, 'REPUTATION_NOT_ALLOWED']);
    expect(await countsOf(eva.id, live.bia.id)).toEqual({ up: 0, down: 0, myVote: null });
  });

  it('a spectator of the same table does not count as sharing it', async () => {
    const duda = await live.signUp('Duda');
    await live.joinAsSpectator(duda, live.vharn);

    expect(codeOf(await vote(live.bia, duda.id, 1))).toEqual([403, 'REPUTATION_NOT_ALLOWED']);
    expect(codeOf(await vote(duda, live.bia.id, 1))).toEqual([403, 'REPUTATION_NOT_ALLOWED']);
  });

  it('an admin in juggernaut mode at the table does not count as sharing it', async () => {
    const eva = await live.signUp('Eva');
    await live.connection.db.insert(campaignMembers).values({
      campaignId: live.quelm.id,
      userId: eva.id,
      role: 'master',
      juggernautSince: new Date(),
    });

    expect(codeOf(await vote(live.caio, eva.id, 1))).toEqual([403, 'REPUTATION_NOT_ALLOWED']);
  });

  it('an unknown or suspended account is 404', async () => {
    await live.connection.db
      .update(users)
      .set({ suspendedAt: new Date() })
      .where(eq(users.id, live.caio.id));

    const suspended = await vote(live.bia, live.caio.id, 1);
    const unknown = await vote(live.bia, UNKNOWN_ID, 1);

    expect(codeOf(suspended)).toEqual([404, 'REPUTATION_TARGET_NOT_FOUND']);
    expect(codeOf(unknown)).toEqual([404, 'REPUTATION_TARGET_NOT_FOUND']);
  });

  it(`past ${WRITES_PER_MINUTE} writes a minute the next is 429 with retryAfterSeconds`, async () => {
    for (let index = 0; index < WRITES_PER_MINUTE; index += 1) {
      await vote(live.bia, live.caio.id, index % 2 === 0 ? 1 : -1);
    }

    const response = await unvote(live.bia, live.caio.id);

    expect(codeOf(response)).toEqual([429, 'RATE_LIMITED']);
    expect(response.json()).toHaveProperty('retryAfterSeconds');
  });

  it("deleting the voter's account takes the vote with it", async () => {
    await vote(live.bia, live.caio.id, 1);

    await live.connection.db.delete(users).where(eq(users.id, live.bia.id));

    expect(await countsOf(live.caio.id, live.ana.id)).toEqual({ up: 0, down: 0, myVote: null });
  });
});
