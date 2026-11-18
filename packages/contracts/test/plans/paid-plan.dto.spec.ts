import { describe, expect, it } from 'vitest';
import { authUserDto } from '../../src/auth/auth-user.dto';
import { accountPlanDto } from '../../src/plans/account-plan.dto';
import { higherPlanOf } from '../../src/plans/paid-plan.dto';
import { PLAN_LIMITS } from '../../src/plans/plan-limits';

const UNTIL = '2026-12-16T12:00:00.000Z';
const USAGE = { campaignsOwned: 1, storageBytes: 0 };

function accountPlan(fields: { paidPlan: unknown; paidPlanUntil: unknown }) {
  return {
    plan: 'free',
    limits: PLAN_LIMITS.narrador,
    customization: true,
    usage: USAGE,
    ...fields,
  };
}

describe('accountPlanDto with the paid plan', () => {
  it('accepts a free account paying the Narrador until a date', () => {
    const body = accountPlan({ paidPlan: 'narrador', paidPlanUntil: UNTIL });
    expect(accountPlanDto.parse(body)).toEqual(body);
  });

  it('accepts no paid plan with no date', () => {
    const body = accountPlan({ paidPlan: null, paidPlanUntil: null });
    expect(accountPlanDto.parse(body)).toMatchObject({ paidPlan: null, paidPlanUntil: null });
  });

  it('refuses a paid plan without its date, citing the field', () => {
    const result = accountPlanDto.safeParse(
      accountPlan({ paidPlan: 'narrador', paidPlanUntil: null }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['paidPlanUntil']);
    expect(result.error?.issues[0]?.message).toContain('"narrador"');
  });

  it('refuses a date without a paid plan', () => {
    const result = accountPlanDto.safeParse(accountPlan({ paidPlan: null, paidPlanUntil: UNTIL }));
    expect(result.success).toBe(false);
  });
});

describe('authUserDto with the paid plan', () => {
  const user = {
    id: '7d0f8c39-2b8e-4f4e-9d1a-5c6b7a8e9f01',
    username: 'ana',
    name: 'Ana',
    email: 'ana@mesa.com',
    role: 'user',
    color: 'teal',
    avatarId: null,
    plan: 'free',
    lorkariumOwner: false,
    limits: PLAN_LIMITS.lenda,
    customization: true,
  };

  it('carries the paid plan and until when it holds', () => {
    const body = { ...user, paidPlan: 'lenda', paidPlanUntil: UNTIL };
    expect(authUserDto.parse(body)).toMatchObject({ plan: 'free', paidPlan: 'lenda' });
  });

  it('refuses a paid plan without its date', () => {
    expect(authUserDto.safeParse({ ...user, paidPlan: 'lenda', paidPlanUntil: null }).success).toBe(
      false,
    );
  });
});

describe('higherPlanOf', () => {
  it('is the higher of the plan of the admin and the paid one, in the order of USER_PLANS', () => {
    expect(higherPlanOf('free', 'lenda')).toBe('lenda');
    expect(higherPlanOf('lenda', 'narrador')).toBe('lenda');
    expect(higherPlanOf('apoiador', null)).toBe('apoiador');
    expect(higherPlanOf('amigo_do_dono', 'lenda')).toBe('amigo_do_dono');
  });
});
