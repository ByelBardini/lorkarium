import { campaignResponseDto } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import type { SignedInUser } from './sign-in';

export type Table = Readonly<{ id: string; joinCode: string; master: SignedInUser }>;

/** Creates a campaign through the real HTTP edge, with `master` as its master.
 *
 *  Example: `const vharn = await createTable(app, ana, 'Os Sinos de Vharn')` */
export async function createTable(
  app: FastifyInstance,
  master: SignedInUser,
  name: string,
): Promise<Table> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/campaigns',
    cookies: { lk_session: master.token },
    payload: { name },
  });
  const { id, joinCode } = campaignResponseDto.parse(response.json()).campaign;
  if (!joinCode) throw new Error(`campaign ${id} came back without a join code`);
  return { id, joinCode, master };
}

/** Joins `table` by its code through the real HTTP edge: whoever enters by the code watches.
 *
 *  Example: `await joinAsSpectator(live.app, duda, live.vharn)` */
export async function joinAsSpectator(
  app: FastifyInstance,
  user: SignedInUser,
  table: Table,
): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/campaigns/join',
    cookies: { lk_session: user.token },
    payload: { code: table.joinCode },
  });
  if (response.statusCode >= 400) {
    throw new Error(`join of ${table.id} by ${user.id} answered ${response.statusCode}`);
  }
}

/** Joins `table` as a player the real way: by its code, then its master promotes through the
 *  route.
 *
 *  Example: `await joinByCode(app, bia, vharn)` */
export async function joinByCode(
  app: FastifyInstance,
  user: SignedInUser,
  table: Table,
): Promise<void> {
  await joinAsSpectator(app, user, table);
  const response = await app.inject({
    method: 'PATCH',
    url: `/api/campaigns/${table.id}/members/${user.id}`,
    cookies: { lk_session: table.master.token },
    payload: { role: 'player' },
  });
  if (response.statusCode !== 200) {
    throw new Error(`promotion of ${user.id} in ${table.id} answered ${response.statusCode}`);
  }
}
