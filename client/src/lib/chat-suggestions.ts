import { searchText } from './search-text';

/** What the composer's list offers for the text before the caret: the `/` commands while the
 *  command itself is typed (the field starts with `/`, no space yet), the memes and smileys after
 *  a `:` and two letters that start a word, or the members after an `@` that starts a word.
 *  `from`/`to` are what accepting replaces. */
export type SuggestionQuery = Readonly<{
  kind: 'command' | 'emote' | 'member';
  typed: string;
  from: number;
  to: number;
}>;

/** Someone an `@` may call. */
export type MentionableMember = Readonly<{ userId: string; name: string; username: string }>;

const COMMAND_TYPED = /^\/(\S*)$/u;
const MENTION_TYPED = /(?:^|\s)@([^\s@]*)$/u;
// Two letters at least: a lone `:` (or `:)`, `:D`) is not asking for the list.
const EMOTE_TYPED = /(?:^|\s):([^\s:]{2,})$/u;

/** The list the text before the caret asks for; `null` when none.
 *
 *  Example: `suggestionQueryOf('oi @Bi', 6) // { kind: 'member', typed: 'Bi', from: 3, to: 6 }` */
export function suggestionQueryOf(draft: string, caret: number): SuggestionQuery | null {
  const before = draft.slice(0, caret);
  const command = COMMAND_TYPED.exec(before);
  if (command) return { kind: 'command', typed: command[1] ?? '', from: 0, to: caret };
  const emote = EMOTE_TYPED.exec(before);
  if (emote) return wordQuery('emote', emote[1] ?? '', caret);
  const mention = MENTION_TYPED.exec(before);
  return mention ? wordQuery('member', mention[1] ?? '', caret) : null;
}

// The typed word and its one-character mark (`:` or `@`) are what accepting replaces.
function wordQuery(kind: 'emote' | 'member', typed: string, caret: number): SuggestionQuery {
  return { kind, typed, from: caret - typed.length - 1, to: caret };
}

/** The members with a word of the nickname, or the @, starting with what was typed (no accent,
 *  no case), in the given order.
 *
 *  Example: `suggestMembers(contacts, 'b').map((each) => each.name) // ['Bia', 'Beatriz']` */
export function suggestMembers<Member extends MentionableMember>(
  members: readonly Member[],
  typed: string,
): Member[] {
  const folded = searchText(typed);
  return members.filter((member) => wordsOf(member).some((word) => word.startsWith(folded)));
}

/** How an `@` names someone: the nickname when it is one word (what `mentionsAny` matches),
 *  else the @, which never has a space.
 *
 *  Example: `mentionTextOf({ name: 'Ana Clara', username: 'anaclara' }) // '@anaclara'` */
export function mentionTextOf(member: Pick<MentionableMember, 'name' | 'username'>): string {
  return /^\S+$/u.test(member.name) ? `@${member.name}` : `@${member.username}`;
}

/** The field after accepting a suggestion, and where the caret goes.
 *
 *  Example: `withSuggestion('/at', { kind: 'command', typed: 'at', from: 0, to: 3 }, '/ataque') // { draft: '/ataque', caret: 7 }` */
export function withSuggestion(
  draft: string,
  query: SuggestionQuery,
  insert: string,
): Readonly<{ draft: string; caret: number }> {
  return {
    draft: draft.slice(0, query.from) + insert + draft.slice(query.to),
    caret: query.from + insert.length,
  };
}

function wordsOf(member: MentionableMember): string[] {
  return [...searchText(member.name).split(/\s+/u), searchText(member.username)];
}
