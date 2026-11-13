import { BLOCKS_MAX, FRIENDS_MAX, OUTGOING_REQUESTS_MAX } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import { UsersDao } from '../auth/users.dao';
import type { CachedMemberships } from '../campaigns/cached-memberships';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { MemberRemovedPort } from '../campaigns/member-removed.port';
import { FriendRequestsDao } from './friend-requests.dao';
import type { FriendsChangedPort } from './friends-changed.port';
import { friendsRoutes } from './friends.routes';
import { FriendsService, type FriendsTransactionRunner } from './friends.service';
import { FriendshipsDao } from './friendships.dao';
import { UserBlocksDao } from './user-blocks.dao';

export type FriendsModuleOptions = Readonly<{
  db: Database;
  clock: ClockPort;
  /** `friends:changed` to the rooms of the accounts. */
  changed: FriendsChangedPort;
  /** The live table: a blocked account leaves the blocker's tables. */
  removed: MemberRemovedPort;
  memberships: Pick<CachedMemberships, 'forget'>;
}>;

export type FriendsModule = Readonly<{
  plugin: (app: FastifyInstance) => Promise<void>;
  service: FriendsService;
}>;

/** Wires friends and blocks: DAOs, service and the HTTP edge. Needs `app.authGuards`.
 *
 *  Example: `await app.register(createFriendsModule(options).plugin, { prefix: '/api' })` */
export function createFriendsModule(options: FriendsModuleOptions): FriendsModule {
  const { db, clock, changed, removed, memberships } = options;
  const reads = {
    friendships: new FriendshipsDao(db),
    requests: new FriendRequestsDao(db),
    blocks: new UserBlocksDao(db),
  };
  const limits = {
    friendsMax: FRIENDS_MAX,
    outgoingMax: OUTGOING_REQUESTS_MAX,
    blocksMax: BLOCKS_MAX,
  };
  const accounts = new UsersDao(db);
  const transaction = friendsTransactionOver(db);
  const deps = { reads, accounts, transaction, changed, removed, memberships, clock, limits };
  const service = new FriendsService(deps);
  return { plugin: friendsRoutes(service), service };
}

function friendsTransactionOver(db: Database): FriendsTransactionRunner {
  return (work) =>
    runInTransaction(db, (tx) =>
      work({
        friendships: new FriendshipsDao(tx),
        requests: new FriendRequestsDao(tx),
        blocks: new UserBlocksDao(tx),
        seats: new CampaignMembersDao(tx),
      }),
    );
}
