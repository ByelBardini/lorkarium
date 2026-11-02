import type { ActiveConditionDto, ConditionDefinitionDto, TokenDto } from '@lorkarium/contracts';

type Definitions = readonly ConditionDefinitionDto[];

/** Whatever carries active conditions: a token or a character. */
type ConditionHolder = Readonly<{ conditions: ActiveConditionDto[] }>;

/** The table's list with one definition replaced where it stands (unknown → as it was).
 *
 *  Example: `withDefinitionReplaced(board.conditionDefinitions, poisoned)` */
export function withDefinitionReplaced(
  definitions: Definitions,
  definition: ConditionDefinitionDto,
): ConditionDefinitionDto[] {
  return definitions.map((current) => (current.id === definition.id ? definition : current));
}

/** The table's list with the restored ones appended, each once even if the event comes twice.
 *
 *  Example: `withDefinitionsAdded(board.conditionDefinitions, [blinded])` */
export function withDefinitionsAdded(
  definitions: Definitions,
  added: Definitions,
): ConditionDefinitionDto[] {
  const known = new Set(definitions.map(({ id }) => id));
  return [...definitions, ...added.filter(({ id }) => !known.has(id))];
}

/** The holders (tokens or characters) with every active condition of that definition showing it
 *  as saved now (name, tone, icon, color, look, description, max stacks, image — the stacks
 *  clamped to it, 1 when it no longer stacks, as the server does); the rounds left stay. Each
 *  holder that did not change stays the same object; nothing changed → the same array.
 *
 *  Example: `holdersShowingDefinition(characters, poisoned)` */
export function holdersShowingDefinition<H extends ConditionHolder>(
  holders: readonly H[],
  definition: ConditionDefinitionDto,
): readonly H[] {
  const byId = new Map([[definition.id, definition]]);
  return holdersOverDefinitions(holders, byId, new Set());
}

/** The holders without any active condition of that definition (it left the table's list).
 *
 *  Example: `holdersWithoutDefinition(characters, blindedId)` */
export function holdersWithoutDefinition<H extends ConditionHolder>(
  holders: readonly H[],
  conditionId: string,
): readonly H[] {
  return holdersOverDefinitions(holders, new Map(), new Set([conditionId]));
}

/** A grid's tokens after the table's list moved from `before` to `after` (the table stream's
 *  version): the conditions of an edited definition show it, those of a deleted one go. Only a
 *  definition `before` knew and `after` lacks counts as deleted — one `after` lacks but `before`
 *  never had may simply not have reached the list yet. Nothing changed → the same array.
 *
 *  Example: `tokensOverCatalog(grid.tokens, grid.conditionDefinitions, table.conditionDefinitions)` */
export function tokensOverCatalog(
  tokens: TokenDto[],
  before: Definitions,
  after: Definitions,
): TokenDto[] {
  if (before === after) return tokens;
  const byId = new Map(after.map((definition) => [definition.id, definition]));
  const deleted = new Set(before.filter(({ id }) => !byId.has(id)).map(({ id }) => id));
  const next = holdersOverDefinitions(tokens, byId, deleted);
  return next === tokens ? tokens : [...next];
}

function holdersOverDefinitions<H extends ConditionHolder>(
  holders: readonly H[],
  byId: ReadonlyMap<string, ConditionDefinitionDto>,
  deleted: ReadonlySet<string>,
): readonly H[] {
  const next = holders.map((holder) => holderOverDefinitions(holder, byId, deleted));
  return next.some((holder, index) => holder !== holders[index]) ? next : holders;
}

function holderOverDefinitions<H extends ConditionHolder>(
  holder: H,
  byId: ReadonlyMap<string, ConditionDefinitionDto>,
  deleted: ReadonlySet<string>,
): H {
  const kept = holder.conditions.filter(({ conditionId }) => !deleted.has(conditionId));
  const shown = kept.map((condition) =>
    conditionShowing(condition, byId.get(condition.conditionId)),
  );
  const same =
    shown.length === holder.conditions.length &&
    shown.every((condition, index) => condition === holder.conditions[index]);
  return same ? holder : { ...holder, conditions: shown };
}

function conditionShowing(
  condition: ActiveConditionDto,
  definition: ConditionDefinitionDto | undefined,
): ActiveConditionDto {
  if (!definition || showsDefinition(condition, definition)) return condition;
  const { name, tone, icon, color, look, description, maxStacks, imageAssetId } = definition;
  const stacks = stacksWithin(condition.stacks, maxStacks);
  const shown = { name, tone, icon, color, look, description, maxStacks, imageAssetId };
  return { ...condition, ...shown, stacks };
}

function stacksWithin(stacks: number, maxStacks: number | null): number {
  return maxStacks === null ? 1 : Math.min(stacks, maxStacks);
}

function showsDefinition(
  condition: ActiveConditionDto,
  definition: ConditionDefinitionDto,
): boolean {
  return (
    condition.name === definition.name &&
    condition.tone === definition.tone &&
    condition.icon === definition.icon &&
    condition.color === definition.color &&
    condition.look === definition.look &&
    condition.description === definition.description &&
    condition.maxStacks === definition.maxStacks &&
    condition.imageAssetId === definition.imageAssetId &&
    condition.stacks === stacksWithin(condition.stacks, definition.maxStacks)
  );
}
