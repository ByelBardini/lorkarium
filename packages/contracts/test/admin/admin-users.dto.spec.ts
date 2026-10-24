import { describe, expect, it } from 'vitest';
import { updateUserRoleRequestDto } from '../../src/admin/admin-users.dto';

describe('updateUserRoleRequestDto', () => {
  it('accepts the admin role', () => {
    expect(updateUserRoleRequestDto.parse({ role: 'admin' })).toEqual({ role: 'admin' });
  });

  it.each([[{}], [{ role: 'owner' }], [{ role: 'user', userId: 'x' }]])('%o is refused', (body) => {
    expect(updateUserRoleRequestDto.safeParse(body).success).toBe(false);
  });
});
