import {
  savedRollNameKey,
  type CreateSavedRollRequestDto,
  type SavedRollDto,
  type SavedRollFolderDto,
  type UpdateSavedRollRequestDto,
} from '@lorkarium/contracts';
import type {
  NewSavedRollFolderPo,
  NewSavedRollPo,
  SavedRollChangesPo,
  SavedRollFolderPo,
  SavedRollPo,
} from './saved-rolls.po';

/** Who owns the roll: the session's user at the route's table. */
export type SavedRollOwner = Readonly<{ campaignId: string; userId: string }>;

/** The roll as its owner reads it: no table, owner, key nor dates.
 *
 *  Example: `toSavedRollDto(row) // { id, name: 'Acerto', parts: [...] }` */
export function toSavedRollDto(row: SavedRollPo): SavedRollDto {
  const parts = row.parts.map((part) => ({ label: part.label, expression: part.expression }));
  return { id: row.id, name: row.name, folderId: row.folderId, parts };
}

/** The row a new roll inserts, with the name key the unique index compares.
 *
 *  Example: `toNewSavedRollPo(owner, { name: 'Bênção', parts }).nameKey // 'bencao'` */
export function toNewSavedRollPo(
  owner: SavedRollOwner,
  input: CreateSavedRollRequestDto,
): NewSavedRollPo {
  const { campaignId, userId } = owner;
  const { name, folderId = null, parts } = input;
  return { campaignId, userId, ...namedOf(name), folderId, parts };
}

/** What an edit writes: only the keys sent, the name always with its key.
 *
 *  Example: `toSavedRollChangesPo({ parts }) // { parts }` */
export function toSavedRollChangesPo(changes: UpdateSavedRollRequestDto): SavedRollChangesPo {
  const named = changes.name === undefined ? {} : namedOf(changes.name);
  const parts = changes.parts === undefined ? {} : { parts: changes.parts };
  const folder = changes.folderId === undefined ? {} : { folderId: changes.folderId };
  return { ...named, ...folder, ...parts };
}

/** The folder as its owner reads it.
 *
 *  Example: `toSavedRollFolderDto(row) // { id, name: 'Magias' }` */
export function toSavedRollFolderDto(row: SavedRollFolderPo): SavedRollFolderDto {
  return { id: row.id, name: row.name };
}

/** The row a new folder inserts, with the name key the unique index compares.
 *
 *  Example: `toNewSavedRollFolderPo(owner, 'Bênçãos').nameKey // 'bencaos'` */
export function toNewSavedRollFolderPo(owner: SavedRollOwner, name: string): NewSavedRollFolderPo {
  return { campaignId: owner.campaignId, userId: owner.userId, ...namedOf(name) };
}

/** A name with the key its unique index compares.
 *
 *  Example: `namedOf('Bênção') // { name: 'Bênção', nameKey: 'bencao' }` */
export function namedOf(name: string): Pick<NewSavedRollPo, 'name' | 'nameKey'> {
  return { name, nameKey: savedRollNameKey(name) };
}
