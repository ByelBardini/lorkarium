import { describe, expect, it } from 'vitest';
import {
  updateUserPlanRequestDto,
  updateUserRoleRequestDto,
} from '../../src/admin/admin-users.dto';

describe('updateUserRoleRequestDto', () => {
  it('accepts the admin role', () => {
    expect(updateUserRoleRequestDto.parse({ role: 'admin' })).toEqual({ role: 'admin' });
  });

  it.each([[{}], [{ role: 'owner' }], [{ role: 'user', userId: 'x' }]])('%o is refused', (body) => {
    expect(updateUserRoleRequestDto.safeParse(body).success).toBe(false);
  });
});

describe('updateUserPlanRequestDto', () => {
  it('accepts a plan of the grid', () => {
    expect(updateUserPlanRequestDto.parse({ plan: 'lenda' })).toEqual({ plan: 'lenda' });
  });

  it('accepts the Apoiador, a plan like the others', () => {
    expect(updateUserPlanRequestDto.parse({ plan: 'apoiador' })).toEqual({ plan: 'apoiador' });
  });

  it.each([[{}], [{ plan: 'pro' }], [{ plan: 'free', admin: true }]])('%o is refused', (body) => {
    expect(updateUserPlanRequestDto.safeParse(body).success).toBe(false);
  });
});
