import { PLAN_LIMITS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  availableInText,
  countGate,
  customizationGate,
  featureGate,
  planLockGate,
} from '@/features/plans/plan-gate';

describe('countGate', () => {
  it('a free table with 3 grids has no room for a 4th: the refusal sentence is the hint', () => {
    expect(countGate(PLAN_LIMITS.free, 'scenes', 3)).toEqual({
      open: false,
      hint: 'Esta mesa usa o plano Grátis, que permite até 3 grids. O Narrador libera 15.',
    });
  });

  it('below the ceiling it stays open', () => {
    expect(countGate(PLAN_LIMITS.free, 'scenes', 2).open).toBe(true);
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
    expect(countGate(PLAN_LIMITS.free, 'patrols', 0).hint).toBe('Disponível no plano Narrador');
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
  it('a feature the plan lacks says where it is: "Disponível no plano Narrador"', () => {
    expect(featureGate(PLAN_LIMITS.free, (limits) => limits.sceneCopy)).toEqual({
      open: false,
      hint: 'Disponível no plano Narrador',
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
    expect(availableInText((limits) => limits.maxPatrols >= 30)).toBe('Disponível no plano Lenda');
  });

  it.each([
    ['desktopWindows', 'Disponível no plano Lenda'],
    ['animatedCampaignArt', 'Disponível no plano Lenda'],
    ['sheetScripts', 'Disponível no plano Narrador'],
  ] as const)('the %s feature reads "%s"', (feature, text) => {
    expect(availableInText((limits) => limits[feature])).toBe(text);
  });

  it('no plan on offer has it: the paid plans', () => {
    expect(availableInText(() => false)).toBe('Disponível nos planos pagos');
  });
});

describe('planLockGate', () => {
  it('a grid the server marks planLocked is closed with the read-only sentence', () => {
    expect(planLockGate(PLAN_LIMITS.free, 'scenes', { planLocked: true })).toEqual({
      open: false,
      hint: 'Este grid passou do limite do plano Grátis (3) e está só leitura. Apague um grid mais antigo ou suba de plano.',
    });
  });

  it('the sentence names the resource and the ceiling of the table plan', () => {
    expect(planLockGate(PLAN_LIMITS.narrador, 'documentTabs', { planLocked: true }).hint).toMatch(
      /^Esta aba passou do limite do plano Narrador \(10\)/,
    );
  });

  it('an item without planLocked stays open', () => {
    expect(planLockGate(PLAN_LIMITS.free, 'scenes', { planLocked: false })).toEqual({
      open: true,
      hint: null,
    });
  });

  it('a locked item with no limits known still reads as read only, without a plan to name', () => {
    expect(planLockGate(null, 'savedRolls', { planLocked: true })).toEqual({
      open: false,
      hint: 'Este item passou do limite do plano da mesa e está só leitura.',
    });
  });
});

describe('customizationGate', () => {
  it('an account that may not customize gets the hint', () => {
    expect(customizationGate(false)).toEqual({ open: false, hint: 'Disponível no plano Apoiador' });
  });

  it.each([true, null])('customization %s is open', (customization) => {
    expect(customizationGate(customization).open).toBe(true);
  });
});
