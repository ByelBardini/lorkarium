import type { CombatDto, CombatEntryInput, TokenDto } from '@lorkarium/contracts';
import { combatCandidatesOf, entryOfToken } from './combat-entries';
import { conditionKey } from './condition-names';
import { parseInitiative } from './initiative-text';

export const ALLIES_SECTION = 'Grupo';
export const OTHERS_SECTION = 'Inimigos e outros';

/** Who a token is, ignoring its number: "Bandido 3" and "bandido #5" are the same creature. */
export type CreatureKey = Readonly<{ key: string; label: string }>;

export type PrepItem =
  | Readonly<{ kind: 'token'; token: TokenDto }>
  | Readonly<{ kind: 'group'; key: string; label: string; tokens: readonly TokenDto[] }>;

export type PrepSection = Readonly<{ title: string; items: readonly PrepItem[] }>;

/** What the master chose while preparing: who is left out, which groups act "Cada um", and the
 *  initiative typed per token id (or per `groupInitiativeKey` for a group acting together). */
export type PrepChoices = Readonly<{
  unchecked: readonly string[];
  split: readonly string[];
  initiatives: Readonly<Record<string, string>>;
}>;

export const NO_PREP_CHOICES: PrepChoices = { unchecked: [], split: [], initiatives: {} };

/** The entries to send, and the lines that start blank or carry an invalid initiative. */
export type PrepPlan = Readonly<{
  entries: readonly CombatEntryInput[];
  blankNames: readonly string[];
  invalidNames: readonly string[];
}>;

type PlannedEntry = Readonly<{ entry: CombatEntryInput; label: string; text: string }>;

const NUMBER_SUFFIX = /\s*#?\d+$/;
const NAME_LIST = new Intl.ListFormat('pt-BR', { type: 'conjunction' });

/** The creature a token name stands for: the name without its trailing number, compared with no
 *  case nor accent. Example: `creatureKeyOf('Bandido 3').label // 'Bandido'` */
export function creatureKeyOf(name: string): CreatureKey {
  const label = name.trim().replace(NUMBER_SUFFIX, '') || name.trim();
  return { key: conditionKey(label), label };
}

/** Where a group acting together keeps its initiative text in `PrepChoices.initiatives`.
 *
 *  Example: `groupInitiativeKey(creatureKeyOf('Bandido').key) // 'group:bandido'` */
export function groupInitiativeKey(groupKey: string): string {
  return `group:${groupKey}`;
}

/** The preparation lines: "Grupo" (allies, never grouped) then "Inimigos e outros", where the same
 *  creature with 2+ tokens becomes one group in the place of its first token. With a combat, only
 *  the tokens out of it (adding). Example: `prepSectionsOf(board.tokens, board.combat)` */
export function prepSectionsOf(
  tokens: readonly TokenDto[],
  combat: CombatDto | null,
): PrepSection[] {
  const free = combatCandidatesOf(tokens).filter(({ id }) => !entryOfToken(combat, id));
  const allies = free.filter(({ side }) => side === 'ally');
  const sections = [
    { title: ALLIES_SECTION, items: allies.map(tokenItem) },
    { title: OTHERS_SECTION, items: creatureItemsOf(free.filter(({ side }) => side !== 'ally')) },
  ];
  return sections.filter(({ items }) => items.length > 0);
}

/** The entries the preparation sends, in line order (allies first, so they win ties), with
 *  the initiative of each; blank goes as `null`. Example: `prepPlanOf(sections, choices).entries` */
export function prepPlanOf(sections: readonly PrepSection[], choices: PrepChoices): PrepPlan {
  const planned = sections.flatMap(({ items }) =>
    items.flatMap((item) => plannedOf(item, choices)),
  );
  const parsed = planned.map((line) => ({ ...line, value: parseInitiative(line.text) }));
  return {
    entries: parsed.map(({ entry, value }) => ({
      ...entry,
      initiative: value === 'invalid' ? null : value,
    })),
    blankNames: parsed.filter(({ value }) => value === null).map(({ label }) => label),
    invalidNames: parsed.filter(({ value }) => value === 'invalid').map(({ label }) => label),
  };
}

/** "5 na ordem", "1 na ordem" or "Ninguém na ordem". */
export function prepSummaryOf(plan: PrepPlan): string {
  if (plan.entries.length === 0) return 'Ninguém na ordem';
  return `${plan.entries.length} na ordem`;
}

/** "Kael e Lyra começam sem iniciativa", or `null` when everyone has one. */
export function blankSummaryOf(plan: PrepPlan): string | null {
  const names = plan.blankNames;
  if (names.length === 0) return null;
  const verb = names.length === 1 ? 'começa' : 'começam';
  return `${NAME_LIST.format(names)} ${verb} sem iniciativa`;
}

/** The choices with these tokens checked (in) or not (out).
 *
 *  Example: `withChecked(choices, ['kael'], false).unchecked // ['kael']` */
export function withChecked(
  choices: PrepChoices,
  tokenIds: readonly string[],
  checked: boolean,
): PrepChoices {
  const others = choices.unchecked.filter((id) => !tokenIds.includes(id));
  return { ...choices, unchecked: checked ? others : [...others, ...tokenIds] };
}

/** The choices with the group acting "Cada um" (`split`) or "Juntos". */
export function withSplit(choices: PrepChoices, groupKey: string, split: boolean): PrepChoices {
  const others = choices.split.filter((key) => key !== groupKey);
  return { ...choices, split: split ? [...others, groupKey] : others };
}

/** The choices with `text` typed as the initiative of a token id or a `groupInitiativeKey`. */
export function withInitiative(choices: PrepChoices, key: string, text: string): PrepChoices {
  return { ...choices, initiatives: { ...choices.initiatives, [key]: text } };
}

/** Every token of the sections, as "Marcar todos" checks them. */
export function prepTokenIdsOf(sections: readonly PrepSection[]): string[] {
  return sections.flatMap(({ items }) =>
    items.flatMap((item) =>
      item.kind === 'token' ? [item.token.id] : item.tokens.map(({ id }) => id),
    ),
  );
}

function tokenItem(token: TokenDto): PrepItem {
  return { kind: 'token', token };
}

/** The tokens in order, the same creature with 2+ tokens made one group in the place of its
 *  first. Example: `creatureItemsOf(enemies).map(({ kind }) => kind) // ['group', 'token']` */
export function creatureItemsOf(tokens: readonly TokenDto[]): PrepItem[] {
  const byKey = new Map<string, TokenDto[]>();
  for (const token of tokens) {
    const { key } = creatureKeyOf(token.name);
    byKey.set(key, [...(byKey.get(key) ?? []), token]);
  }
  return [...byKey.entries()].flatMap(([key, members]): PrepItem[] => {
    const [first] = members;
    if (!first) return [];
    if (members.length === 1) return [tokenItem(first)];
    return [{ kind: 'group', key, label: creatureKeyOf(first.name).label, tokens: members }];
  });
}

function plannedOf(item: PrepItem, choices: PrepChoices): PlannedEntry[] {
  const own = (token: TokenDto): PlannedEntry => soloOf(token, choices.initiatives[token.id]);
  if (item.kind === 'token') return checked([item.token], choices).map(own);
  const members = checked(item.tokens, choices);
  if (choices.split.includes(item.key)) return members.map(own);
  const text = choices.initiatives[groupInitiativeKey(item.key)];
  if (members.length === 1) return members.map((token) => soloOf(token, text));
  return members.length === 0 ? [] : [groupOf(item, members, text ?? '')];
}

function groupOf(
  item: Extract<PrepItem, { kind: 'group' }>,
  members: readonly TokenDto[],
  text: string,
): PlannedEntry {
  const tokenIds = members.map(({ id }) => id);
  return { entry: { name: item.label, tokenIds, initiative: null }, label: item.label, text };
}

function soloOf(token: TokenDto, text = ''): PlannedEntry {
  return { entry: { name: null, tokenIds: [token.id], initiative: null }, label: token.name, text };
}

function checked(tokens: readonly TokenDto[], choices: PrepChoices): TokenDto[] {
  return tokens.filter(({ id }) => !choices.unchecked.includes(id));
}
