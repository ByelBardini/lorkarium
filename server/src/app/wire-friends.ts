import type { FastifyInstance } from 'fastify';
import type { FriendsChangedPort } from '../modules/friends/friends-changed.port';
import { createFriendsModule, type FriendsModuleOptions } from '../modules/friends/friends.plugin';

/** Until the account connection exists, a saved change of the friends lists reaches nobody live:
 *  the screen reads `GET /api/friends` when it opens. The Socket.IO adapter takes its place. */
export const SILENT_FRIENDS_CHANGED: FriendsChangedPort = {
  friendsChanged: async (): Promise<void> => undefined,
};

export type FriendsWiring = Omit<FriendsModuleOptions, 'changed'> &
  Readonly<{ changed?: FriendsChangedPort }>;

/** Registers friends and blocks under `prefix`; `changed` defaults to `SILENT_FRIENDS_CHANGED`.
 *
 *  Example: `await wireFriends(app, { db, clock, removed, memberships }, '/api')` */
export async function wireFriends(
  app: FastifyInstance,
  wiring: FriendsWiring,
  prefix: string,
): Promise<void> {
  const changed = wiring.changed ?? SILENT_FRIENDS_CHANGED;
  const friends = createFriendsModule({ ...wiring, changed });
  await app.register(friends.plugin, { prefix });
}
