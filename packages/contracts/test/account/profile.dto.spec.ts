import { describe, expect, it } from 'vitest';
import { updateProfileRequestDto } from '../../src/account/profile.dto';

function issuesOf(input: unknown): { path: string; message: string }[] {
  const result = updateProfileRequestDto.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    path: [...issue.path, ...('keys' in issue ? issue.keys : [])].join('.'),
    message: issue.message,
  }));
}

describe('updateProfileRequestDto', () => {
  it('a name with spaces around is trimmed', () => {
    expect(updateProfileRequestDto.parse({ name: '  Ana Rola ' })).toEqual({ name: 'Ana Rola' });
  });

  it('a name of only spaces is refused on the name path', () => {
    expect(issuesOf({ name: '   ' }).map(({ path }) => path)).toEqual(['name']);
  });

  it('a name of 32 characters is accepted and 33 are refused', () => {
    expect(updateProfileRequestDto.safeParse({ name: 'a'.repeat(32) }).success).toBe(true);
    expect(issuesOf({ name: 'a'.repeat(33) }).map(({ path }) => path)).toEqual(['name']);
  });

  it('a bio is trimmed and kept', () => {
    expect(updateProfileRequestDto.parse({ bio: ' Mestre de Vharn. ' })).toEqual({
      bio: 'Mestre de Vharn.',
    });
  });

  it('an empty bio clears it to null', () => {
    expect(updateProfileRequestDto.parse({ bio: '   ' })).toEqual({ bio: null });
  });

  it('a bio of 190 characters is accepted and 191 are refused', () => {
    expect(updateProfileRequestDto.safeParse({ bio: 'b'.repeat(190) }).success).toBe(true);
    expect(issuesOf({ bio: 'b'.repeat(191) }).map(({ path }) => path)).toEqual(['bio']);
  });

  it('color null goes back to the automatic color', () => {
    expect(updateProfileRequestDto.parse({ color: null })).toEqual({ color: null });
  });

  it('a color out of the 8 names is refused on the color path', () => {
    expect(issuesOf({ color: 'black' }).map(({ path }) => path)).toEqual(['color']);
  });

  it('an empty body is refused with "at least one of name, color, bio"', () => {
    expect(issuesOf({})).toEqual([
      {
        path: '',
        message:
          'Empty profile update: expected at least one of name, color, bio, diceNumberColor.',
      },
    ]);
  });

  it('a username in the body is refused because the @ is immutable (strict)', () => {
    expect(issuesOf({ name: 'Ana', username: 'ana2' }).map(({ path }) => path)).toEqual([
      'username',
    ]);
  });

  it('a dice number color in capitals is kept in lowercase', () => {
    expect(updateProfileRequestDto.parse({ diceNumberColor: '#FFAA00' })).toEqual({
      diceNumberColor: '#ffaa00',
    });
  });

  it('a null dice number color goes back to the automatic one', () => {
    expect(updateProfileRequestDto.parse({ diceNumberColor: null })).toEqual({
      diceNumberColor: null,
    });
  });

  it('a short hex dice number color is refused on its path', () => {
    expect(issuesOf({ diceNumberColor: '#fff' }).map(({ path }) => path)).toEqual([
      'diceNumberColor',
    ]);
  });
});
