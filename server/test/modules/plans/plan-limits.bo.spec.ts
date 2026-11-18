import { PLAN_LIMITS, USER_PLANS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  PlanLimitsBo,
  customizationAllowed,
  effectiveLimitsOf,
  effectivePlanOf,
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
    expect(limits).toMatchObject({ maxCampaigns: 1, maxBarsPerToken: 1, auraKinds: ['color'] });
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
    const error = refusalOf(() => PlanLimitsBo.requireRoom('scenes', 3, 1, FREE));
    expect(error).toMatchObject({
      code: 'PLAN_LIMIT',
      resource: 'scenes',
      stored: 3,
      adding: 1,
      limit: 3,
      plan: 'free',
      message: 'would have 4 scenes; plan free allows at most 3',
    });
  });

  it('lets the count reach the ceiling', () => {
    expect(() => PlanLimitsBo.requireRoom('scenes', 2, 1, FREE)).not.toThrow();
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
    const error = refusalOf(() => PlanLimitsBo.requireRoom('lights', 30, 1, PLAN_LIMITS.narrador));
    expect(error).toMatchObject({ resource: 'lights', limit: 30, plan: 'narrador' });
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

describe('the paid plan against the plan of the admin', () => {
  const USER = { role: 'user', lorkariumOwner: false } as const;

  it('a free account paying the Narrador gets the limits of the Narrador', () => {
    expect(effectiveLimitsOf({ ...USER, plan: 'free', activePaidPlan: 'narrador' })).toBe(
      PLAN_LIMITS.narrador,
    );
  });

  it('a Lenda courtesy of the admin outranks a paid Narrador', () => {
    expect(effectiveLimitsOf({ ...USER, plan: 'lenda', activePaidPlan: 'narrador' })).toBe(
      PLAN_LIMITS.lenda,
    );
  });

  it('without a paid plan only the plan of the admin counts', () => {
    expect(effectiveLimitsOf({ ...USER, plan: 'apoiador', activePaidPlan: null })).toBe(
      PLAN_LIMITS.apoiador,
    );
  });

  it('an Apoiador of the admin paying the Narrador gets the Narrador and its customization', () => {
    const account = { ...USER, plan: 'apoiador', activePaidPlan: 'narrador' } as const;
    expect(effectiveLimitsOf(account)).toBe(PLAN_LIMITS.narrador);
    expect(customizationAllowed(account)).toBe(true);
  });

  it('a free account paying the Apoiador opens its customization', () => {
    expect(customizationAllowed({ ...USER, plan: 'free', activePaidPlan: 'apoiador' })).toBe(true);
  });

  it('an admin paying the Apoiador keeps the limits of amigo_do_dono', () => {
    const admin = {
      role: 'admin',
      plan: 'free',
      activePaidPlan: 'apoiador',
      lorkariumOwner: false,
    } as const;
    expect(effectiveLimitsOf(admin)).toBe(PLAN_LIMITS.amigo_do_dono);
  });
});

describe('effectivePlanOf', () => {
  it('is the higher of the two plans, in the order of USER_PLANS', () => {
    expect(effectivePlanOf({ plan: 'free', activePaidPlan: 'lenda' })).toBe('lenda');
    expect(effectivePlanOf({ plan: 'narrador', activePaidPlan: 'apoiador' })).toBe('narrador');
    expect(effectivePlanOf({ plan: 'apoiador', activePaidPlan: null })).toBe('apoiador');
    expect(effectivePlanOf({ plan: 'amigo_do_dono', activePaidPlan: 'lenda' })).toBe(
      'amigo_do_dono',
    );
  });
});

describe('PlanLimitsBo.requireEditable', () => {
  it.each([0, 1, 2])('the scene of rank %i at a free table is still editable', (rank) => {
    expect(() => PlanLimitsBo.requireEditable('scenes', rank, FREE)).not.toThrow();
  });

  it('the scene of rank 3 at a free table is read only, citing the item and the ceiling', () => {
    const error = refusalOf(() => PlanLimitsBo.requireEditable('scenes', 3, FREE));
    expect(error).toMatchObject({
      code: 'PLAN_LIMIT',
      reason: 'readOnly',
      resource: 'scenes',
      limit: 3,
      plan: 'free',
      message: 'scene 4 of plan free is read only (plan allows 3)',
    });
  });

  it('the last one inside the ceiling (rank = limit - 1) is editable', () => {
    expect(() => PlanLimitsBo.requireEditable('scenes', 14, PLAN_LIMITS.narrador)).not.toThrow();
  });

  it('a null ceiling leaves every rank editable', () => {
    const unbounded = PLAN_LIMITS.amigo_do_dono;
    expect(() => PlanLimitsBo.requireEditable('scenes', 10_000, unbounded)).not.toThrow();
  });

  it('at the technical ceiling the plan stays silent: the technical error of today answers', () => {
    const lenda = PLAN_LIMITS.lenda;
    expect(() => PlanLimitsBo.requireEditable('lights', 150, lenda)).not.toThrow();
    expect(() => PlanLimitsBo.requireEditable('documentTabs', 250, lenda)).not.toThrow();
  });

  it('below the technical ceiling a paid plan locks the excess like the free one', () => {
    const narrador = PLAN_LIMITS.narrador;
    const error = refusalOf(() => PlanLimitsBo.requireEditable('lights', 30, narrador));
    expect(error).toMatchObject({
      reason: 'readOnly',
      limit: 30,
      plan: 'narrador',
      message: 'light 31 of plan narrador is read only (plan allows 30)',
    });
  });

  it('a ceiling of 0 locks the first one, named in the singular', () => {
    const error = refusalOf(() => PlanLimitsBo.requireEditable('libraryMaps', 0, FREE));
    expect(error.message).toBe('library map 1 of plan free is read only (plan allows 0)');
  });
});

describe('PlanLimitsBo.mayLock', () => {
  it('a free table may lock grids: its ceiling is finite and below the technical one', () => {
    expect(PlanLimitsBo.mayLock('scenes', PLAN_LIMITS.free)).toBe(true);
  });

  it('a null ceiling never locks, so the rank need not be read', () => {
    expect(PlanLimitsBo.mayLock('scenes', PLAN_LIMITS.amigo_do_dono)).toBe(false);
  });

  it('a ceiling at the technical one never locks either', () => {
    expect(PlanLimitsBo.mayLock('lights', PLAN_LIMITS.lenda)).toBe(false);
  });
});

describe('PlanLimitsBo.isReadOnly', () => {
  it.each([
    [2, false],
    [3, true],
  ])('a scene of rank %i at a free table reads read only = %s', (rank, expected) => {
    expect(PlanLimitsBo.isReadOnly('scenes', rank, PLAN_LIMITS.free)).toBe(expected);
  });

  it('a null ceiling and the technical ceiling never read as read only', () => {
    expect(PlanLimitsBo.isReadOnly('scenes', 900, PLAN_LIMITS.amigo_do_dono)).toBe(false);
    expect(PlanLimitsBo.isReadOnly('lights', 150, PLAN_LIMITS.lenda)).toBe(false);
  });

  it('a ceiling of 0 locks the first item', () => {
    expect(PlanLimitsBo.isReadOnly('libraryMaps', 0, PLAN_LIMITS.free)).toBe(true);
  });
});

describe('the reason of a PLAN_LIMIT', () => {
  it('passing the ceiling on create is a room refusal', () => {
    const error = refusalOf(() => PlanLimitsBo.requireRoom('scenes', 3, 1, FREE));
    expect(error.reason).toBe('room');
  });

  it('a feature the plan lacks is a room refusal', () => {
    const error = refusalOf(() => PlanLimitsBo.requireFeature('sceneCopy', false, FREE));
    expect(error.reason).toBe('room');
  });
});
