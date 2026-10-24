import { describe, expect, it } from 'vitest';
import { createInvitationRequestDto } from '../../src/admin/admin-invitations.dto';

describe('createInvitationRequestDto', () => {
  it('trims and lowercases the e-mail', () => {
    expect(
      createInvitationRequestDto.parse({ email: ' Marina@Exemplo.COM ', role: 'user' }),
    ).toEqual({ email: 'marina@exemplo.com', role: 'user' });
  });

  it.each([
    [{ email: 'marina', role: 'user' }, 'email'],
    [{ email: 'marina@exemplo.com' }, 'role'],
    [{ email: 'marina@exemplo.com', role: 'owner' }, 'role'],
  ])('%o is refused at %s', (body, path) => {
    const result = createInvitationRequestDto.safeParse(body);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([path]);
  });

  it('an extra field is refused (strict)', () => {
    const body = { email: 'marina@exemplo.com', role: 'user', username: 'marina' };
    expect(createInvitationRequestDto.safeParse(body).success).toBe(false);
  });
});
