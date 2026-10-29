import { useId, useState } from 'react';
import { suggestChatCommands, type ChatCommandEntry } from '@/lib/chat-commands-catalog';
import type { ChatInputMember } from '@/lib/chat-input';
import {
  mentionTextOf,
  suggestionQueryOf,
  suggestMembers,
  withSuggestion,
  type SuggestionQuery,
} from '@/lib/chat-suggestions';

/** One line of the list: what it shows, and what accepting writes in place of what was typed. */
export type ComposerSuggestion = Readonly<{
  value: string;
  insert: string;
  description: string;
}>;

export type ComposerSuggestionsInput = Readonly<{
  draft: string;
  caret: number;
  /** The `/` list of this composer (`chatCommandCatalogOf`). */
  catalog: readonly ChatCommandEntry[];
  /** Who `@` may call (the others, online first). */
  members: readonly ChatInputMember[];
  /** Writes the field after a suggestion is taken, with the caret after it. */
  onAccept: (draft: string, caret: number) => void;
}>;

export type ComposerSuggestionsState = Readonly<{
  listId: string;
  options: readonly ComposerSuggestion[];
  /** The option under the arrows, for `aria-activedescendant`; `undefined` when closed. */
  activeId: string | undefined;
  active: number;
  open: boolean;
  /** The field's keys while the list is open; answers whether it took the key. */
  onKey: (event: React.KeyboardEvent) => boolean;
  /** Typing again opens a list closed by Esc. */
  reopen: () => void;
  accept: (index: number) => void;
}>;

/** The autocomplete of the field: the commands and saved rolls after a leading `/`, the people
 *  after an `@`. ↑/↓ move, Enter or Tab take, Esc closes until the next keystroke.
 *
 *  Example: `const suggestions = useComposerSuggestions({ draft, caret, catalog, members, onAccept })` */
export function useComposerSuggestions(input: ComposerSuggestionsInput): ComposerSuggestionsState {
  const listId = useId();
  const [dismissed, setDismissed] = useState(false);
  const [moved, setMoved] = useState({ key: '', index: 0 });
  const query = suggestionQueryOf(input.draft, input.caret);
  const options = query === null ? [] : optionsOf(query, input);
  const key = query === null ? '' : `${query.kind}:${query.typed}`;
  const active = moved.key === key ? Math.min(moved.index, options.length - 1) : 0;
  const open = !dismissed && options.length > 0;
  const accept = (index: number) => {
    const option = options[index];
    if (query === null || option === undefined) return;
    const next = withSuggestion(input.draft, query, option.insert);
    input.onAccept(next.draft, next.caret);
    // A saved roll stays a match of itself: the next Enter must send it, not take it again.
    setDismissed(true);
  };
  const move = (step: number) =>
    setMoved({ key, index: (active + step + options.length) % options.length });
  const onKey = (event: React.KeyboardEvent) =>
    open &&
    handleKey(event, { move, accept: () => accept(active), close: () => setDismissed(true) });
  const activeId = open ? optionIdOf(listId, active) : undefined;
  return {
    listId,
    options,
    activeId,
    active,
    open,
    onKey,
    reopen: () => setDismissed(false),
    accept,
  };
}

type KeyActions = Readonly<{ move: (step: number) => void; accept: () => void; close: () => void }>;

function handleKey(event: React.KeyboardEvent, actions: KeyActions): boolean {
  if (event.key === 'ArrowDown') actions.move(1);
  else if (event.key === 'ArrowUp') actions.move(-1);
  else if (event.key === 'Enter' || event.key === 'Tab') actions.accept();
  else if (event.key === 'Escape') actions.close();
  else return false;
  event.preventDefault();
  // Esc closes only the list, never the sheet or the dialog around the chat.
  event.stopPropagation();
  return true;
}

function optionsOf(
  query: SuggestionQuery,
  input: ComposerSuggestionsInput,
): readonly ComposerSuggestion[] {
  if (query.kind === 'command')
    return suggestChatCommands(input.catalog, query.typed).map(commandOption);
  return suggestMembers(input.members, query.typed).map((member) => {
    const mention = mentionTextOf(member);
    return { value: mention, insert: `${mention} `, description: member.name };
  });
}

function commandOption(entry: ChatCommandEntry): ComposerSuggestion {
  const value = `/${entry.command}`;
  if (entry.kind === 'saved') return { value, insert: value, description: entry.savedRoll.name };
  return { value, insert: `${value} `, description: `${entry.usage} · ${entry.description}` };
}

/** The DOM id of the option at `index` of the list `listId`.
 *
 *  Example: `optionIdOf(listId, 0)` */
export function optionIdOf(listId: string, index: number): string {
  return `${listId}-${index}`;
}
