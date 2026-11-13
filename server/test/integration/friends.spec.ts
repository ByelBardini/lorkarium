import {
  apiErrorDto,
  blockedUserDto,
  friendDto,
  friendRequestResponseDto,
  friendsOverviewDto,
  type FriendsOverviewDto,
} from '@lorkarium/contracts';
import { memberColorOf } from '@lorkarium/game-core';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { newUserPo } from '../support/auth-factories';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

function ask(user: SignedInUser | null, payload: object) {
  return live.http(user, { method: 'POST', url: '/api/friends/requests', payload });
}

function accept(user: SignedInUser, fromId: string) {
  return live.http(user, { method: 'POST', url: `/api/friends/requests/${fromId}/accept` });
}

function block(user: SignedInUser, payload: object) {
  return live.http(user, { method: 'POST', url: '/api/blocks', payload });
}

async function overviewOf(user: SignedInUser): Promise<FriendsOverviewDto> {
  const response = await live.http(user, { method: 'GET', url: '/api/friends' });
  expect(response.statusCode).toBe(200);
  return friendsOverviewDto.parse(response.json());
}

function idsOf(entries: readonly { userId: string }[]): string[] {
  return entries.map((entry) => entry.userId);
}

function codeOf(response: { json: () => unknown }): string {
  return apiErrorDto.parse(response.json()).code;
}

describe('friends over HTTP', () => {
  it('Ana asks @bia, Bia sees it, accepts, and both list the other with the profile', async () => {
    const sent = await ask(live.ana, { username: '@Bia' });
    expect(sent.statusCode).toBe(200);
    expect(friendRequestResponseDto.parse(sent.json())).toEqual({ outcome: 'sent' });
    expect(idsOf((await overviewOf(live.bia)).incoming)).toEqual([live.ana.id]);
    expect(idsOf((await overviewOf(live.ana)).outgoing)).toEqual([live.bia.id]);

    const accepted = await accept(live.bia, live.ana.id);

    expect(accepted.statusCode).toBe(200);
    expect(friendDto.parse(accepted.json())).toMatchObject({
      userId: live.ana.id,
      username: 'ana',
    });
    const [friendOfAna] = (await overviewOf(live.ana)).friends;
    expect(friendOfAna).toMatchObject({
      userId: live.bia.id,
      username: 'bia',
      name: 'Bia',
      color: memberColorOf(live.bia.id, null),
      avatarId: null,
      plan: 'free',
    });
    expect(idsOf((await overviewOf(live.bia)).friends)).toEqual([live.ana.id]);
    expect((await overviewOf(live.bia)).incoming).toEqual([]);
  });

  it('a crossed request answers accepted and makes the friendship', async () => {
    await ask(live.bia, { username: 'ana' });

    const crossed = await ask(live.ana, { username: 'bia' });

    expect(crossed.json()).toEqual({ outcome: 'accepted' });
    expect(idsOf((await overviewOf(live.ana)).friends)).toEqual([live.bia.id]);
  });

  it('two crossed requests at once end in one friendship and no request left', async () => {
    const [first, second] = await Promise.all([
      ask(live.ana, { username: 'bia' }),
      ask(live.bia, { username: 'ana' }),
    ]);

    const outcomes = [first.json(), second.json()].map(
      (body) => friendRequestResponseDto.parse(body).outcome,
    );
    expect(outcomes.sort()).toEqual(['accepted', 'sent']);
    const rows = await live.connection.db.execute(sql`
      SELECT (SELECT count(*) FROM friendships)::int AS pairs,
             (SELECT count(*) FROM friend_requests)::int AS requests`);
    expect(rows.rows[0]).toEqual({ pairs: 1, requests: 0 });
  });

  it('the 51st pending request is 403 OUTGOING_REQUEST_LIMIT', async () => {
    const accounts = new UsersDao(live.connection.db);
    for (let index = 0; index < 50; index += 1) {
      const target = await accounts.insert(newUserPo({ email: `alvo${index}@mesa.com` }));
      await live.connection.db.execute(
        sql`INSERT INTO friend_requests (from_user_id, to_user_id) VALUES (${live.ana.id}, ${target.id})`,
      );
    }

    const response = await ask(live.ana, { username: 'bia' });

    expect(response.statusCode).toBe(403);
    expect(codeOf(response)).toBe('OUTGOING_REQUEST_LIMIT');
  });

  it('without a session cookie it is 401', async () => {
    expect((await ask(null, { username: 'bia' })).statusCode).toBe(401);
    expect((await live.http(null, { method: 'GET', url: '/api/friends' })).statusCode).toBe(401);
  });

  it('@naoexiste is 404 USER_NOT_FOUND', async () => {
    const response = await ask(live.ana, { username: 'naoexiste' });

    expect(response.statusCode).toBe(404);
    expect(codeOf(response)).toBe('USER_NOT_FOUND');
  });

  it('a userId in the body is refused by the strict DTO: the requester is the session (§7.3)', async () => {
    const response = await ask(live.ana, { username: 'bia', userId: live.caio.id });

    expect(response.statusCode).toBe(400);
    expect((await overviewOf(live.bia)).incoming).toEqual([]);
  });

  it('declining a request that does not exist is 404 REQUEST_NOT_FOUND', async () => {
    const response = await live.http(live.bia, {
      method: 'DELETE',
      url: `/api/friends/requests/${live.ana.id}`,
    });

    expect(response.statusCode).toBe(404);
    expect(codeOf(response)).toBe('REQUEST_NOT_FOUND');
  });

  it('declining a received request is 204 and clears it on both sides', async () => {
    await ask(live.ana, { username: 'bia' });

    const response = await live.http(live.bia, {
      method: 'DELETE',
      url: `/api/friends/requests/${live.ana.id}`,
    });

    expect(response.statusCode).toBe(204);
    expect((await overviewOf(live.ana)).outgoing).toEqual([]);
  });

  it('removing a friend is 204, and again is 404 FRIEND_NOT_FOUND', async () => {
    await ask(live.ana, { username: 'bia' });
    await accept(live.bia, live.ana.id);
    const url = `/api/friends/${live.bia.id}`;

    expect((await live.http(live.ana, { method: 'DELETE', url })).statusCode).toBe(204);
    const again = await live.http(live.ana, { method: 'DELETE', url });

    expect(again.statusCode).toBe(404);
    expect(codeOf(again)).toBe('FRIEND_NOT_FOUND');
  });

  it('Caio blocked Ana: her request answers sent, shows in her outgoing, and Caio never sees it', async () => {
    expect((await block(live.caio, { username: 'ana' })).statusCode).toBe(201);

    const response = await ask(live.ana, { username: 'caio' });

    expect(response.json()).toEqual({ outcome: 'sent' });
    expect(idsOf((await overviewOf(live.ana)).outgoing)).toEqual([live.caio.id]);
    expect((await overviewOf(live.caio)).incoming).toEqual([]);
  });

  it('asking someone I blocked is 409 USER_BLOCKED_BY_YOU', async () => {
    await block(live.ana, { userId: live.caio.id });

    const response = await ask(live.ana, { username: 'caio' });

    expect(response.statusCode).toBe(409);
    expect(codeOf(response)).toBe('USER_BLOCKED_BY_YOU');
  });

  it('blocking a friend lists them as blocked and ends the friendship on both sides', async () => {
    await ask(live.ana, { username: 'bia' });
    await accept(live.bia, live.ana.id);

    const response = await block(live.ana, { userId: live.bia.id });

    expect(response.statusCode).toBe(201);
    expect(blockedUserDto.parse(response.json())).toMatchObject({ userId: live.bia.id });
    expect(idsOf((await overviewOf(live.ana)).blocked)).toEqual([live.bia.id]);
    expect((await overviewOf(live.bia)).friends).toEqual([]);
  });

  it('blocking twice is 409 ALREADY_BLOCKED and oneself 409 REQUEST_TO_SELF', async () => {
    await block(live.ana, { userId: live.caio.id });

    expect(codeOf(await block(live.ana, { userId: live.caio.id }))).toBe('ALREADY_BLOCKED');
    expect(codeOf(await block(live.ana, { username: 'ana' }))).toBe('REQUEST_TO_SELF');
  });

  it('unblocking is 204, does not bring the friend back, and again is 404 BLOCK_NOT_FOUND', async () => {
    await ask(live.ana, { username: 'bia' });
    await accept(live.bia, live.ana.id);
    await block(live.ana, { userId: live.bia.id });
    const url = `/api/blocks/${live.bia.id}`;

    expect((await live.http(live.ana, { method: 'DELETE', url })).statusCode).toBe(204);

    expect(await overviewOf(live.ana)).toMatchObject({ friends: [], blocked: [] });
    expect(codeOf(await live.http(live.ana, { method: 'DELETE', url }))).toBe('BLOCK_NOT_FOUND');
  });
});
