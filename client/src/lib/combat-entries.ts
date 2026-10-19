import type {
  BoardStateDto,
  CombatantDto,
  CombatDto,
  CombatEntryInput,
  TokenDto,
} from '@lorkarium/contracts';

/** The name the start gives the enemies that act together. */
export const ENEMIES_ENTRY_NAME = 'Inimigos';

/** How "Iniciar combate" groups: the enemies in one entry, but those with an initiative of their own. */
export type StartGrouping = Readonly<{
  enemiesTogether: boolean;
  ownInitiativeIds: readonly string[];
}>;

/** What an unnamed entry reads when this viewer sees none of its tokens. */
export const OUT_OF_SIGHT_LABEL = 'Fora de vista';

/** One unnamed initiative entry per token: "each on its own turn".
 *
 *  Example: `commands.addCombatants(campaignId, soloEntriesOf([goblinId, wolfId]))` */
export function soloEntriesOf(tokenIds: readonly string[]): CombatEntryInput[] {
  return tokenIds.map((tokenId) => ({ name: null, tokenIds: [tokenId] }));
}

/** The tokens of the entry this viewer sees whole, by name; pass the seen tokens, never
 *  `board.tokens`, so a hidden token is never named.
 *
 *  Example: `entryTokensOf(entry, seenTokensOf(board, sight)).map(({ name }) => name)` */
export function entryTokensOf(entry: CombatantDto, seenTokens: readonly TokenDto[]): TokenDto[] {
  return seenTokens
    .filter(({ id }) => entry.tokenIds.includes(id))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** The master's name, else the seen tokens ("Kael", "Goblin e mais 1"), else "Fora de vista".
 *
 *  Example: `entryLabelOf(entry, seenTokens) // 'Inimigos'` */
export function entryLabelOf(entry: CombatantDto, seenTokens: readonly TokenDto[]): string {
  if (entry.name) return entry.name;
  const [first, ...others] = entryTokensOf(entry, seenTokens);
  if (!first) return OUT_OF_SIGHT_LABEL;
  return others.length === 0 ? first.name : `${first.name} e mais ${others.length}`;
}

/** Whether this viewer sets the initiative and passes the turn of the entry: the master always; a
 *  player only with control of every token of it, and never of an entry without tokens.
 *
 *  Example: `canRunEntry(entry, board.tokens, isMaster)` */
export function canRunEntry(
  entry: CombatantDto,
  tokens: readonly TokenDto[],
  isMaster: boolean,
): boolean {
  if (isMaster) return true;
  if (entry.tokenIds.length === 0) return false;
  return entry.tokenIds.every((id) => tokens.find((token) => token.id === id)?.canControl === true);
}

/** The tokens of the entry on turn (all of them wear the ring), or none.
 *
 *  Example: `turnTokenIdsOf(board).includes(token.id)` */
export function turnTokenIdsOf(board: BoardStateDto | null): readonly string[] {
  const combat = board?.combat;
  const current = combat?.combatants.find(({ id }) => id === combat.currentCombatantId);
  return current?.tokenIds ?? [];
}

/** The entry that holds the token, or `null` when it is out of the combat.
 *
 *  Example: `entryOfToken(board.combat, goblinId)?.id` */
export function entryOfToken(combat: CombatDto | null, tokenId: string): CombatantDto | null {
  return combat?.combatants.find(({ tokenIds }) => tokenIds.includes(tokenId)) ?? null;
}

/** The tokens that can enter a combat: the tokens layer (Objetos and Fundo stay out).
 *
 *  Example: `combatCandidatesOf(board.tokens).map(({ name }) => name)` */
export function combatCandidatesOf(tokens: readonly TokenDto[]): TokenDto[] {
  return tokens.filter(({ layer }) => layer === 'tokens');
}

/** The entries of "Iniciar combate", in the order of `tokens`: the enemies without an initiative of
 *  their own become "Inimigos" where the first of them was; a group of one is a plain entry; the
 *  rest enter one each. Grouping by side is the screen's shortcut: the server only sees entries.
 *
 *  Example: `startEntriesOf(chosen, { enemiesTogether: true, ownInitiativeIds: [bossId] })` */
export function startEntriesOf(
  tokens: readonly TokenDto[],
  grouping: StartGrouping,
): CombatEntryInput[] {
  const grouped = grouping.enemiesTogether
    ? tokens.filter(({ id, side }) => side === 'enemy' && !grouping.ownInitiativeIds.includes(id))
    : [];
  if (grouped.length < 2) return soloEntriesOf(tokens.map(({ id }) => id));
  const groupedIds = grouped.map(({ id }) => id);
  return tokens.flatMap(({ id }): CombatEntryInput[] => {
    if (!groupedIds.includes(id)) return [{ name: null, tokenIds: [id] }];
    return id === groupedIds[0] ? [{ name: ENEMIES_ENTRY_NAME, tokenIds: groupedIds }] : [];
  });
}
