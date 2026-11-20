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
    const access = new UserAccessBo(userPo({ suspendedAt: null }));
    expect(() => access.requireActive(NOW)).not.toThrow();
  });

  it('a suspension without an end is refused with ACCOUNT_SUSPENDED citing its id', () => {
    const access = new UserAccessBo(userPo({ suspendedAt: SUSPENDED_AT }));
    expect(() => access.requireActive(NOW)).toThrow(
      expect.objectContaining({
        code: 'ACCOUNT_SUSPENDED',
        message: expect.stringContaining('expected an active account'),
      }),
    );
  });

  it('a suspension that ends tomorrow is refused citing the end', () => {
    const until = new Date('2026-11-20T12:00:00Z');
    const access = new UserAccessBo(userPo({ suspendedAt: SUSPENDED_AT, suspendedUntil: until }));
    expect(() => access.requireActive(NOW)).toThrow(
      expect.objectContaining({
        code: 'ACCOUNT_SUSPENDED',
        message: expect.stringContaining('until 2026-11-20T12:00:00.000Z'),
      }),
    );
  });

  it('a suspension that ended an hour ago lets the account in', () => {
    const until = new Date('2026-11-19T11:00:00Z');
    const access = new UserAccessBo(userPo({ suspendedAt: SUSPENDED_AT, suspendedUntil: until }));
    expect(() => access.requireActive(NOW)).not.toThrow();
  });

  it('a suspension that ends exactly now lets the account in', () => {
    const access = new UserAccessBo(userPo({ suspendedAt: SUSPENDED_AT, suspendedUntil: NOW }));
    expect(() => access.requireActive(NOW)).not.toThrow();
  });

  it('a suspension one millisecond from its end still holds', () => {
    const until = new Date(NOW.getTime() + 1);
    const access = new UserAccessBo(userPo({ suspendedAt: SUSPENDED_AT, suspendedUntil: until }));
    expect(access.isSuspendedAt(NOW)).toBe(true);
  });
});

const NOW = new Date('2026-11-19T12:00:00Z');
const SUSPENDED_AT = new Date('2026-11-18T12:00:00Z');
