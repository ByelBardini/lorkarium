import { PLAN_LIMITS, type PlanLimitDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { PlanLimitError } from '../../../src/modules/plans/plans.error';
import { TokenPlanBo } from '../../../src/modules/tokens/token-plan.bo';

const free = new TokenPlanBo(PLAN_LIMITS.free);
const friend = new TokenPlanBo(PLAN_LIMITS.amigo_do_dono);
const narrator = new TokenPlanBo(PLAN_LIMITS.narrador);

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

describe('TokenPlanBo.requireNew', () => {
  it('a token born with 3 bars on a free table is tokenBars, limit 2', () => {
    expect(refusalOf(() => free.requireNew({ bars: 3 }))).toEqual({
      resource: 'tokenBars',
      limit: 2,
      plan: 'free',
    });
  });

  it('2 bars and 2 forms fit the free table', () => {
    expect(() => free.requireNew({ bars: 2, forms: 2 })).not.toThrow();
  });

  it('3 forms on a free table is tokenForms', () => {
    expect(refusalOf(() => free.requireNew({ forms: 3 })).resource).toBe('tokenForms');
  });

  it('an aura of effect or image on a free table is auraKind with limit 0; a color aura passes', () => {
    expect(refusalOf(() => free.requireNew({ aura: { kind: 'effect' } }))).toEqual({
      resource: 'auraKind',
      limit: 0,
      plan: 'free',
    });
    expect(refusalOf(() => free.requireNew({ aura: { kind: 'image' } })).resource).toBe('auraKind');
    expect(() => free.requireNew({ aura: { kind: 'color' } })).not.toThrow();
  });

  it('amigo_do_dono takes 8 bars, 8 forms and an effect aura as today', () => {
    expect(() => friend.requireNew({ bars: 8, forms: 8, aura: { kind: 'effect' } })).not.toThrow();
  });
});

describe('TokenPlanBo.requireChange', () => {
  const heldFive = { bars: 5, forms: 4, auraKind: 'effect' } as const;

  it('a token with 5 bars from before the downgrade keeps them while only its name changes', () => {
    expect(() => free.requireChange(heldFive, { bars: 5, forms: 4 })).not.toThrow();
  });

  it('dropping bars or forms past the plan still passes (nothing added)', () => {
    expect(() => free.requireChange(heldFive, { bars: 4, forms: 3 })).not.toThrow();
  });

  it('one bar more than it holds past the plan is tokenBars', () => {
    expect(refusalOf(() => free.requireChange(heldFive, { bars: 6 })).resource).toBe('tokenBars');
  });

  it('from 2 to 3 bars on a free table is refused; on narrador it passes', () => {
    const held = { bars: 2, forms: 0, auraKind: null };
    expect(refusalOf(() => free.requireChange(held, { bars: 3 })).resource).toBe('tokenBars');
    expect(() => narrator.requireChange(held, { bars: 3 })).not.toThrow();
  });

  it('the effect aura it already has is kept; switching to image is auraKind', () => {
    expect(() => free.requireChange(heldFive, { aura: { kind: 'effect' } })).not.toThrow();
    const switched = () => free.requireChange(heldFive, { aura: { kind: 'image' } });
    expect(refusalOf(switched).resource).toBe('auraKind');
  });

  it('taking the aura away or not sending it passes', () => {
    expect(() => free.requireChange(heldFive, { aura: null })).not.toThrow();
    expect(() => free.requireChange(heldFive, {})).not.toThrow();
  });
});

describe('TokenPlanBo.requireChange (custom colors)', () => {
  const heldHex = { bars: 1, forms: 0, auraKind: 'color' as const, colors: ['#336699'] };

  it('a new token with a hex bar on a free table is customColor', () => {
    const born = () => free.requireNew({ bars: 1, colors: ['#336699'] });
    expect(refusalOf(born)).toEqual({ resource: 'customColor', limit: 0, plan: 'free' });
  });

  it('a hex aura color sent to a free table is customColor; on narrador it passes', () => {
    const aura = { kind: 'color' as const, color: '#ffaa00' };
    expect(refusalOf(() => free.requireNew({ aura })).resource).toBe('customColor');
    expect(() => narrator.requireNew({ aura })).not.toThrow();
  });

  it('keeping the hex it wears passes on free; a new one is refused', () => {
    expect(() => free.requireChange(heldHex, { bars: 1, colors: ['#336699'] })).not.toThrow();
    const recolored = () => free.requireChange(heldHex, { bars: 1, colors: ['#ffaa00'] });
    expect(refusalOf(recolored).resource).toBe('customColor');
  });

  it('palette names pass on free', () => {
    const sent = { bars: 1, colors: ['crimson'], aura: { kind: 'color' as const, color: 'gold' } };
    expect(() => free.requireNew(sent)).not.toThrow();
  });
});

describe('TokenPlanBo.requireAuraOnEach', () => {
  it('one of the restyled tokens without the effect refuses the free restyle', () => {
    const held = [{ auraKind: 'effect' as const }, { auraKind: null }];
    const restyle = () => free.requireAuraOnEach(held, { kind: 'effect' });
    expect(refusalOf(restyle).resource).toBe('auraKind');
  });

  it('a color aura on every token passes', () => {
    const held = [{ auraKind: null }, { auraKind: 'effect' as const }];
    expect(() => free.requireAuraOnEach(held, { kind: 'color' })).not.toThrow();
  });

  it('a hex aura on a token that does not wear it refuses the free restyle', () => {
    const held = [{ auraKind: 'color' as const, colors: ['#336699'] }, { auraKind: null }];
    const restyle = () => free.requireAuraOnEach(held, { kind: 'color', color: '#336699' });
    expect(refusalOf(restyle).resource).toBe('customColor');
  });
});

describe('TokenPlanBo.requireBlockers', () => {
  it('the first sight blocker on a free table is sightBlockers, limit 0', () => {
    expect(refusalOf(() => free.requireBlockers(0, 1))).toEqual({
      resource: 'sightBlockers',
      limit: 0,
      plan: 'free',
    });
  });

  it('the 11th on narrador is refused; the 10th passes', () => {
    expect(() => narrator.requireBlockers(9, 1)).not.toThrow();
    expect(refusalOf(() => narrator.requireBlockers(10, 1)).limit).toBe(10);
  });

  it('amigo_do_dono leaves the 51st to the technical ceiling (no plan error)', () => {
    expect(() => friend.requireBlockers(50, 1)).not.toThrow();
  });
});

describe('TokenPlanBo.limits', () => {
  it('exposes the effective limits of the table for the other checks of a token command', () => {
    expect(free.limits).toBe(PLAN_LIMITS.free);
  });
});
