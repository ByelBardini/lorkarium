import { searchText } from './search-text';

/** What the composer's list offers for the text before the caret: the `/` commands while the
 *  command itself is typed (the field starts with `/`, no space yet), or the members after an
 *  `@` that starts a word. `from`/`to` are what accepting replaces. */
export type SuggestionQuery = Readonly<{
  kind: 'command' | 'member';
  typed: string;
  from: number;
  to: number;
}>;

/** Someone an `@` may call. */
export type MentionableMember = Readonly<{ userId: string; name: string; username: string }>;

const COMMAND_TYPED = /^\/(\S*)$/u;
const MENTION_TYPED = /(?:^|\s)@([^\s@]*)$/u;

/** The list the text before the caret asks for; `null` when none.
 *
 *  Example: `suggestionQueryOf('oi @Bi', 6) // { kind: 'member', typed: 'Bi', from: 3, to: 6 }` */
export function suggestionQueryOf(draft: string, caret: number): SuggestionQuery | null {
  const before = draft.slice(0, caret);
  const command = COMMAND_TYPED.exec(before);
  if (command) return { kind: 'command', typed: command[1] ?? '', from: 0, to: caret };
  const mention = MENTION_TYPED.exec(before);
  if (!mention) return null;
  const typed = mention[1] ?? '';
  return { kind: 'member', typed, from: caret - typed.length - 1, to: caret };
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
