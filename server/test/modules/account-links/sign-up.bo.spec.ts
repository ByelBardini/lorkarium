import { describe, expect, it } from 'vitest';
import {
  SIGN_UP_RESEND_COOLDOWN_MS,
  SignUpBo,
  type SignUpFacts,
} from '../../../src/modules/account-links/sign-up.bo';

const NOW = new Date('2026-11-20T12:00:00Z');
const MINUTE = 60 * 1000;
const ACTIVE = { active: true, resetIssuedAt: null };

function decide(facts: Partial<SignUpFacts>): string {
  return new SignUpBo({ account: null, banned: false, pending: null, now: NOW, ...facts }).decide();
}

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

describe('SignUpBo.decide', () => {
  it('a new address without a ban nor a pending link gets a link', () => {
    expect(decide({})).toBe('send-link');
  });

  it('an address of an active account is told the account exists', () => {
    expect(decide({ account: ACTIVE })).toBe('tell-account-exists');
  });

  it('an address of a suspended account gets nothing', () => {
    expect(decide({ account: { active: false, resetIssuedAt: null } })).toBe('nothing');
  });

  it('an account told less than 2 minutes ago is not told again', () => {
    const recent = { active: true, resetIssuedAt: ago(MINUTE) };
    expect(decide({ account: recent })).toBe('nothing');
  });

  it('an account whose last new-password link is older than the cooldown is told again', () => {
    const old = { active: true, resetIssuedAt: ago(SIGN_UP_RESEND_COOLDOWN_MS) };
    expect(decide({ account: old })).toBe('tell-account-exists');
  });

  it('a banned address gets nothing, even with a pending link', () => {
    expect(decide({ banned: true, pending: { sentAt: ago(10 * MINUTE) } })).toBe('nothing');
  });

  it('a pending link sent less than 2 minutes ago is not sent again', () => {
    expect(decide({ pending: { sentAt: ago(SIGN_UP_RESEND_COOLDOWN_MS - 1) } })).toBe('nothing');
  });

  it.each([
    ['exactly the cooldown ago', SIGN_UP_RESEND_COOLDOWN_MS],
    ['expired days ago', 9 * 24 * 60 * MINUTE],
  ])('a pending link sent %s is renewed', (_case, sentMsAgo) => {
    expect(decide({ pending: { sentAt: ago(sentMsAgo) } })).toBe('renew-link');
  });

  it('the cooldown is 2 minutes', () => {
    expect(SIGN_UP_RESEND_COOLDOWN_MS).toBe(2 * MINUTE);
  });
});
