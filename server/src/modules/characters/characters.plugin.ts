import { BAR_VALUE_LIMIT } from '@lorkarium/contracts';
import type { Database } from '../../database/database';
import { runInSnapshot, runInTransaction, type Transaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import { UsersDao } from '../auth/users.dao';
import type { MembershipReader } from '../campaigns/cached-memberships';
import type { MemberSeatPort } from '../campaigns/member-seat.port';
import type { CharacterPublisherPort } from './character-publisher.port';
import {
  CharacterSeatService,
  type CharacterSeatDaos,
  type CharacterSeatTransactionRunner,
} from './character-seat.service';
import { ConditionsDao } from '../conditions/conditions.dao';
import { SheetsDao } from '../sheets/sheets.dao';
import { CharactersDao } from './characters.dao';
import { CharactersService } from './characters.service';

export type CharactersModuleOptions = Readonly<{
  db: Database;
  /** Shared by the board modules: the memberships remembered by the campaigns module. */
  members: MembershipReader;
  publisher: CharacterPublisherPort;
  clock: ClockPort;
}>;

export type CharactersModule = Readonly<{
  /** The commands and the sync; its edge is the board gateway. */
  service: CharactersService;
  /** The character of a member taken out of a table (a `MemberRemovedPort`). */
  seats: CharacterSeatService;
  /** The character of a member, bound to the transaction of their new role. */
  seatIn: (tx: Transaction) => MemberSeatPort;
}>;

/** Wires the characters module: the board gateway receives `service`, the campaigns module
 *  `seatIn` (and the app `seats`, among the outlets of a member taken out).
 *
 *  Example: `const characters = createCharactersModule({ db, members, publisher, clock })` */
export function createCharactersModule(options: CharactersModuleOptions): CharactersModule {
  const { db, members, publisher, clock } = options;
  const service = new CharactersService({
    members,
    transaction: (work) =>
      runInTransaction(db, (tx) =>
        work({ characters: new CharactersDao(tx), sheets: new SheetsDao(tx) }),
      ),
    snapshot: (work) =>
      runInSnapshot(db, (tx) =>
        work({ characters: new CharactersDao(tx), conditions: new ConditionsDao(tx) }),
      ),
    publisher,
    clock,
    barLimit: BAR_VALUE_LIMIT,
  });
  const transaction: CharacterSeatTransactionRunner = (work) =>
    runInTransaction(db, (tx) => work(seatDaosOf(tx)));
  const seats = new CharacterSeatService({ transaction, publisher, clock });
  return { service, seats, seatIn: (tx) => seats.seatIn(seatDaosOf(tx)) };
}

function seatDaosOf(tx: Transaction): CharacterSeatDaos {
  return { characters: new CharactersDao(tx), users: new UsersDao(tx) };
}
