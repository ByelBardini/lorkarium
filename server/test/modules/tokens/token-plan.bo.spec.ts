import { PLAN_LIMITS, type PlanLimitDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { PlanLimitError } from '../../../src/modules/plans/plans.error';
import {
  TokenPlanBo,
  type TokenBarSetting,
  type TokenFormSetting,
} from '../../../src/modules/tokens/token-plan.bo';

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
  it('a token born with 2 bars on a free table is tokenBars, limit 1', () => {
    expect(refusalOf(() => free.requireNew({ bars: 2 }))).toEqual({
      resource: 'tokenBars',
      limit: 1,
      plan: 'free',
    });
  });

  it('1 bar and 2 forms fit the free table', () => {
    expect(() => free.requireNew({ bars: 1, forms: 2 })).not.toThrow();
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

function readOnlyOf(
  act: () => void,
): Readonly<{ resource: string; reason: string; stored: number }> {
  try {
    act();
  } catch (error) {
    if (error instanceof PlanLimitError) {
      const { resource, reason, stored } = error;
      return { resource, reason, stored };
    }
    throw error;
  }
  throw new Error('expected a read only PlanLimitError; the act passed');
}

describe('TokenPlanBo.requireChange (bars past the plan are read only)', () => {
  const pv = { label: 'PV', max: 45, color: 'ember' };
  const mana = { label: 'Mana', max: 10, color: 'arcane' };
  const folego = { label: 'Fôlego', max: 6, color: 'gold' };
  const held = { bars: 3, forms: 0, auraKind: null, barSettings: [pv, mana, folego] };
  const sending = (barSettings: TokenBarSetting[]) => ({ bars: barSettings.length, barSettings });

  it('the same settings on the 3 bars (only the values changed) pass on free', () => {
    expect(() => free.requireChange(held, sending([pv, mana, folego]))).not.toThrow();
  });

  it('a new max on the 2nd bar of a free table is tokenBars read only, the 2nd item', () => {
    const raised = sending([pv, { ...mana, max: 12 }, folego]);
    expect(readOnlyOf(() => free.requireChange(held, raised))).toEqual({
      resource: 'tokenBars',
      reason: 'readOnly',
      stored: 2,
    });
  });

  it.each([
    ['label', { ...folego, label: 'Ânimo' }],
    ['color', { ...folego, color: 'ash' }],
  ])('a new %s on the 3rd bar is read only, the 3rd item', (_field, changed) => {
    const sent = sending([pv, mana, changed]);
    expect(readOnlyOf(() => free.requireChange(held, sent)).stored).toBe(3);
  });

  it('the 1st bar (under the ceiling) takes any setting', () => {
    const renamed = sending([{ label: 'Vida', max: 50, color: 'ash' }, mana, folego]);
    expect(() => free.requireChange(held, renamed)).not.toThrow();
  });

  it('deleting the 1st bar passes and the 2nd, now the 1st, takes a new setting', () => {
    const sent = sending([{ ...mana, max: 20 }, folego]);
    expect(() => free.requireChange(held, sent)).not.toThrow();
  });

  it('deleting the 2nd bar passes with the 3rd kept as it was', () => {
    expect(() => free.requireChange(held, sending([pv, folego]))).not.toThrow();
  });

  it('swapping the 2nd and the 3rd bars is read only', () => {
    const swapped = sending([pv, folego, mana]);
    expect(readOnlyOf(() => free.requireChange(held, swapped)).resource).toBe('tokenBars');
  });

  it('on narrador (4 bars) and amigo_do_dono every one of the 3 bars takes a new setting', () => {
    const changed = sending([pv, { ...mana, max: 12 }, { ...folego, label: 'Ânimo' }]);
    expect(() => narrator.requireChange(held, changed)).not.toThrow();
    expect(() => friend.requireChange(held, changed)).not.toThrow();
  });
});

describe('TokenPlanBo.requireChange (forms past the plan are read only)', () => {
  const dwarf = { id: 'form-dwarf', name: 'Anão', imageAssetId: 'asset-dwarf' };
  const wolf = { id: 'form-wolf', name: 'Lobo', imageAssetId: 'asset-wolf' };
  const bear = { id: 'form-bear', name: 'Urso', imageAssetId: 'asset-bear' };
  const held = { bars: 0, forms: 3, auraKind: null, formSettings: [dwarf, wolf, bear] };
  const sending = (formSettings: TokenFormSetting[]) => ({
    forms: formSettings.length,
    formSettings,
  });

  it('a new image on the 3rd form of a free table is tokenForms read only, the 3rd item', () => {
    const repainted = sending([dwarf, wolf, { ...bear, imageAssetId: 'asset-other' }]);
    expect(readOnlyOf(() => free.requireChange(held, repainted))).toEqual({
      resource: 'tokenForms',
      reason: 'readOnly',
      stored: 3,
    });
  });

  it('a new name on the 3rd form is read only too', () => {
    const renamed = sending([dwarf, wolf, { ...bear, name: 'Urso velho' }]);
    expect(readOnlyOf(() => free.requireChange(held, renamed)).stored).toBe(3);
  });

  it('the 2nd form (under the ceiling of 2) takes a new image and name', () => {
    const changed = sending([dwarf, { ...wolf, name: 'Lobo atroz', imageAssetId: null }, bear]);
    expect(() => free.requireChange(held, changed)).not.toThrow();
  });

  it('deleting the 1st form, or reordering them, passes while the 3rd stays as it was', () => {
    expect(() => free.requireChange(held, sending([wolf, bear]))).not.toThrow();
    expect(() => free.requireChange(held, sending([bear, dwarf, wolf]))).not.toThrow();
  });

  it('swapping the 3rd form for a new one (another id) is tokenForms room: no room is left', () => {
    const replaced = sending([dwarf, wolf, { id: 'form-new', name: 'Urso', imageAssetId: null }]);
    expect(refusalOf(() => free.requireChange(held, replaced))).toEqual({
      resource: 'tokenForms',
      limit: 2,
      plan: 'free',
    });
  });

  it('deleting two forms makes room for a new one', () => {
    const renewed = sending([dwarf, { id: 'form-new', name: 'Corvo', imageAssetId: null }]);
    expect(() => free.requireChange(held, renewed)).not.toThrow();
  });

  it('on narrador (4 forms) the 3rd form takes a new image', () => {
    const repainted = sending([dwarf, wolf, { ...bear, imageAssetId: null }]);
    expect(() => narrator.requireChange(held, repainted)).not.toThrow();
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

  it('the 6th on narrador is refused; the 5th passes', () => {
    expect(() => narrator.requireBlockers(4, 1)).not.toThrow();
    expect(refusalOf(() => narrator.requireBlockers(5, 1)).limit).toBe(5);
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
