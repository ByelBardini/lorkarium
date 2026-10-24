import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import type { MembershipReader } from '../campaigns/cached-memberships';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { ScenesDao } from '../scenes/scenes.dao';
import { MemberCardsDao } from './member-cards.dao';
import { MemberCardsService, type MemberCardTransactionRunner } from './member-cards.service';

export type MemberCardsModuleOptions = Readonly<{
  db: Database;
  /** Shared by the board modules: the memberships remembered by the campaigns module. */
  members: MembershipReader;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

export type MemberCardsModule = Readonly<{ service: MemberCardsService }>;

/** Wires the member cards module; its edge is the board gateway, which receives this service.
 *
 *  Example: `const memberCards = createMemberCardsModule({ db, publisher, clock }).service` */
export function createMemberCardsModule(options: MemberCardsModuleOptions): MemberCardsModule {
  const transaction: MemberCardTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({
        scenes: new ScenesDao(tx),
        members: new CampaignMembersDao(tx),
        memberCards: new MemberCardsDao(tx),
      }),
    );
  const { members } = options;
  const { publisher, clock } = options;
  return { service: new MemberCardsService({ members, transaction, publisher, clock }) };
}
