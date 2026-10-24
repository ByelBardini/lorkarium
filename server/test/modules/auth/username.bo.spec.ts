import { describe, expect, it } from 'vitest';
import {
  uniqueUsername,
  usernameFromEmail,
  usernameLookupPrefix,
} from '../../../src/modules/auth/username.bo';

const NONE: ReadonlySet<string> = new Set();
const LONG_LOCAL = 'abcdefghijklmnopqrstuvwxy'; // 25 characters

describe('usernameFromEmail', () => {
  it.each([
    ['bia@lorkarium.dev', 'bia'],
    ['Ana.B+rpg@x.com', 'ana.b'],
    ['a@x.com', 'a.rpg'],
    ['+@x.com', 'jogador'],
    ['jo-silva!@x.com', 'josilva'],
    ['under_score@x.com', 'under_score'],
  ])('%s with nothing taken → %s', (email, expected) => {
    expect(usernameFromEmail(email, NONE)).toBe(expected);
  });

  it('with bia taken the next account is bia2, and with bia and bia2 it is bia3', () => {
    expect(usernameFromEmail('bia@x.com', new Set(['bia']))).toBe('bia2');
    expect(usernameFromEmail('Bia@outro.com', new Set(['bia', 'bia2']))).toBe('bia3');
  });

  it('a local part of 25 is cut to 20, and to 19 when the suffix 2 has to fit', () => {
    expect(usernameFromEmail(`${LONG_LOCAL}@x.com`, NONE)).toBe('abcdefghijklmnopqrst');
    const taken = new Set(['abcdefghijklmnopqrst']);
    expect(usernameFromEmail(`${LONG_LOCAL}@x.com`, taken)).toBe('abcdefghijklmnopqrs2');
  });
});

describe('uniqueUsername', () => {
  it('a two-digit suffix takes two characters of a full stem', () => {
    const taken = new Set([
      'abcdefghijklmnopqrst',
      ...range(2, 9).map((n) => `abcdefghijklmnopqrs${n}`),
    ]);
    expect(uniqueUsername(LONG_LOCAL, taken)).toBe('abcdefghijklmnopqr10');
  });
});

describe('usernameLookupPrefix', () => {
  it('a long stem is looked up by its first 15 characters, a short one whole', () => {
    expect(usernameLookupPrefix(LONG_LOCAL)).toBe('abcdefghijklmno');
    expect(usernameLookupPrefix('bia')).toBe('bia');
  });
});

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, offset) => from + offset);
}
