import { PLAN_LIMITS, type PlanLimitDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { CustomColorPlanBo } from '../../../src/modules/plans/custom-color-plan.bo';
import { PlanLimitError } from '../../../src/modules/plans/plans.error';

const FREE = PLAN_LIMITS.free;

function refusalOf(act: () => void): PlanLimitDto {
  try {
    act();
  } catch (error) {
    if (error instanceof PlanLimitError) {
      const { resource, limit, plan } = error;
      return { resource, limit, plan };
    }
    throw error;
  }
  throw new Error('expected a PlanLimitError; the act passed');
}

describe('CustomColorPlanBo.requirePaletteUnlessAllowed', () => {
  it('a hex on a free table is customColor, limit 0', () => {
    const act = () => CustomColorPlanBo.requirePaletteUnlessAllowed('#336699', FREE);
    expect(refusalOf(act)).toEqual({ resource: 'customColor', limit: 0, plan: 'free' });
  });

  it('a palette name, null and absent pass on a free table', () => {
    for (const color of ['gold', null, undefined]) {
      expect(() => CustomColorPlanBo.requirePaletteUnlessAllowed(color, FREE)).not.toThrow();
    }
  });

  it('a hex passes on narrador and on amigo_do_dono', () => {
    for (const limits of [PLAN_LIMITS.narrador, PLAN_LIMITS.amigo_do_dono]) {
      expect(() => CustomColorPlanBo.requirePaletteUnlessAllowed('#336699', limits)).not.toThrow();
    }
  });
});

describe('CustomColorPlanBo.requirePaletteUnlessHeld', () => {
  it('keeping the hex a piece already holds passes on free', () => {
    const act = () => CustomColorPlanBo.requirePaletteUnlessHeld(['#336699'], ['#336699'], FREE);
    expect(act).not.toThrow();
  });

  it('a hex the piece does not hold is refused on free, even beside a kept one', () => {
    const sent = ['#336699', '#ffaa00'];
    const act = () => CustomColorPlanBo.requirePaletteUnlessHeld(sent, ['#336699'], FREE);
    expect(refusalOf(act)).toEqual({ resource: 'customColor', limit: 0, plan: 'free' });
  });

  it('going from a hex back to the palette passes on free', () => {
    const act = () => CustomColorPlanBo.requirePaletteUnlessHeld(['gold'], ['#336699'], FREE);
    expect(act).not.toThrow();
  });
});
