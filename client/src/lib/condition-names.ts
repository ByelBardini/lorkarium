import type { ConditionDefinitionDto } from '@lorkarium/contracts';

/** How a condition name is compared: no case, no accent, no outer spaces ("caido" is "Caído").
 *
 *  Example: `conditionKey('  Caído ') // 'caido'` */
export function conditionKey(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** The table's condition with that name, typed any way, or `undefined` when it is a new name.
 *
 *  Example: `findConditionByName(definitions, 'envenenado')?.id` */
export function findConditionByName(
  definitions: readonly ConditionDefinitionDto[],
  name: string,
): ConditionDefinitionDto | undefined {
  const wanted = conditionKey(name);
  if (wanted === '') return undefined;
  return definitions.find((definition) => conditionKey(definition.name) === wanted);
}

/** The conditions that fit what was typed: the ones starting with it first, then the ones that
 *  contain it, each part by name. Nothing typed lists them all.
 *
 *  Example: `conditionSuggestions(definitions, 'ven').map(({ name }) => name) // ['Envenenado']` */
export function conditionSuggestions(
  definitions: readonly ConditionDefinitionDto[],
  typed: string,
): ConditionDefinitionDto[] {
  const wanted = conditionKey(typed);
  const byName = [...definitions].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const starting = byName.filter((definition) => conditionKey(definition.name).startsWith(wanted));
  const containing = byName.filter((definition) => {
    const key = conditionKey(definition.name);
    return !key.startsWith(wanted) && key.includes(wanted);
  });
  return [...starting, ...containing];
}
