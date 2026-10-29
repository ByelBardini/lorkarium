import type { SavedRollDto } from '@lorkarium/contracts';
import { searchText } from './search-text';

/** The commands of the composer itself; a saved roll never takes their name. */
export const FIXED_CHAT_COMMANDS = ['r', 'gr', 'w'] as const;

export type FixedChatCommand = (typeof FIXED_CHAT_COMMANDS)[number];

/** One line of the `/` list: a fixed command (with how to use it) or a saved roll by its slug. */
export type ChatCommandEntry =
  | Readonly<{ kind: 'fixed'; command: FixedChatCommand; usage: string; description: string }>
  | Readonly<{ kind: 'saved'; command: string; savedRoll: SavedRollDto }>;

/** Where the composer is: rolls and whispers exist only at the Table, rolls not for a spectator. */
export type ChatCommandScope = Readonly<{ canRoll: boolean; atTable: boolean }>;

const FIXED_ENTRIES: readonly Extract<ChatCommandEntry, { kind: 'fixed' }>[] = [
  { kind: 'fixed', command: 'r', usage: '/r 1d20+5', description: 'Rolar para a mesa' },
  { kind: 'fixed', command: 'gr', usage: '/gr 1d20', description: 'Rolar só para o mestre' },
  { kind: 'fixed', command: 'w', usage: '/w Nome texto', description: 'Sussurrar para alguém' },
];

const ROLL_COMMANDS: ReadonlySet<string> = new Set<FixedChatCommand>(['r', 'gr']);

/** The command of a saved roll's name: no accent, no case, `º`/`ª` as letters (NFKD), words
 *  joined by hyphens; `''` when nothing is left (the roll then has no command).
 *
 *  Example: `savedRollSlugOf('Bola de fogo') // 'bola-de-fogo'` */
export function savedRollSlugOf(name: string): string {
  return searchText(name.normalize('NFKD'))
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/** Each saved roll by its command. A slug of a fixed command (`r`, `gr`, `w`) loses to it, and
 *  two rolls with one slug leave it to the oldest (the list comes oldest first).
 *
 *  Example: `savedRollCommandsOf(savedRolls).get('ataque')?.name // 'Ataque'` */
export function savedRollCommandsOf(
  savedRolls: readonly SavedRollDto[],
): ReadonlyMap<string, SavedRollDto> {
  const commands = new Map<string, SavedRollDto>();
  for (const savedRoll of savedRolls) {
    const slug = savedRollSlugOf(savedRoll.name);
    if (slug === '' || isFixedCommand(slug) || commands.has(slug)) continue;
    commands.set(slug, savedRoll);
  }
  return commands;
}

/** The `/` list of this composer: the fixed commands it may use, then its saved rolls.
 *
 *  Example: `chatCommandCatalogOf(savedRolls, { canRoll: true, atTable: true })[0].command // 'r'` */
export function chatCommandCatalogOf(
  savedRolls: readonly SavedRollDto[],
  scope: ChatCommandScope,
): readonly ChatCommandEntry[] {
  if (!scope.atTable) return [];
  const fixed = FIXED_ENTRIES.filter((entry) => scope.canRoll || !ROLL_COMMANDS.has(entry.command));
  if (!scope.canRoll) return fixed;
  const saved = [...savedRollCommandsOf(savedRolls)].map(
    ([command, savedRoll]): ChatCommandEntry => ({ kind: 'saved', command, savedRoll }),
  );
  return [...fixed, ...saved];
}

/** The entries for what was typed after the `/`: a command starting with it, or a saved roll
 *  with a word of its name starting with it (no accent, no case).
 *
 *  Example: `suggestChatCommands(catalog, 'fogo')` lists `/bola-de-fogo` */
export function suggestChatCommands(
  catalog: readonly ChatCommandEntry[],
  typed: string,
): readonly ChatCommandEntry[] {
  const folded = searchText(typed.trim());
  return catalog.filter((entry) => wordsOf(entry).some((word) => word.startsWith(folded)));
}

/** Whether `command` is one of the composer's own (`r`, `gr`, `w`).
 *
 *  Example: `isFixedCommand('gr') // true` */
export function isFixedCommand(command: string): command is FixedChatCommand {
  return (FIXED_CHAT_COMMANDS as readonly string[]).includes(command);
}

function wordsOf(entry: ChatCommandEntry): string[] {
  if (entry.kind === 'fixed') return [entry.command];
  return [entry.command, ...entry.command.split('-')];
}
