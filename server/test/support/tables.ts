import { campaignResponseDto } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import type { SignedInUser } from './sign-in';

export type Table = Readonly<{ id: string; joinCode: string }>;

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
  return { id, joinCode };
}

/** Joins `table` as a player by its code, through the real HTTP edge.
 *
 *  Example: `await joinByCode(app, bia, vharn)` */
export async function joinByCode(
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
