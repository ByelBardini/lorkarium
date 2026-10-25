import type {
  ActiveConditionDto,
  ConditionDefinitionDto,
  TokenConditionDto,
} from '@lorkarium/contracts';
import type { ActiveConditionRow } from './conditions.dao';
import type { ConditionDefinitionPo, NewConditionDefinition } from './conditions.po';

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

/** Example: `applied.map(toTokenConditionDto)` after a `condition:applyMany` */
export function toTokenConditionDto(row: ActiveConditionRow): TokenConditionDto {
  return { tokenId: row.tokenId, condition: toActiveConditionDto(row) };
}

/** Active conditions grouped by token, for the snapshot and the token events.
 *
 *  Example: `conditionsByToken(await conditions.listOfTokens(ids)).get(token.id) ?? []` */
export function conditionsByToken(
  rows: readonly ActiveConditionRow[],
): ReadonlyMap<string, ActiveConditionDto[]> {
  const grouped = new Map<string, ActiveConditionDto[]>();
  for (const row of rows) {
    grouped.set(row.tokenId, [...(grouped.get(row.tokenId) ?? []), toActiveConditionDto(row)]);
  }
  return grouped;
}
