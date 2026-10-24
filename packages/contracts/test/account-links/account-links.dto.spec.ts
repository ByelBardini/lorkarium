import { describe, expect, it } from 'vitest';
import { acceptInvitationRequestDto } from '../../src/account-links/account-links.dto';

const VALID = { token: 'tok', username: 'marina', password: '12345678', persistent: false };

function pathsOf(body: object): string[] {
  const result = acceptInvitationRequestDto.safeParse(body);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('acceptInvitationRequestDto', () => {
  it('normalizes the @ by the usernameDto', () => {
    expect(acceptInvitationRequestDto.parse({ ...VALID, username: ' Bia.Rola ' }).username).toBe(
      'bia.rola',
    );
  });

  it.each([
    [{ ...VALID, username: 'ab' }, 'username'],
    [{ ...VALID, password: '1234567' }, 'password'],
    [{ ...VALID, token: '' }, 'token'],
    [{ ...VALID, token: 'a'.repeat(257) }, 'token'],
    [{ token: 'tok', username: 'marina', password: '12345678' }, 'persistent'],
  ])('%o is refused at %s', (body, path) => {
    expect(pathsOf(body)).toEqual([path]);
  });
});
