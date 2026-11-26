import type { ConditionChangeDto } from '@lorkarium/contracts';
import { tickAtTurnEnd } from '@lorkarium/game-core';
import type { ActiveConditionRow, ConditionsDao } from '../conditions/conditions.dao';
import { holderIdOf, holderIdOfRow, type ConditionHolder } from '../conditions/conditions.po';
import { toActiveConditionDto } from '../conditions/conditions.mapper';
import type { TokenControlPo } from '../tokens/tokens.dao';

type TickDaos = Readonly<{
  conditions: Pick<ConditionsDao, 'listOfHolders' | 'decrementRemaining' | 'deleteActive'>;
}>;

// Whose conditions a turn counts down: the unlinked tokens' own, the linked ones' character's
// (each once).
export function holdersOf(
  tokens: readonly TokenControlPo[],
  tokenIds: readonly string[],
): Readonly<{ loose: string[]; characterIds: string[] }> {
  const characterOf = (id: string) => tokens.find((t) => t.tokenId === id)?.characterId ?? null;
  const loose = tokenIds.filter((tokenId) => characterOf(tokenId) === null);
  const characterIds = tokenIds.flatMap((tokenId) => characterOf(tokenId) ?? []);
  return { loose, characterIds: [...new Set(characterIds)] };
}

export function holdersToTick(
  loose: readonly string[],
  characterIds: readonly string[],
): ConditionHolder[] {
  const tokens = loose.map((tokenId) => ({ tokenId }));
  return [...tokens, ...characterIds.map((characterId) => ({ characterId }))];
}

export function changeOf(
  tokenId: string,
  ticks: ReadonlyMap<string, readonly ActiveConditionRow[]>,
): ConditionChangeDto {
  return { tokenId, conditions: (ticks.get(tokenId) ?? []).map(toActiveConditionDto) };
}

// The end of the turn of `holders` in `round`: their conditions count down, the ones at their
// last round go — one read, one UPDATE and one DELETE for the whole entry. What each holder keeps,
// by its id.
export async function tickConditions(
  daos: TickDaos,
  holders: readonly ConditionHolder[],
  round: number,
): Promise<ReadonlyMap<string, readonly ActiveConditionRow[]>> {
  if (holders.length === 0) return new Map();
  const active = await daos.conditions.listOfHolders(holders);
  const ticks = holders.map((holder) => {
    const holderId = holderIdOf(holder);
    const own = active.filter((condition) => holderIdOfRow(condition) === holderId);
    return { holderId, own, ...tickAtTurnEnd(own, round) };
  });
  const counted = ticks.flatMap(({ own, kept }) => countedDown(own, kept));
  await daos.conditions.decrementRemaining(counted);
  await daos.conditions.deleteActive(ticks.flatMap(({ expired }) => expired.map(({ id }) => id)));
  return new Map(ticks.map(({ holderId, kept }) => [holderId, kept]));
}

// The ids whose duration the tick lowered (the rest kept theirs: untimed or applied this round).
function countedDown<T extends Readonly<{ id: string; remainingRounds: number | null }>>(
  before: readonly T[],
  after: readonly T[],
): string[] {
  const was = new Map(before.map(({ id, remainingRounds }) => [id, remainingRounds]));
  return after
    .filter(({ id, remainingRounds }) => was.get(id) !== remainingRounds)
    .map(({ id }) => id);
}
