import { friendSearchResultDto } from '@lorkarium/contracts';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { newUserPo } from '../support/auth-factories';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

function search(user: SignedInUser | null, q: string) {
  const url = `/api/friends/search?q=${encodeURIComponent(q)}`;
  return live.http(user, { method: 'GET', url });
}

async function usernamesFound(user: SignedInUser, q: string): Promise<string[]> {
  const response = await search(user, q);
  expect(response.statusCode, response.body).toBe(200);
  return friendSearchResultDto.parse(response.json()).accounts.map((account) => account.username);
}

async function insertAccount(email: string, suspended = false): Promise<string> {
  const suspendedAt = suspended ? new Date() : null;
  const account = await new UsersDao(live.connection.db).insert(newUserPo({ email, suspendedAt }));
  return account.id;
}

describe('GET /api/friends/search', () => {
  it('lists accounts by the start of the @, ordered, with the public profile only', async () => {
    await insertAccount('biaflor@mesa.com');

    const response = await search(live.ana, '@BI');

    const { accounts } = friendSearchResultDto.parse(response.json());
    expect(accounts.map((account) => account.username)).toEqual(['bia', 'biaflor']);
    expect(Object.keys(accounts[0] ?? {})).not.toContain('email');
  });

  it('never lists me, a pending request either way, or someone I blocked', async () => {
    await live.connection.db.execute(
      sql`INSERT INTO friend_requests (from_user_id, to_user_id) VALUES (${live.bia.id}, ${live.ana.id})`,
    );
    await live.http(live.ana, {
      method: 'POST',
      url: '/api/blocks',
      payload: { username: 'caio' },
    });

    expect(await usernamesFound(live.ana, 'an')).toEqual([]);
    expect(await usernamesFound(live.ana, 'bi')).toEqual([]);
    expect(await usernamesFound(live.ana, 'ca')).toEqual([]);
  });

  it('a friend is not listed', async () => {
    await live.http(live.ana, {
      method: 'POST',
      url: '/api/friends/requests',
      payload: { username: 'bia' },
    });
    await live.http(live.bia, {
      method: 'POST',
      url: `/api/friends/requests/${live.ana.id}/accept`,
    });

    expect(await usernamesFound(live.ana, 'bi')).toEqual([]);
  });

  it('someone who blocked me is still listed: the block is never revealed', async () => {
    await live.http(live.caio, {
      method: 'POST',
      url: '/api/blocks',
      payload: { username: 'ana' },
    });

    expect(await usernamesFound(live.ana, 'ca')).toEqual(['caio']);
  });

  it('a suspended account is not listed', async () => {
    await insertAccount('bianca@mesa.com', true);

    expect(await usernamesFound(live.ana, 'bian')).toEqual([]);
  });

  it('"_" matches only itself, not any character', async () => {
    await insertAccount('b_x@mesa.com');
    await insertAccount('bix@mesa.com');

    expect(await usernamesFound(live.ana, 'b_')).toEqual(['b_x']);
  });

  it('answers at most 10 accounts', async () => {
    for (let index = 0; index < 12; index += 1) await insertAccount(`mesa${index}@mesa.com`);

    expect(await usernamesFound(live.ana, 'mesa')).toHaveLength(10);
  });

  it('one letter or a character out of the @ format is 400, and without a session 401', async () => {
    expect((await search(live.ana, 'b')).statusCode).toBe(400);
    expect((await search(live.ana, 'b%')).statusCode).toBe(400);
    expect((await search(null, 'bi')).statusCode).toBe(401);
  });
});
