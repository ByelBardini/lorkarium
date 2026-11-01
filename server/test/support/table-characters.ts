import { characterSyncAckDto, type CharacterSyncDto } from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import { runInTransaction } from '../../src/database/transaction';
import { CharactersDao, type CharacterRow } from '../../src/modules/characters/characters.dao';
import type { CharacterBarInputPo } from '../../src/modules/characters/characters.po';
import { tokens } from '../../src/modules/tokens/tokens.po';
import { activeConditions } from '../../src/modules/conditions/conditions.po';
import { envelope, synced } from './live-table';
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
  const { version, characters, conditionDefinitions } = ack;
  return { version, characters, conditionDefinitions };
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

/** The bars of the Lyra of `tokenCommandFor` (PV 32/45 for its controllers, Inspiração 1/1 for
 *  everyone), as a character holds them. */
export const LYRA_BARS: readonly CharacterBarInputPo[] = [
  { label: 'PV', current: 32, max: 45, color: 'ember', visibility: 'controllers' },
  { label: 'Inspiração', current: 1, max: 1, color: 'gold', visibility: 'everyone' },
];

/** Bia's character at Vharn becomes Lyra: her name, initials and bars (what a link to her card
 *  carried to the anchor before tokens wore characters), with no event; returns the character's id.
 *
 *  Example: `const lyraCharacterId = await lyraBarsOnBia(live)` */
export async function lyraBarsOnBia(live: TokenTableHarness): Promise<string> {
  const { character } = await characterOfUser(live, live.vharn, live.bia);
  await giveBars(live, character.id, LYRA_BARS);
  await renameCharacter(live, character.id, 'Lyra');
  return character.id;
}

/** Gives one character a name (and the initials of its first two letters), with no event.
 *
 *  Example: `await renameCharacter(live, caioCharacterId, 'Bram')` */
export async function renameCharacter(
  live: TokenTableHarness,
  characterId: string,
  name: string,
): Promise<void> {
  const initials = name.slice(0, 2).toUpperCase();
  await new CharactersDao(live.connection.db).update(characterId, { name, initials });
}

/** Envenenado (3 rounds) held by the character itself, with no event (seeding a spec).
 *
 *  Example: `await poisonCharacter(live, ana, lyraCharacterId)` */
export async function poisonCharacter(
  live: TokenTableHarness,
  client: RealtimeClient,
  characterId: string,
): Promise<void> {
  const definitions = (await synced(client, live.vharn)).conditionDefinitions;
  const envenenado = definitions.find(({ name }) => name === 'Envenenado');
  if (!envenenado) throw new Error('the table has no Envenenado');
  await live.connection.db
    .insert(activeConditions)
    .values({ characterId, conditionId: envenenado.id, remainingRounds: 3 });
}

/** Links one token to a character straight in the database, with no event (seeding a spec
 *  without going through the link command).
 *
 *  Example: `await wearCharacter(live, lyraOfSalao, lyraCharacterId)` */
export async function wearCharacter(
  live: TokenTableHarness,
  tokenId: string,
  characterId: string,
): Promise<void> {
  await live.connection.db.update(tokens).set({ characterId }).where(eq(tokens.id, tokenId));
}
