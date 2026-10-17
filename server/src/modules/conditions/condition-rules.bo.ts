import type { NewConditionDefinition } from './conditions.po';

/** The list every table starts with (spec §3.7): generic names, no rule attached. The master
 *  adds more by name; the migration `0004_conditions` gave it to the tables that already existed
 *  and `0009_condition_icons` their icons. */
export const DEFAULT_CONDITIONS: readonly NewConditionDefinition[] = [
  { name: 'Abençoado', tone: 'benefit', icon: 'sparkles' },
  { name: 'Concentrando', tone: 'benefit', icon: 'crosshair' },
  { name: 'Invisível', tone: 'benefit', icon: 'ghost' },
  { name: 'Agarrado', tone: 'harm', icon: 'hand' },
  { name: 'Amedrontado', tone: 'harm', icon: 'angry' },
  { name: 'Atordoado', tone: 'harm', icon: 'zap' },
  { name: 'Caído', tone: 'harm', icon: 'arrow-down-to-line' },
  { name: 'Cego', tone: 'harm', icon: 'eye-off' },
  { name: 'Envenenado', tone: 'harm', icon: 'flask-conical' },
  { name: 'Imobilizado', tone: 'harm', icon: 'link' },
  { name: 'Paralisado', tone: 'harm', icon: 'lock' },
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
