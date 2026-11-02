import type {
  ActiveConditionDto,
  ConditionDefinitionDto,
  TokenConditionDto,
} from '@lorkarium/contracts';
import type { ActiveConditionRow } from './conditions.dao';
import {
  holderIdOfRow,
  type ConditionDefinitionPo,
  type ConditionHolder,
  type NewConditionDefinition,
} from './conditions.po';

/** Only the definition's own fields: the command's envelope (`actionId`, `sceneId`…) stays out.
 *
 *  Example: `await conditions.updateDefinition(campaignId, command.conditionId, toNewConditionDefinition(command))` */
export function toNewConditionDefinition(command: NewConditionDefinition): NewConditionDefinition {
  const { name, tone, icon, look, color, description, maxStacks, imageAssetId } = command;
  return { name, tone, icon, look, color, description, maxStacks, imageAssetId };
}

/** Example: `toConditionDefinitionDto(await conditions.insertDefinition(campaignId, input))` */
export function toConditionDefinitionDto(
  definition: ConditionDefinitionPo,
): ConditionDefinitionDto {
  const { id, name, tone, icon, look, color, description, maxStacks, imageAssetId } = definition;
  return { id, name, tone, icon, look, color, description, maxStacks, imageAssetId };
}

/** Example: `toActiveConditionDto(await conditions.apply(tokenId, conditionId, duration))` */
export function toActiveConditionDto(row: ActiveConditionRow): ActiveConditionDto {
  const { id, conditionId, name, tone, icon, look, description, remainingRounds } = row;
  const { color, maxStacks, imageAssetId, stacks } = row;
  return {
    id,
    conditionId,
    name,
    tone,
    icon,
    look,
    color,
    description,
    maxStacks,
    imageAssetId,
    stacks,
    remainingRounds,
  };
}

/** A condition of an unlinked token, as `condition:appliedMany` carries it; a character's has no
 *  place here (it goes out whole, in `character:changed`).
 *
 *  Example: `applied.map(toTokenConditionDto)` after a `condition:applyMany` */
export function toTokenConditionDto(row: ActiveConditionRow): TokenConditionDto {
  if (row.tokenId === null)
    throw new Error(`condition ${row.id} is held by character ${row.characterId}, not a token`);
  return { tokenId: row.tokenId, condition: toActiveConditionDto(row) };
}

/** Who holds the conditions a token shows: the character it wears, or the token itself.
 *
 *  Example: `holderOfToken(lyraOfEstrada.token) // { characterId: lyraId }` */
export function holderOfToken(
  token: Readonly<{ id: string; characterId: string | null }>,
): ConditionHolder {
  return token.characterId === null ? { tokenId: token.id } : { characterId: token.characterId };
}

/** Active conditions grouped by holder id (a token's or a character's), for the snapshot, the
 *  token events and the characters.
 *
 *  Example: `conditionsByHolder(await conditions.listOfHolders(holders)).get(lyraId) ?? []` */
export function conditionsByHolder(
  rows: readonly ActiveConditionRow[],
): ReadonlyMap<string, ActiveConditionDto[]> {
  const grouped = new Map<string, ActiveConditionDto[]>();
  for (const row of rows) {
    const holderId = holderIdOfRow(row);
    grouped.set(holderId, [...(grouped.get(holderId) ?? []), toActiveConditionDto(row)]);
  }
  return grouped;
}
