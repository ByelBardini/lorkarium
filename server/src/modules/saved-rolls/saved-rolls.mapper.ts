import {
  savedRollNameKey,
  type CreateSavedRollRequestDto,
  type SavedRollDto,
  type UpdateSavedRollRequestDto,
} from '@lorkarium/contracts';
import type { NewSavedRollPo, SavedRollChangesPo, SavedRollPo } from './saved-rolls.po';

/** Who owns the roll: the session's user at the route's table. */
export type SavedRollOwner = Readonly<{ campaignId: string; userId: string }>;

/** The roll as its owner reads it: no table, owner, key nor dates.
 *
 *  Example: `toSavedRollDto(row) // { id, name: 'Acerto', parts: [...] }` */
export function toSavedRollDto(row: SavedRollPo): SavedRollDto {
  const parts = row.parts.map((part) => ({ label: part.label, expression: part.expression }));
  return { id: row.id, name: row.name, parts };
}

/** The row a new roll inserts, with the name key the unique index compares.
 *
 *  Example: `toNewSavedRollPo(owner, { name: 'Bênção', parts }).nameKey // 'bencao'` */
export function toNewSavedRollPo(
  owner: SavedRollOwner,
  input: CreateSavedRollRequestDto,
): NewSavedRollPo {
  const { campaignId, userId } = owner;
  return { campaignId, userId, ...namedOf(input.name), parts: input.parts };
}

/** What an edit writes: only the keys sent, the name always with its key.
 *
 *  Example: `toSavedRollChangesPo({ parts }) // { parts }` */
export function toSavedRollChangesPo(changes: UpdateSavedRollRequestDto): SavedRollChangesPo {
  const named = changes.name === undefined ? {} : namedOf(changes.name);
  const parts = changes.parts === undefined ? {} : { parts: changes.parts };
  return { ...named, ...parts };
}

function namedOf(name: string): Pick<NewSavedRollPo, 'name' | 'nameKey'> {
  return { name, nameKey: savedRollNameKey(name) };
}
