import { describe, expect, it } from 'vitest';
import {
  isAbovePlans,
  PLAN_NAMES,
  planSealOf,
  planTitleOf,
  sealHolderOfAccount,
  type PlanSealHolder,
} from '@/lib/plan-seal';

const PLAIN: PlanSealHolder = {
  plan: 'free',
  admin: false,
  lorkariumOwner: false,
};

describe('PLAN_NAMES', () => {
  it('names every plan as the screens write it, Grátis included', () => {
    expect(PLAN_NAMES).toEqual({
      free: 'Grátis',
      apoiador: 'Apoiador',
      narrador: 'Narrador',
      lenda: 'Lenda',
      amigo_do_dono: 'Amigo do Dono',
    });
  });
});

describe('planSealOf', () => {
  it('Grátis, not admin nor Dono, has no seal', () => {
    expect(planSealOf(PLAIN)).toBeNull();
  });

  it.each([
    ['narrador', 'Narrador', 'steel'],
    ['lenda', 'Lenda', 'gold'],
  ] as const)('%s gives the "%s" seal in %s', (plan, label, color) => {
    expect(planSealOf({ ...PLAIN, plan })).toEqual({
      kind: plan,
      label,
      accessibleName: `Plano ${label}`,
      color,
    });
  });

  it('the Amigo do Dono is named without "Plano", in rose', () => {
    expect(planSealOf({ ...PLAIN, plan: 'amigo_do_dono' })).toEqual({
      kind: 'amigo_do_dono',
      label: 'Amigo do Dono',
      accessibleName: 'Amigo do Dono',
      color: 'rose',
    });
  });

  it('the Apoiador plan shows the violet "Apoiador"', () => {
    expect(planSealOf({ ...PLAIN, plan: 'apoiador' })).toEqual({
      kind: 'apoiador',
      label: 'Apoiador',
      accessibleName: 'Apoiador',
      color: 'violet',
    });
  });

  it('an admin shows the ember "Admin", named "Administrador"', () => {
    expect(planSealOf({ ...PLAIN, admin: true })).toEqual({
      kind: 'admin',
      label: 'Admin',
      accessibleName: 'Administrador',
      color: 'ember',
    });
  });

  it('the Dono do Lorkarium shows the bone "Dono"', () => {
    expect(planSealOf({ ...PLAIN, lorkariumOwner: true })).toEqual({
      kind: 'lorkarium_owner',
      label: 'Dono',
      accessibleName: 'Dono do Lorkarium',
      color: 'bone',
    });
  });

  // One seal only, the highest: Dono > Admin > Amigo do Dono > Lenda > Narrador > Apoiador.
  it.each([
    [
      'the Dono over the admin and any plan',
      { lorkariumOwner: true, admin: true, plan: 'lenda' },
      'lorkarium_owner',
    ],
    ['Admin over any plan', { admin: true, plan: 'amigo_do_dono' }, 'admin'],
    ['Admin over the Apoiador', { admin: true, plan: 'apoiador' }, 'admin'],
    ['Amigo do Dono', { plan: 'amigo_do_dono' }, 'amigo_do_dono'],
    ['Lenda', { plan: 'lenda' }, 'lenda'],
    ['Narrador', { plan: 'narrador' }, 'narrador'],
    ['Apoiador', { plan: 'apoiador' }, 'apoiador'],
  ] as const)('%s', (_case, holder, kind) => {
    expect(planSealOf({ ...PLAIN, ...holder })?.kind).toBe(kind);
  });
});

describe('sealHolderOfAccount', () => {
  it('reads the admin from the global role of the account', () => {
    const account = {
      role: 'admin',
      plan: 'lenda',
      lorkariumOwner: false,
    } as const;

    expect(sealHolderOfAccount(account)).toEqual({
      plan: 'lenda',
      admin: true,
      lorkariumOwner: false,
    });
  });

  it('a user role is no admin', () => {
    const account = { role: 'user', plan: 'free', lorkariumOwner: true } as const;

    expect(sealHolderOfAccount(account).admin).toBe(false);
  });
});

describe('sealHolderOfAccount with a paid plan', () => {
  it('a free account paying the Lenda shows the Lenda', () => {
    const account = {
      role: 'user',
      plan: 'free',
      paidPlan: 'lenda',
      lorkariumOwner: false,
    } as const;
    expect(sealHolderOfAccount(account).plan).toBe('lenda');
  });

  it('a Lenda of the admin paying the Narrador keeps the Lenda', () => {
    const account = {
      role: 'user',
      plan: 'lenda',
      paidPlan: 'narrador',
      lorkariumOwner: false,
    } as const;
    expect(sealHolderOfAccount(account).plan).toBe('lenda');
  });

  it('an admin paying the Apoiador is still picked as admin', () => {
    const account = {
      role: 'admin',
      plan: 'free',
      paidPlan: 'apoiador',
      lorkariumOwner: false,
    } as const;
    expect(planSealOf(sealHolderOfAccount(account))?.kind).toBe('admin');
  });
});

describe('planTitleOf', () => {
  it('names who has no plan limit by who they are, never by the stored plan', () => {
    expect(planTitleOf({ plan: 'free', admin: false, lorkariumOwner: true })).toBe(
      'Dono do Lorkarium',
    );
    expect(planTitleOf({ plan: 'free', admin: true, lorkariumOwner: false })).toBe('Administrador');
  });

  it('names everyone else by the plan, the Amigo do Dono included', () => {
    expect(planTitleOf({ plan: 'amigo_do_dono', admin: false, lorkariumOwner: false })).toBe(
      'Amigo do Dono',
    );
    expect(planTitleOf({ plan: 'narrador', admin: false, lorkariumOwner: false })).toBe('Narrador');
  });
});

describe('isAbovePlans', () => {
  it('is true for the admin, the Dono do Lorkarium and the Amigo do Dono', () => {
    expect(isAbovePlans({ plan: 'free', admin: true, lorkariumOwner: false })).toBe(true);
    expect(isAbovePlans({ plan: 'free', admin: false, lorkariumOwner: true })).toBe(true);
    expect(isAbovePlans({ plan: 'amigo_do_dono', admin: false, lorkariumOwner: false })).toBe(true);
    expect(isAbovePlans({ plan: 'lenda', admin: false, lorkariumOwner: false })).toBe(false);
  });
});
