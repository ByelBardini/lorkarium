import { useEffect, useState } from 'react';
import type { ChatCommandEntry } from '@/lib/chat-commands-catalog';
import type { ChatInputMember } from '@/lib/chat-input';
import { withEmoteCode } from '@/lib/emote-input';
import { useComposerSuggestions, type ComposerSuggestionsState } from './use-composer-suggestions';

export type ComposerFieldInput = Readonly<{
  draft: string;
  setDraft: (draft: string) => void;
  /** The `/` list (empty where there are no commands, as in a friend's conversation). */
  catalog: readonly ChatCommandEntry[];
  /** Who `@` may call (empty: no `@` list). */
  members: readonly ChatInputMember[];
}>;

export type ComposerField = Readonly<{
  suggestions: ComposerSuggestionsState;
  /** The field's `onChange` after the draft: follows the caret and reopens a closed list. */
  onTyped: (field: HTMLTextAreaElement) => void;
  onSelect: (field: HTMLTextAreaElement) => void;
  /** Writes a code from "Memes e smileys" at the caret and gives the field the focus back. */
  pickEmote: (code: string) => void;
}>;

/** A message field's caret, its suggestions (`/`, `:`, `@`) and the emote picker's insert, shared
 *  by the table's chat and a friend's conversation.
 *
 *  Example: `const ref = useRef<HTMLTextAreaElement>(null); const field = useComposerField(ref, { draft, setDraft, catalog: [], members: [] })` */
export function useComposerField(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  input: ComposerFieldInput,
): ComposerField {
  const [caret, setCaret] = useState(0);
  const moveTo = (draft: string, at: number) => {
    input.setDraft(draft);
    setCaret(at);
  };
  const suggestions = useComposerSuggestions({ ...input, caret, onAccept: moveTo });
  useCaretAt(ref, caret, input.draft);
  const pickEmote = (code: string) => {
    const next = withEmoteCode(input.draft, ref.current?.selectionStart ?? caret, code);
    moveTo(next.draft, next.caret);
    ref.current?.focus();
  };
  const onTyped = (field: HTMLTextAreaElement) => {
    setCaret(field.selectionStart);
    suggestions.reopen();
  };
  return {
    suggestions,
    onTyped,
    onSelect: (field) => setCaret(field.selectionStart),
    pickEmote,
  };
}

/** The field's combobox attributes for its suggestion list.
 *
 *  Example: `<textarea aria-label="Mensagem" {...comboboxPropsOf(field.suggestions)} />` */
export function comboboxPropsOf(suggestions: ComposerSuggestionsState): ComboboxProps {
  return {
    role: 'combobox',
    'aria-expanded': suggestions.open,
    'aria-controls': suggestions.open ? suggestions.listId : undefined,
    'aria-activedescendant': suggestions.activeId,
    'aria-autocomplete': 'list',
  };
}

type ComboboxProps = Readonly<{
  role: 'combobox';
  'aria-expanded': boolean;
  'aria-controls': string | undefined;
  'aria-activedescendant': string | undefined;
  'aria-autocomplete': 'list';
}>;

// After a suggestion is taken the field's text changes under the caret: put it after the insert.
function useCaretAt(
  field: React.RefObject<HTMLTextAreaElement | null>,
  caret: number,
  draft: string,
): void {
  useEffect(() => {
    const element = field.current;
    if (!element || element.selectionStart === caret) return;
    element.setSelectionRange(caret, caret);
  }, [field, caret, draft]);
}
