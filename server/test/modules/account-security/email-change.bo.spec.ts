import { describe, expect, it } from 'vitest';
import {
  EmailChangeBo,
  maskEmail,
  PendingEmailBo,
} from '../../../src/modules/account-security/email-change.bo';

const NOW = new Date('2026-10-14T12:00:00Z');

describe('EmailChangeBo.requestAt', () => {
  const bo = new EmailChangeBo({ userId: 'user-ana', currentEmail: 'ana@mesa.com' });

  it('a new address gets a link valid for 30 minutes', () => {
    expect(bo.requestAt('ana@novo.com', NOW)).toEqual(new Date('2026-10-14T12:30:00Z'));
  });

  it('the current address is refused with EMAIL_UNCHANGED naming the user', () => {
    expect(() => bo.requestAt('ana@mesa.com', NOW)).toThrow(
      expect.objectContaining({ code: 'EMAIL_UNCHANGED', userId: 'user-ana' }),
    );
  });
});

describe('PendingEmailBo', () => {
  it('is alive one millisecond before the deadline', () => {
    const pending = new PendingEmailBo({ expiresAt: new Date(NOW.getTime() + 1) });
    expect(pending.isExpiredAt(NOW)).toBe(false);
  });

  it('at the deadline the link is refused with EMAIL_TOKEN_INVALID', () => {
    const pending = new PendingEmailBo({ expiresAt: NOW });
    expect(() => pending.requireLiveAt(NOW)).toThrow(
      expect.objectContaining({ code: 'EMAIL_TOKEN_INVALID', received: 'an expired token' }),
    );
  });
});

describe('maskEmail', () => {
  it.each([
    ['bianca@x.com', 'b*****@x.com'],
    ['a@x.com', 'a@x.com'],
    ['caio.rpg@lorkarium.dev', 'c*******@lorkarium.dev'],
  ])('%s is shown as %s', (email, masked) => {
    expect(maskEmail(email)).toBe(masked);
  });
});
