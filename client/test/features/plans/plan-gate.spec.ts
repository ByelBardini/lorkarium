import { PLAN_LIMITS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  availableInText,
  countGate,
  customizationGate,
  featureGate,
} from '@/features/plans/plan-gate';

describe('countGate', () => {
  it('a free table with 5 grids has no room for a 6th: the refusal sentence is the hint', () => {
    expect(countGate(PLAN_LIMITS.free, 'scenes', 5)).toEqual({
      open: false,
      hint: 'Esta mesa usa o plano Grátis, que permite até 5 grids. O Narrador libera 20.',
    });
  });

  it('below the ceiling it stays open', () => {
    expect(countGate(PLAN_LIMITS.free, 'scenes', 4).open).toBe(true);
  });

  it('above the ceiling (a plan that came down) it stays closed', () => {
    expect(countGate(PLAN_LIMITS.free, 'libraryMaps', 3).open).toBe(false);
  });

  it('the account ceiling speaks of the account: "Seu plano Grátis permite até 1 mesa como dono"', () => {
    expect(countGate(PLAN_LIMITS.free, 'campaigns', 1).hint).toMatch(
      /^Seu plano Grátis permite até 1 mesa como dono\./,
    );
  });

  it('a ceiling of 0 names the cheapest plan that has it', () => {
    expect(countGate(PLAN_LIMITS.free, 'patrols', 0).hint).toBe('Disponível no Narrador');
  });

  it('Amigo do Dono has no ceiling: open whatever the count', () => {
    expect(countGate(PLAN_LIMITS.amigo_do_dono, 'scenes', 10_000).open).toBe(true);
  });

  it('a ceiling at the technical one stays open: the technical refusal is the same for all', () => {
    expect(countGate(PLAN_LIMITS.lenda, 'lights', PLAN_LIMITS.lenda.maxLights).open).toBe(true);
  });

  it('with no limits known (outside a table) nothing is stopped', () => {
    expect(countGate(null, 'scenes', 10_000).open).toBe(true);
  });
});

describe('featureGate', () => {
  it('a feature the plan lacks says where it is: "Disponível no Narrador"', () => {
    expect(featureGate(PLAN_LIMITS.free, (limits) => limits.sceneCopy)).toEqual({
      open: false,
      hint: 'Disponível no Narrador',
    });
  });

  it('a feature the plan has is open', () => {
    expect(featureGate(PLAN_LIMITS.narrador, (limits) => limits.sceneCopy).open).toBe(true);
  });

  it('no limits known: open', () => {
    expect(featureGate(null, (limits) => limits.sceneCopy).open).toBe(true);
  });
});

describe('availableInText', () => {
  it('says "na Lenda" when only Lenda has it', () => {
    expect(availableInText((limits) => limits.maxPatrols >= 30)).toBe('Disponível na Lenda');
  });

  it('no plan on offer has it: the paid plans', () => {
    expect(availableInText(() => false)).toBe('Disponível nos planos pagos');
  });
});

describe('customizationGate', () => {
  it('an account that may not customize gets the hint', () => {
    expect(customizationGate(false)).toEqual({ open: false, hint: 'Disponível no Apoiador' });
  });

  it.each([true, null])('customization %s is open', (customization) => {
    expect(customizationGate(customization).open).toBe(true);
  });
});
