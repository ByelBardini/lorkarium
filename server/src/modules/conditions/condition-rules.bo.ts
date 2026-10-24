import { ConditionNameTakenError, ConditionStacksError } from './conditions.error';
import type { NewConditionDefinition } from './conditions.po';

/** The list every table starts with (spec §3.7): generic names, no rule attached. The master
 *  adds more by name; the migration `0004_conditions` gave it to the tables that already existed,
 *  `0009_condition_icons` their icons and `0030_condition_looks` the incapacitating tone and the
 *  looks. */
export const DEFAULT_CONDITIONS: readonly NewConditionDefinition[] = [
  defaultOf('Abençoado', 'benefit', 'sparkles'),
  defaultOf('Concentrando', 'benefit', 'crosshair'),
  defaultOf('Invisível', 'benefit', 'ghost', 'invisible'),
  defaultOf('Agarrado', 'harm', 'hand'),
  defaultOf('Amedrontado', 'harm', 'angry'),
  defaultOf('Atordoado', 'incapacitating', 'zap'),
  defaultOf('Caído', 'harm', 'arrow-down-to-line'),
  defaultOf('Cego', 'harm', 'eye-off'),
  defaultOf('Envenenado', 'harm', 'flask-conical'),
  defaultOf('Imobilizado', 'harm', 'link'),
  defaultOf('Paralisado', 'incapacitating', 'lock'),
];

/** What a definition must show for the name check: who it is, whose and what it is called. */
export type NamedDefinition = Readonly<{ id: string; campaignId: string; name: string }>;

/** What the stacks check reads of an active condition: which one and its definition's cap. */
export type StackedCondition = Readonly<{ id: string; maxStacks: number | null }>;

export type DefineDecision<D> =
  Readonly<{ kind: 'create' }> | Readonly<{ kind: 'reuse'; definition: D }>;

/** The rules of a condition (spec §3.7): applying "0 rounds" means it lasts until removed,
 *  defining a name the list already has reuses it, renaming into one refuses, and restoring
 *  brings back only the defaults whose name is missing (names compare like the unique index:
 *  without case). A stacking condition applied again piles up one more, up to its `maxStacks`.
 *
 *  Example: `new ConditionRulesBo().durationOf(command.rounds) // null for 0` */
export class ConditionRulesBo {
  durationOf(rounds: number): number | null {
    return rounds === 0 ? null : rounds;
  }

  defineOrReuse<D>(existing: D | undefined): DefineDecision<D> {
    return existing ? { kind: 'reuse', definition: existing } : { kind: 'create' };
  }

  /** Example: `RULES.missingDefaults(definitions.map((d) => d.name)) // [] when none is missing` */
  missingDefaults(existingNames: readonly string[]): NewConditionDefinition[] {
    const taken = new Set(existingNames.map(nameKeyOf));
    return DEFAULT_CONDITIONS.filter((condition) => !taken.has(nameKeyOf(condition.name)));
  }

  /** `sameName` is the definition the table has under the wanted name (any case), if any.
   *
   *  Example: `RULES.requireNameFree(command.conditionId, await dao.findDefinitionByName(campaignId, command.name))` */
  requireNameFree(conditionId: string, sameName: NamedDefinition | undefined): void {
    if (!sameName || sameName.id === conditionId) return;
    throw new ConditionNameTakenError(sameName.campaignId, sameName.name, sameName.id);
  }

  /** `current` is the stacks the token already has of it (`null` = it does not have it yet):
   *  applying again adds one, up to `maxStacks`; a condition that does not stack stays at 1.
   *
   *  Example: `RULES.stacksAfterApply(3, 3) // 3, at the cap it stays` */
  stacksAfterApply(current: number | null, maxStacks: number | null): number {
    if (current === null) return 1;
    return Math.min(current + 1, stacksCeilingOf(maxStacks));
  }

  /** The most stacks the active conditions of a definition may keep: what editing it clamps to.
   *
   *  Example: `RULES.stacksCeilingOf(null) // 1` */
  stacksCeilingOf(maxStacks: number | null): number {
    return stacksCeilingOf(maxStacks);
  }

  /** Example: `RULES.requireStacksWithin(active, command.stacks) // throws INVALID_STACKS above maxStacks` */
  requireStacksWithin(active: StackedCondition, stacks: number): void {
    const ceiling = stacksCeilingOf(active.maxStacks);
    if (stacks >= 1 && stacks <= ceiling) return;
    throw new ConditionStacksError(active.id, stacks, ceiling);
  }
}

// The defaults have no description, no color and none stacks: the master writes and sets those.
function defaultOf(
  name: string,
  tone: NewConditionDefinition['tone'],
  icon: NewConditionDefinition['icon'],
  look: NewConditionDefinition['look'] = null,
): NewConditionDefinition {
  return { name, tone, icon, look, color: null, description: '', maxStacks: null };
}

// A condition that does not stack (`maxStacks: null`) only ever has the one.
function stacksCeilingOf(maxStacks: number | null): number {
  return maxStacks ?? 1;
}

// What the index `condition_definitions_campaign_name_unique` compares: `lower(name)`.
function nameKeyOf(name: string): string {
  return name.toLowerCase();
}
