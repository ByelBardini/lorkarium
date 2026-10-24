import { describe, expect, it } from 'vitest';
import {
  AccountLinkBo,
  INVITATION_TTL_MS,
  linkExpiry,
  PASSWORD_RESET_TTL_MS,
  requireOtherAccount,
} from '../../../src/modules/account-links/account-link.bo';

const EXPIRES_AT = new Date('2026-10-31T12:00:00Z');

describe('AccountLinkBo', () => {
  const link = new AccountLinkBo({ id: 'inv-1', expiresAt: EXPIRES_AT });

  it('one millisecond before the deadline it still works', () => {
    expect(() => link.requireUsableAt(new Date(EXPIRES_AT.getTime() - 1))).not.toThrow();
  });

  it('at the deadline it is ACCOUNT_LINK_INVALID citing the id and the deadline', () => {
    expect(() => link.requireUsableAt(EXPIRES_AT)).toThrow(
      expect.objectContaining({
        code: 'ACCOUNT_LINK_INVALID',
        message: expect.stringContaining('inv-1 expired at 2026-10-31T12:00:00.000Z'),
      }),
    );
  });
});

describe('linkExpiry', () => {
  const now = new Date('2026-10-24T12:00:00Z');

  it('an invitation lives 7 days', () => {
    expect(linkExpiry(now, INVITATION_TTL_MS)).toEqual(new Date('2026-10-31T12:00:00Z'));
  });

  it('a new-password link lives 1 hour', () => {
    expect(linkExpiry(now, PASSWORD_RESET_TTL_MS)).toEqual(new Date('2026-10-24T13:00:00Z'));
  });
});

describe('requireOtherAccount', () => {
  it('the own account is SELF_ACTION; another passes', () => {
    expect(() => requireOtherAccount('a', 'a')).toThrow(
      expect.objectContaining({ code: 'SELF_ACTION' }),
    );
    expect(() => requireOtherAccount('a', 'b')).not.toThrow();
  });
});
