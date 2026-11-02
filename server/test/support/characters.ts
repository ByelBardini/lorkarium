import type { BoardStateDto, TokenDto } from '@lorkarium/contracts';
import { gridAck } from './grids';
import { envelope, send, synced } from './live-table';
import { recordEventsOf, type EventRecorder, type RealtimeClient } from './realtime-client';
import type { Table } from './tables';
import { CharactersDao } from '../../src/modules/characters/characters.dao';
import { createdTokenOf, tokenCommandFor, type TokenTableHarness } from './token-table';

/** The snapshot of one grid as `client` sees it. */
export async function gridState(
  client: RealtimeClient,
  table: Table,
  sceneId: string,
): Promise<BoardStateDto> {
  const ack = await gridAck(client, 'board:sync', table, sceneId);
  if (!ack.ok) throw new Error(`sync of ${sceneId} refused with ${ack.error.code}`);
  return ack.state;
}

/** The token `tokenId` in a snapshot, or a broken test. */
export function tokenIn(state: BoardStateDto, tokenId: string): TokenDto {
  const found = state.tokens.find(({ id }) => id === tokenId);
  if (!found) throw new Error(`the snapshot of ${state.scene.id} has no token ${tokenId}`);
  return found;
}

/** Puts Envenenado (`rounds` rounds, 0 = no limit) on `tokenId` of the grid. */
export async function poison(
  client: RealtimeClient,
  table: Table,
  tokenId: string,
  sceneId?: string,
  rounds = 0,
): Promise<void> {
  const definitions = (await synced(client, table)).conditionDefinitions;
  const envenenado = definitions.find(({ name }) => name === 'Envenenado');
  if (!envenenado) throw new Error('the table has no Envenenado');
  const scene = sceneId ? { sceneId } : {};
  const command = { ...envelope(table.id), ...scene, tokenId, conditionId: envenenado.id, rounds };
  const ack = await send(client, 'condition:apply', command);
  if (!ack.ok) throw new Error(`condition:apply refused with ${ack.error.code}`);
}

/** The table at play: Ana, Bia and Caio at Vharn, each recorded, and Lyra of Bia on the group
 *  grid (PV 32/45 hidden to others, Inspiração 1/1) with Envenenado.
 *
 *  Example: `const { ana, lyra, recorders } = await lyraPoisonedAtVharn(live)` */
export async function lyraPoisonedAtVharn(live: TokenTableHarness): Promise<
  Readonly<{
    ana: RealtimeClient;
    bia: RealtimeClient;
    caio: RealtimeClient;
    recorders: readonly [EventRecorder, EventRecorder, EventRecorder];
    lyra: TokenDto;
  }>
> {
  const ana = await live.atTable(live.ana, live.vharn);
  const bia = await live.atTable(live.bia, live.vharn);
  const caio = await live.atTable(live.caio, live.vharn);
  const created = recordEventsOf(ana);
  await send(ana, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
  const lyra = await createdTokenOf(created);
  await poison(ana, live.vharn, lyra.id);
  const recorders = [recordEventsOf(ana), recordEventsOf(bia), recordEventsOf(caio)] as const;
  return { ana, bia, caio, recorders, lyra };
}

/** `token:linkToCharacter` of `tokenId` to the character of the player `memberId` (read from the
 *  database); the ack as it came.
 *
 *  Example: `await linkToPlayerCharacter(live, ana, live.vharn, { tokenId, memberId: live.bia.id })` */
export async function linkToPlayerCharacter(
  live: TokenTableHarness,
  client: RealtimeClient,
  table: Table,
  link: Readonly<{ tokenId: string; memberId: string; sceneId?: string }>,
): ReturnType<typeof send> {
  const { memberId, ...token } = link;
  const found = await new CharactersDao(live.connection.db).findOfUser(table.id, memberId);
  if (!found) throw new Error(`member ${memberId} has no character at ${table.id}; expected one`);
  return linkToCharacter(client, table, { ...token, characterId: found.character.id });
}

/** `token:linkToCharacter` of `tokenId` to the character `characterId`; the ack as it came. */
export function linkToCharacter(
  client: RealtimeClient,
  table: Table,
  link: Readonly<{ tokenId: string; characterId: string; sceneId?: string }>,
): ReturnType<typeof send> {
  return send(client, 'token:linkToCharacter', { ...envelope(table.id), ...link });
}

/** `token:unlinkFromCharacter` of `tokenId`; the ack as it came. */
export function unlinkFromCharacter(
  client: RealtimeClient,
  table: Table,
  unlink: Readonly<{ tokenId: string; sceneId?: string }>,
): ReturnType<typeof send> {
  return send(client, 'token:unlinkFromCharacter', { ...envelope(table.id), ...unlink });
}
