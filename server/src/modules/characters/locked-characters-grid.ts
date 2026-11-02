import {
  reachedGridOf,
  type GridAddress,
  type GridLockDaos,
  type LockedGrid,
  type SavedVersion,
  type SceneTransaction,
} from '../scenes/locked-scene';
import type { AddressedSceneRow } from '../scenes/scenes.dao';
import {
  lockCharacters,
  savedVersionOf,
  type CharactersLockDaos,
  type LockedCharacters,
} from './locked-characters';

/** What a board transaction on the table's characters and one grid needs: both locks. */
export type CharactersAndGridLockDaos = CharactersLockDaos & GridLockDaos;

/** The grid of the command and, when locked, the table's characters. */
export type LockedGridMaybeCharacters<Daos> = LockedGrid<Daos> &
  Readonly<{ characters: LockedCharacters<Daos> | null }>;

/** What a work changed: the grid and the characters each get a new version (and their event). */
export type CharactersAndGridChange<T> = Readonly<{
  value: T;
  grid: boolean;
  characters: boolean;
}>;

/** What the transaction saved: the grid's version when it touched the grid, the characters'
 *  when it touched them (`null` = untouched), and the version a command answers: the grid's,
 *  else the characters', else the grid's as it was. */
export type SavedInCharactersAndGrid<T> = Readonly<{
  value: T;
  grid: SavedVersion | null;
  characters: number | null;
  version: number;
}>;

// The work met a linked token without the characters locked: it rolls back and runs again.
class CharactersLockNeeded extends Error {
  constructor(readonly campaignId: string) {
    super(`the command on campaign ${campaignId} touches a character; it runs again locking them`);
  }
}

/** Lock the grid → work, and only when the work meets a token linked to a character
 *  (`requireCharactersLock`), roll back and run it again locking the characters first, then the
 *  grid — always in that order, so two commands never wait on each other. Commands on unlinked
 *  tokens never touch the characters. Each part the work changed is bumped once.
 *
 *  Example: `await inLockedGridWithCharacters(transaction, address, async (locked) => ({ value, grid: true, characters: false }))` */
export async function inLockedGridWithCharacters<Daos extends CharactersAndGridLockDaos, T>(
  transaction: SceneTransaction<Daos>,
  address: GridAddress,
  work: (locked: LockedGridMaybeCharacters<Daos>) => Promise<CharactersAndGridChange<T>>,
): Promise<SavedInCharactersAndGrid<T>> {
  try {
    return await transaction(async (daos) => {
      const scene = await lockedGridOf(daos, address);
      return savedOf(daos, scene, null, await work({ daos, scene, characters: null }));
    });
  } catch (error) {
    if (!(error instanceof CharactersLockNeeded)) throw error;
    return inLockedCharactersAndGrid(transaction, address, work);
  }
}

/** Lock the characters → lock the addressed grid → work → bump what it touched, in one
 *  transaction (the eager form of `inLockedGridWithCharacters`).
 *
 *  Example: `await inLockedCharactersAndGrid(transaction, address, async ({ daos, scene, characters }) => …)` */
export async function inLockedCharactersAndGrid<Daos extends CharactersAndGridLockDaos, T>(
  transaction: SceneTransaction<Daos>,
  address: GridAddress,
  work: (locked: LockedGridMaybeCharacters<Daos>) => Promise<CharactersAndGridChange<T>>,
): Promise<SavedInCharactersAndGrid<T>> {
  return transaction(async (daos) => {
    const characters = await lockCharacters(daos, address.campaignId);
    const scene = await lockedGridOf(daos, address);
    return savedOf(daos, scene, characters, await work({ daos, scene, characters }));
  });
}

/** The locked characters of a work that touches one; without their lock, the run starts again
 *  with it. Call it before the first write.
 *
 *  Example: `const characters = requireCharactersLock(locked)` */
export function requireCharactersLock<Daos>(
  locked: LockedGridMaybeCharacters<Daos>,
): LockedCharacters<Daos> {
  if (locked.characters) return locked.characters;
  throw new CharactersLockNeeded(locked.scene.campaignId);
}

async function lockedGridOf(daos: GridLockDaos, address: GridAddress): Promise<AddressedSceneRow> {
  const row = await daos.scenes.lockInCampaign(address.campaignId, address.sceneId);
  return reachedGridOf(address, row);
}

async function savedOf<Daos extends CharactersAndGridLockDaos, T>(
  daos: Daos,
  scene: AddressedSceneRow,
  characters: LockedCharacters<Daos> | null,
  change: CharactersAndGridChange<T>,
): Promise<SavedInCharactersAndGrid<T>> {
  const charactersVersion = change.characters
    ? await savedVersionOf(requireLocked(characters, scene), true)
    : null;
  const grid = change.grid
    ? { sceneId: scene.id, version: await daos.scenes.bumpVersion(scene.id) }
    : null;
  const version = grid?.version ?? charactersVersion ?? scene.version;
  return { value: change.value, grid, characters: charactersVersion, version };
}

function requireLocked<Daos>(
  characters: LockedCharacters<Daos> | null,
  scene: AddressedSceneRow,
): LockedCharacters<Daos> {
  if (characters) return characters;
  throw new Error(
    `a work on scene ${scene.id} touched the characters without requireCharactersLock`,
  );
}
