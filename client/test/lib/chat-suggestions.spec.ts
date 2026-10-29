import { describe, expect, it } from 'vitest';
import {
  mentionTextOf,
  suggestionQueryOf,
  suggestMembers,
  withSuggestion,
} from '@/lib/chat-suggestions';

const BIA = { userId: 'bia', name: 'Bia', username: 'bia' };
const BEATRIZ = { userId: 'bea', name: 'Beatriz', username: 'bea' };
const ANA_CLARA = { userId: 'ana', name: 'Ana Clara', username: 'anaclara' };
const CAIO = { userId: 'caio', name: 'Caio', username: 'caiao' };

describe('chat suggestions', () => {
  it.each([
    ['/', 1, { kind: 'command', typed: '', from: 0, to: 1 }],
    ['/ata', 4, { kind: 'command', typed: 'ata', from: 0, to: 4 }],
    ['oi @Bi', 6, { kind: 'member', typed: 'Bi', from: 3, to: 6 }],
    ['@', 1, { kind: 'member', typed: '', from: 0, to: 1 }],
  ])('"%s" with the caret at %i asks for %o', (draft, caret, expected) => {
    expect(suggestionQueryOf(draft, caret)).toEqual(expected);
  });

  it.each([
    ['/r 1d20', 7],
    ['oi', 2],
    ['x@bia', 5],
    ['@Bia oi', 7],
    ['texto /r', 8],
  ])('"%s" with the caret at %i asks for nothing', (draft, caret) => {
    expect(suggestionQueryOf(draft, caret)).toBeNull();
  });

  it('a command typed before the caret is read up to the caret only', () => {
    expect(suggestionQueryOf('/atax', 3)).toEqual({ kind: 'command', typed: 'at', from: 0, to: 3 });
  });

  it('members match by a word of the nickname or by the @, without accent or case', () => {
    const members = [BIA, BEATRIZ, ANA_CLARA, CAIO];
    expect(suggestMembers(members, 'b').map(({ userId }) => userId)).toEqual(['bia', 'bea']);
    expect(suggestMembers(members, 'CLA').map(({ userId }) => userId)).toEqual(['ana']);
    expect(suggestMembers(members, 'caia').map(({ userId }) => userId)).toEqual(['caio']);
    expect(suggestMembers(members, 'z')).toEqual([]);
  });

  it('the mention of a one-word nickname is the nickname, of a longer one the @', () => {
    expect(mentionTextOf(BIA)).toBe('@Bia');
    expect(mentionTextOf(ANA_CLARA)).toBe('@anaclara');
  });

  it('accepting replaces what was typed and puts the caret after the insertion', () => {
    const query = { kind: 'member', typed: 'Bi', from: 3, to: 6 } as const;
    expect(withSuggestion('oi @Bi, tudo?', query, '@Bia ')).toEqual({
      draft: 'oi @Bia , tudo?',
      caret: 8,
    });
  });
});
