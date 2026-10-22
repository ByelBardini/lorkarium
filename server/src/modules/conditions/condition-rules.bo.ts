import type { NewConditionDefinition } from './conditions.po';

/** The list every table starts with (spec §3.7): generic names, no rule attached. The master
 *  adds more by name; the migration `0004_conditions` gave it to the tables that already existed,
 *  `0009_condition_icons` their icons and `0030_condition_looks` the incapacitating tone and the
 *  looks. */
export const DEFAULT_CONDITIONS: readonly NewConditionDefinition[] = [
  { name: 'Abençoado', tone: 'benefit', icon: 'sparkles', look: null },
  { name: 'Concentrando', tone: 'benefit', icon: 'crosshair', look: null },
  { name: 'Invisível', tone: 'benefit', icon: 'ghost', look: 'invisible' },
  { name: 'Agarrado', tone: 'harm', icon: 'hand', look: null },
  { name: 'Amedrontado', tone: 'harm', icon: 'angry', look: null },
  { name: 'Atordoado', tone: 'incapacitating', icon: 'zap', look: null },
  { name: 'Caído', tone: 'harm', icon: 'arrow-down-to-line', look: null },
  { name: 'Cego', tone: 'harm', icon: 'eye-off', look: null },
  { name: 'Envenenado', tone: 'harm', icon: 'flask-conical', look: null },
  { name: 'Imobilizado', tone: 'harm', icon: 'link', look: null },
  { name: 'Paralisado', tone: 'incapacitating', icon: 'lock', look: null },
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
