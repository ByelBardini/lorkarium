import { characterSyncAckDto, type CharacterSyncDto } from '@lorkarium/contracts';
import { runInTransaction } from '../../src/database/transaction';
import { CharactersDao, type CharacterRow } from '../../src/modules/characters/characters.dao';
import type { CharacterBarInputPo } from '../../src/modules/characters/characters.po';
import { envelope } from './live-table';
import type { RealtimeClient } from './realtime-client';
import type { SignedInUser } from './sign-in';
import type { Table } from './tables';
import type { TokenTableHarness } from './token-table';

/** The PV of a character: only its controllers (and the masters) see it. */
export const CHARACTER_PV: CharacterBarInputPo = {
  label: 'PV',
  current: 25,
  max: 30,
  color: 'ember',
  visibility: 'controllers',
};

/** The Mana of a character, seen by everyone. */
export const CHARACTER_MANA: CharacterBarInputPo = {
  label: 'Mana',
  current: 4,
  max: 10,
  color: 'steel',
  visibility: 'everyone',
};

/** The characters `client` sees at `table`, by `character:sync`. */
export async function charactersSynced(
  client: RealtimeClient,
  table: Pick<Table, 'id'>,
): Promise<CharacterSyncDto> {
  const answer = await client.timeout(2000).emitWithAck('character:sync', { campaignId: table.id });
  const ack = characterSyncAckDto.parse(answer);
  if (!ack.ok) throw new Error(`character:sync refused with ${ack.error.code}`);
  return { version: ack.version, characters: ack.characters };
}

/** The stored character of `user` at `table`, read straight from the database.
 *
 *  Example: `const lyra = await characterOfUser(live, live.vharn, live.bia)` */
export async function characterOfUser(
  live: TokenTableHarness,
  table: Pick<Table, 'id'>,
  user: Pick<SignedInUser, 'id'>,
): Promise<CharacterRow> {
  const row = await new CharactersDao(live.connection.db).findOfUser(table.id, user.id);
  if (!row) throw new Error(`user ${user.id} has no character at ${table.id}; expected one`);
  return row;
}

/** Gives one character these bars, with no event (seeding a spec). */
export async function giveBars(
  live: TokenTableHarness,
  characterId: string,
  bars: readonly CharacterBarInputPo[],
): Promise<void> {
  await runInTransaction(live.connection.db, (tx) =>
    new CharactersDao(tx).replaceBars(characterId, bars),
  );
}

/** A `character:update` payload. */
export function characterUpdate(
  table: Pick<Table, 'id'>,
  characterId: string,
  changes: object,
): object {
  return { ...envelope(table.id), characterId, changes };
}
