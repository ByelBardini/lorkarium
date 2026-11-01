import type { ClockPort } from '../auth/clock.port';
import type { CharactersDao } from './characters.dao';

/** What a transaction on the table's characters needs: their lock and their version. */
export type CharactersLockDaos = Readonly<{
  characters: Pick<CharactersDao, 'lockVersion' | 'bumpVersion'>;
}>;

export type CharactersTransaction<Daos> = <T>(work: (daos: Daos) => Promise<T>) => Promise<T>;

/** The table's characters, locked: the daos of the transaction and the version as it was. */
export type LockedCharacters<Daos> = Readonly<{ daos: Daos; campaignId: string; version: number }>;

/** What a work on the characters saved and whether it changed them (a change gets a version). */
export type CharactersChangeOf<T> = Readonly<{ value: T; changed: boolean }>;

/** What the transaction saved and the characters' version it ends at (bumped only on a change). */
export type SavedInCharacters<T> = Readonly<{ value: T; version: number; changed: boolean }>;

/** Lock the table's characters → work → bump their version when the work changed them, in one
 *  transaction (spec §5.5). The requester's membership is checked before; the caller publishes
 *  after the commit. A command that also touches a grid locks the characters first
 *  (`lockCharacters`), then the grid, always in this order, so two commands never wait on each
 *  other.
 *
 *  Example: `await inLockedCharacters(transaction, vharnId, async ({ daos }) => ({ value, changed: true }))` */
export async function inLockedCharacters<Daos extends CharactersLockDaos, T>(
  transaction: CharactersTransaction<Daos>,
  campaignId: string,
  work: (locked: LockedCharacters<Daos>) => Promise<CharactersChangeOf<T>>,
): Promise<SavedInCharacters<T>> {
  return transaction(async (daos) => {
    const locked = await lockCharacters(daos, campaignId);
    const { value, changed } = await work(locked);
    return { value, version: await savedVersionOf(locked, changed), changed };
  });
}

/** Locks the characters of a table inside a transaction already open (the first lock of one that
 *  also locks a grid). The membership was checked before, so a table gone is a broken read.
 *
 *  Example: `const locked = await lockCharacters(daos, campaignId)` */
export async function lockCharacters<Daos extends CharactersLockDaos>(
  daos: Daos,
  campaignId: string,
): Promise<LockedCharacters<Daos>> {
  const version = await daos.characters.lockVersion(campaignId);
  if (version === undefined) {
    throw new Error(`campaign ${campaignId} has no row to lock its characters; expected the table`);
  }
  return { daos, campaignId, version };
}

/** The version the characters end at: bumped once if the work changed them, as it was if not.
 *
 *  Example: `const version = await savedVersionOf(locked, true)` */
export async function savedVersionOf(
  locked: LockedCharacters<CharactersLockDaos>,
  changed: boolean,
): Promise<number> {
  if (!changed) return locked.version;
  return locked.daos.characters.bumpVersion(locked.campaignId);
}

/** The opening of a characters event: its table, version and now.
 *
 *  Example: `publisher.charactersChanged({ ...charactersEventBase(campaignId, saved.version, clock), characters })` */
export function charactersEventBase(
  campaignId: string,
  version: number,
  clock: ClockPort,
): Readonly<{ campaignId: string; version: number; at: string }> {
  return { campaignId, version, at: clock.now().toISOString() };
}
