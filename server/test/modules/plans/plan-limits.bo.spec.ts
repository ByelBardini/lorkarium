import { PLAN_LIMITS, USER_PLANS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  PlanLimitsBo,
  customizationAllowed,
  effectiveLimitsOf,
} from '../../../src/modules/plans/plan-limits.bo';
import { PlanLimitError } from '../../../src/modules/plans/plans.error';

const FREE = PLAN_LIMITS.free;

function refusalOf(work: () => void): PlanLimitError {
  try {
    work();
  } catch (error) {
    if (error instanceof PlanLimitError) return error;
    throw error;
  }
  throw new Error('expected a PlanLimitError, nothing was thrown');
}

describe('effectiveLimitsOf', () => {
  it('a user in free gets the grid of free', () => {
    const limits = effectiveLimitsOf({ role: 'user', plan: 'free', lorkariumOwner: false });
    expect(limits).toMatchObject({ maxCampaigns: 1, maxBarsPerToken: 2, auraKinds: ['color'] });
  });

  it('an admin gets the limits of amigo_do_dono whatever the plan', () => {
    for (const plan of USER_PLANS) {
      expect(effectiveLimitsOf({ role: 'admin', plan, lorkariumOwner: false })).toBe(
        PLAN_LIMITS.amigo_do_dono,
      );
    }
  });

  it('the Dono do Lorkarium gets the limits of amigo_do_dono whatever the plan', () => {
    for (const plan of USER_PLANS) {
      const dono = { role: 'user', plan, lorkariumOwner: true } as const;
      expect(effectiveLimitsOf(dono)).toBe(PLAN_LIMITS.amigo_do_dono);
    }
  });

  it('a user on Apoiador gets the grid of Grátis under the name apoiador', () => {
    const limits = effectiveLimitsOf({ role: 'user', plan: 'apoiador', lorkariumOwner: false });
    expect(limits).toEqual({ ...PLAN_LIMITS.free, plan: 'apoiador' });
  });

  it('a user in lenda gets the grid of lenda', () => {
    expect(effectiveLimitsOf({ role: 'user', plan: 'lenda', lorkariumOwner: false })).toBe(
      PLAN_LIMITS.lenda,
    );
  });
});

describe('customizationAllowed', () => {
  const USER = { role: 'user', lorkariumOwner: false } as const;

  it('is true for the Apoiador, every paid plan and the amigo_do_dono', () => {
    for (const plan of ['apoiador', 'narrador', 'lenda', 'amigo_do_dono'] as const) {
      expect({ plan, open: customizationAllowed({ ...USER, plan }) }).toEqual({ plan, open: true });
    }
  });

  it('the admin and the Dono do Lorkarium have it on free', () => {
    expect(customizationAllowed({ ...USER, role: 'admin', plan: 'free' })).toBe(true);
    expect(customizationAllowed({ ...USER, plan: 'free', lorkariumOwner: true })).toBe(true);
  });

  it('is false only for a free user', () => {
    expect(customizationAllowed({ ...USER, plan: 'free' })).toBe(false);
  });
});

describe('PlanLimitsBo.requireRoom', () => {
  it('refuses passing the ceiling, citing the resource, the count and the plan', () => {
    const error = refusalOf(() => PlanLimitsBo.requireRoom('scenes', 5, 1, FREE));
    expect(error).toMatchObject({
      code: 'PLAN_LIMIT',
      resource: 'scenes',
      stored: 5,
      adding: 1,
      limit: 5,
      plan: 'free',
      message: 'would have 6 scenes; plan free allows at most 5',
    });
  });

  it('lets the count reach the ceiling', () => {
    expect(() => PlanLimitsBo.requireRoom('scenes', 4, 1, FREE)).not.toThrow();
  });

  it('a null ceiling takes any count', () => {
    expect(() =>
      PlanLimitsBo.requireRoom('scenes', 10_000, 1, PLAN_LIMITS.amigo_do_dono),
    ).not.toThrow();
  });

  it('who is already past the ceiling keeps editing without adding (grandfathering)', () => {
    expect(() => PlanLimitsBo.requireRoom('scenes', 7, 0, FREE)).not.toThrow();
  });

  it('a ceiling of 0 refuses the first one', () => {
    const error = refusalOf(() => PlanLimitsBo.requireRoom('patrols', 0, 1, FREE));
    expect(error).toMatchObject({ resource: 'patrols', limit: 0, plan: 'free' });
  });

  it('at the technical ceiling the plan stays silent: the technical error of today answers', () => {
    const lenda = PLAN_LIMITS.lenda;
    expect(() => PlanLimitsBo.requireRoom('lights', 100, 1, lenda)).not.toThrow();
    expect(() => PlanLimitsBo.requireRoom('documentTabs', 200, 1, lenda)).not.toThrow();
  });

  it('below the technical ceiling a paid plan is refused like the free one', () => {
    const error = refusalOf(() => PlanLimitsBo.requireRoom('lights', 50, 1, PLAN_LIMITS.narrador));
    expect(error).toMatchObject({ resource: 'lights', limit: 50, plan: 'narrador' });
  });
});

describe('PlanLimitsBo.requireFeature', () => {
  it('refuses a feature the plan lacks, with limit 0', () => {
    const error = refusalOf(() => PlanLimitsBo.requireFeature('sceneCopy', false, FREE));
    expect(error).toMatchObject({
      code: 'PLAN_LIMIT',
      resource: 'sceneCopy',
      limit: 0,
      plan: 'free',
      message: 'plan free does not include sceneCopy',
    });
  });

  it('lets an allowed feature through', () => {
    expect(() =>
      PlanLimitsBo.requireFeature(
        'sceneCopy',
        PLAN_LIMITS.narrador.sceneCopy,
        PLAN_LIMITS.narrador,
      ),
    ).not.toThrow();
  });
});
