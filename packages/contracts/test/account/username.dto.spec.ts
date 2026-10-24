import { describe, expect, it } from 'vitest';
import { memberColorDto, usernameDto } from '../../src/account/username.dto';

function messagesOf(input: unknown): string[] {
  const result = usernameDto.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.message);
}

describe('usernameDto', () => {
  it('" Bia.Rola " is trimmed and lowercased to "bia.rola"', () => {
    expect(usernameDto.parse(' Bia.Rola ')).toBe('bia.rola');
  });

  it('"a_b.9" of 5 characters in the format is accepted as sent', () => {
    expect(usernameDto.parse('a_b.9')).toBe('a_b.9');
  });

  it('"ab" is refused citing the size of 3 to 20', () => {
    expect(messagesOf('ab')).toEqual(['Username "ab" is too short: expected 3 to 20 characters.']);
  });

  it('21 characters are refused citing the size of 3 to 20', () => {
    expect(messagesOf('a'.repeat(21))).toEqual([
      `Username "${'a'.repeat(21)}" is too long: expected 3 to 20 characters.`,
    ]);
  });

  it('exactly 20 characters are accepted', () => {
    expect(usernameDto.safeParse('a'.repeat(20)).success).toBe(true);
  });

  it('"bia!" is refused citing the format a-z 0-9 . _', () => {
    expect(messagesOf('bia!')).toEqual([
      'Username "bia!" has a character out of the format: expected only a-z 0-9 . _',
    ]);
  });
});

describe('memberColorDto', () => {
  it('lists the 8 names in the order of the ping palette', () => {
    expect(memberColorDto.options).toEqual([
      'gold',
      'steel',
      'ember',
      'moss',
      'violet',
      'rose',
      'teal',
      'bone',
    ]);
  });

  it('a hex instead of a name is refused', () => {
    expect(memberColorDto.safeParse('#e0b25c').success).toBe(false);
  });
});
