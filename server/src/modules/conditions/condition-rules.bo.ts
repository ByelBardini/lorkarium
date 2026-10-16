import type { NewConditionDefinition } from './conditions.po';

/** The list every table starts with (spec §3.7): generic names, no rule attached. The master
 *  adds more by name; the migration `0004_conditions` gave it to the tables that already existed. */
export const DEFAULT_CONDITIONS: readonly NewConditionDefinition[] = [
  { name: 'Abençoado', tone: 'benefit' },
  { name: 'Concentrando', tone: 'benefit' },
  { name: 'Invisível', tone: 'benefit' },
  { name: 'Agarrado', tone: 'harm' },
  { name: 'Amedrontado', tone: 'harm' },
  { name: 'Atordoado', tone: 'harm' },
  { name: 'Caído', tone: 'harm' },
  { name: 'Cego', tone: 'harm' },
  { name: 'Envenenado', tone: 'harm' },
  { name: 'Imobilizado', tone: 'harm' },
  { name: 'Paralisado', tone: 'harm' },
];

export type DefineDecision<D> =
  Readonly<{ kind: 'create' }> | Readonly<{ kind: 'reuse'; definition: D }>;

/** The rules of a condition (spec §3.7): applying "0 rounds" means it lasts until removed, and
 *  defining a name the list already has reuses it (the unique index ignores case).
 *
 *  Example: `new ConditionRulesBo().durationOf(command.rounds) // null for 0` */
export class ConditionRulesBo {
  durationOf(rounds: number): number | null {
    return rounds === 0 ? null : rounds;
  }

  defineOrReuse<D>(existing: D | undefined): DefineDecision<D> {
    return existing ? { kind: 'reuse', definition: existing } : { kind: 'create' };
  }
}
