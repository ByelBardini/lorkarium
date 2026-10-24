import { describe, expect, it } from 'vitest';
import { UserAccessBo } from '../../../src/modules/auth/user-access.bo';
import { userPo } from '../../support/auth-factories';

describe('UserAccessBo', () => {
  it('a user asking for the admin role is refused with FORBIDDEN_ROLE citing its role', () => {
    const access = new UserAccessBo(userPo({ role: 'user' }));
    expect(() => access.requireRole('admin')).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN_ROLE', message: expect.stringContaining('user') }),
    );
  });

  it.each(['admin', 'user'] as const)('an admin passes a route that requires %s', (required) => {
    const access = new UserAccessBo(userPo({ role: 'admin' }));
    expect(() => access.requireRole(required)).not.toThrow();
  });

  it('a user passes a route that requires user', () => {
    const access = new UserAccessBo(userPo({ role: 'user' }));
    expect(() => access.requireRole('user')).not.toThrow();
  });

  it('an active account passes requireActive', () => {
    expect(() => new UserAccessBo(userPo({ suspendedAt: null })).requireActive()).not.toThrow();
  });

  it('a suspended account is refused with ACCOUNT_SUSPENDED citing its id', () => {
    const access = new UserAccessBo(userPo({ suspendedAt: new Date('2026-10-20T12:00:00Z') }));
    expect(() => access.requireActive()).toThrow(
      expect.objectContaining({
        code: 'ACCOUNT_SUSPENDED',
        message: expect.stringContaining('expected an active account'),
      }),
    );
  });
});
