import type {
  ActiveConditionDto,
  ConditionDefinitionDto,
  TokenConditionDto,
} from '@lorkarium/contracts';
import type { ActiveConditionRow } from './conditions.dao';
import type { ConditionDefinitionPo } from './conditions.po';

/** Example: `toConditionDefinitionDto(await conditions.insertDefinition(campaignId, input))` */
export function toConditionDefinitionDto(
  definition: ConditionDefinitionPo,
): ConditionDefinitionDto {
  const { id, name, tone } = definition;
  return { id, name, tone };
}

/** Example: `toActiveConditionDto(await conditions.apply(tokenId, conditionId, duration))` */
export function toActiveConditionDto(row: ActiveConditionRow): ActiveConditionDto {
  const { id, conditionId, name, tone, remainingRounds } = row;
  return { id, conditionId, name, tone, remainingRounds };
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
