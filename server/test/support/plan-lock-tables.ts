import { campaignResponseDto } from '@lorkarium/contracts';
import { expect } from 'vitest';
import type { SignedInUser } from './sign-in';
import type { Table } from './tables';
import type { TokenTableHarness } from './token-table';

/** Another table of `master`, created through the real HTTP edge: the master's plan must allow
 *  it (a free account keeps one table), so call it with the master on `amigo_do_dono`.
 *
 *  Example: `const ermo = await secondTableOf(live, live.ana, 'Ermo')` */
export async function secondTableOf(
  live: TokenTableHarness,
  master: SignedInUser,
  name: string,
): Promise<Table> {
  const response = await live.http(master, {
    method: 'POST',
    url: '/api/campaigns',
    payload: { name },
  });
  expect(response.statusCode, response.body).toBe(201);
  const { id, joinCode } = campaignResponseDto.parse(response.json()).campaign;
  if (!joinCode) throw new Error(`campaign ${id} came back without a join code`);
  return { id, joinCode, master };
}

/** `user` joins `table` by its code and its master promotes them to player.
 *
 *  Example: `await joinAsPlayer(live, live.bia, ermo)` */
export async function joinAsPlayer(
  live: TokenTableHarness,
  user: SignedInUser,
  table: Table,
): Promise<void> {
  await live.joinAsSpectator(user, table);
  const url = `/api/campaigns/${table.id}/members/${user.id}`;
  const response = await live.http(table.master, {
    method: 'PATCH',
    url,
    payload: { role: 'player' },
  });
  expect(response.statusCode, response.body).toBe(200);
}
