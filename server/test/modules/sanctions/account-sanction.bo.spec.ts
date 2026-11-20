import { describe, expect, it } from 'vitest';
import {
  appealChangeOf,
  liftsSuspension,
  requireSanctionable,
} from '../../../src/modules/sanctions/account-sanction.bo';
import { userPo } from '../../support/auth-factories';
import { accountSanctionPo } from '../../support/sanctions-factories';

const NOW = new Date('2026-11-19T12:00:00Z');
const ADMIN_ID = 'ad000000-0000-4000-8000-000000000001';
const caio = userPo({ id: 'ca100000-0000-4000-8000-000000000002', email: 'caio@mesa.com' });
const suspendedCaio = { ...caio, suspendedAt: new Date('2026-11-18T12:00:00Z') };

describe('requireSanctionable', () => {
  it.each(['warning', 'content_removal'] as const)(
    'a %s on a suspended account is only recorded (allowed)',
    (kind) => {
      expect(() =>
        requireSanctionable(ADMIN_ID, suspendedCaio, { kind, until: null }, NOW),
      ).not.toThrow();
    },
  );

  it('a suspension of an active account with an end ahead is allowed', () => {
    const until = new Date('2026-11-25T12:00:00Z');
    expect(() =>
      requireSanctionable(ADMIN_ID, caio, { kind: 'suspension', until }, NOW),
    ).not.toThrow();
  });

  it('suspending an account already suspended is refused with ALREADY_SUSPENDED', () => {
    const request = { kind: 'suspension', until: null } as const;
    expect(() => requireSanctionable(ADMIN_ID, suspendedCaio, request, NOW)).toThrow(
      expect.objectContaining({
        code: 'ALREADY_SUSPENDED',
        message: expect.stringContaining(caio.id),
      }),
    );
  });

  it('an account whose suspension already ended can be suspended again', () => {
    const ended = { ...suspendedCaio, suspendedUntil: new Date('2026-11-19T11:00:00Z') };
    const request = { kind: 'suspension', until: null } as const;
    expect(() => requireSanctionable(ADMIN_ID, ended, request, NOW)).not.toThrow();
  });

  it('a suspension that would end now or before is refused with SANCTION_UNTIL_PAST citing it', () => {
    const request = { kind: 'suspension', until: NOW } as const;
    expect(() => requireSanctionable(ADMIN_ID, caio, request, NOW)).toThrow(
      expect.objectContaining({
        code: 'SANCTION_UNTIL_PAST',
        message: expect.stringContaining('2026-11-19T12:00:00.000Z'),
      }),
    );
  });

  it('a measure against oneself is refused with SELF_ACTION', () => {
    const self = userPo({ id: ADMIN_ID, role: 'admin' });
    expect(() =>
      requireSanctionable(ADMIN_ID, self, { kind: 'warning', until: null }, NOW),
    ).toThrow(expect.objectContaining({ code: 'SELF_ACTION' }));
  });

  it.each(['warning', 'suspension', 'ban'] as const)(
    'a %s against another admin is refused with TARGET_IS_ADMIN',
    (kind) => {
      const other = userPo({ id: caio.id, role: 'admin' });
      expect(() => requireSanctionable(ADMIN_ID, other, { kind, until: null }, NOW)).toThrow(
        expect.objectContaining({ code: 'TARGET_IS_ADMIN' }),
      );
    },
  );
});

describe('appealChangeOf', () => {
  it('the arrival of an appeal records when it came', () => {
    const change = appealChangeOf(accountSanctionPo(), { outcome: 'received' }, ADMIN_ID, NOW);
    expect(change).toEqual({ appealReceivedAt: NOW });
  });

  it('a second arrival keeps the first date (the 15 days count from it)', () => {
    const received = accountSanctionPo({ appealReceivedAt: new Date('2026-11-10T00:00:00Z') });
    const change = appealChangeOf(received, { outcome: 'received' }, ADMIN_ID, NOW);
    expect(change).toEqual({ appealReceivedAt: new Date('2026-11-10T00:00:00Z') });
  });

  it('a decision records the outcome, the note, who decided and when', () => {
    const received = accountSanctionPo({ appealReceivedAt: new Date('2026-11-10T00:00:00Z') });
    const request = { outcome: 'upheld', note: 'O print confirma a ameaça.' } as const;
    expect(appealChangeOf(received, request, ADMIN_ID, NOW)).toEqual({
      appealReceivedAt: new Date('2026-11-10T00:00:00Z'),
      appealOutcome: 'upheld',
      appealNote: 'O print confirma a ameaça.',
      appealDecidedBy: ADMIN_ID,
      appealDecidedAt: NOW,
    });
  });

  it('a decision without a recorded arrival takes now as the arrival', () => {
    const change = appealChangeOf(
      accountSanctionPo(),
      { outcome: 'reverted', note: 'x' },
      ADMIN_ID,
      NOW,
    );
    expect(change.appealReceivedAt).toEqual(NOW);
  });

  it.each([
    ['another decision', { outcome: 'reverted', note: 'x' }],
    ['a late arrival', { outcome: 'received' }],
  ] as const)('%s on a decided appeal is refused with APPEAL_ALREADY_DECIDED', (_case, request) => {
    const decided = accountSanctionPo({
      appealReceivedAt: NOW,
      appealOutcome: 'upheld',
      appealNote: 'Mantida.',
      appealDecidedAt: NOW,
    });
    expect(() => appealChangeOf(decided, request, ADMIN_ID, NOW)).toThrow(
      expect.objectContaining({ code: 'APPEAL_ALREADY_DECIDED' }),
    );
  });
});

describe('liftsSuspension', () => {
  const suspension = accountSanctionPo({ kind: 'suspension' });

  it('reverting the latest suspension of a suspended account lifts it', () => {
    expect(liftsSuspension(suspension, 'reverted', suspension.id, suspendedCaio, NOW)).toBe(true);
  });

  it('upholding it lifts nothing', () => {
    expect(liftsSuspension(suspension, 'upheld', suspension.id, suspendedCaio, NOW)).toBe(false);
  });

  it('reverting a warning lifts nothing (it is only recorded)', () => {
    const warning = accountSanctionPo({ kind: 'warning' });
    expect(liftsSuspension(warning, 'reverted', suspension.id, suspendedCaio, NOW)).toBe(false);
  });

  it('reverting an older suspension leaves the newer one in force', () => {
    const newer = 'feed0000-0000-4000-8000-000000000009';
    expect(liftsSuspension(suspension, 'reverted', newer, suspendedCaio, NOW)).toBe(false);
  });

  it('reverting a suspension that already ended lifts nothing', () => {
    expect(liftsSuspension(suspension, 'reverted', suspension.id, caio, NOW)).toBe(false);
  });
});
