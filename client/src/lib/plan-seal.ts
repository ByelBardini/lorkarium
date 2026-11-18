import { higherPlanOf, type UserPlan, type UserRoleDto } from '@lorkarium/contracts';
import type { MemberColor } from '@lorkarium/game-core';

/** What a seal stands for: the Dono do Lorkarium, the global admin, or a plan above Grátis. */
export type PlanSealKind = 'lorkarium_owner' | 'admin' | Exclude<UserPlan, 'free'>;

export type PlanSealLook = Readonly<{
  kind: PlanSealKind;
  label: string;
  accessibleName: string;
  color: MemberColor;
}>;

/** What a person's seal is picked from: the stored plan, the global role and
 *  whether the account is the Dono do Lorkarium (the server's OWNER_USERNAME). */
export type PlanSealHolder = Readonly<{
  plan: UserPlan;
  admin: boolean;
  lorkariumOwner: boolean;
}>;

/** The name of each master plan as the screens write it, cheapest first.
 *
 *  Example: `PLAN_NAMES.amigo_do_dono // 'Amigo do Dono'` */
export const PLAN_NAMES: Readonly<Record<UserPlan, string>> = {
  free: 'Grátis',
  apoiador: 'Apoiador',
  narrador: 'Narrador',
  lenda: 'Lenda',
  amigo_do_dono: 'Amigo do Dono',
};

function planLook(plan: Exclude<UserPlan, 'free'>, color: MemberColor): PlanSealLook {
  const label = PLAN_NAMES[plan];
  return { kind: plan, label, accessibleName: `Plano ${label}`, color };
}

// Gold goes to the highest paid plan; the crown already marks the owner of a table.
const PLAN_SEAL_LOOKS: Readonly<Record<PlanSealKind, PlanSealLook>> = {
  lorkarium_owner: {
    kind: 'lorkarium_owner',
    label: 'Dono',
    accessibleName: 'Dono do Lorkarium',
    color: 'bone',
  },
  admin: { kind: 'admin', label: 'Admin', accessibleName: 'Administrador', color: 'ember' },
  // The Apoiador is named without "Plano": it reads as who supports the house.
  apoiador: { kind: 'apoiador', label: 'Apoiador', accessibleName: 'Apoiador', color: 'violet' },
  narrador: planLook('narrador', 'steel'),
  lenda: planLook('lenda', 'gold'),
  // The Amigo do Dono, like the Apoiador, is named without "Plano".
  amigo_do_dono: {
    kind: 'amigo_do_dono',
    label: 'Amigo do Dono',
    accessibleName: 'Amigo do Dono',
    color: 'rose',
  },
};

function sealKindOf(holder: PlanSealHolder): PlanSealKind | null {
  if (holder.lorkariumOwner) return 'lorkarium_owner';
  if (holder.admin) return 'admin';
  return holder.plan === 'free' ? null : holder.plan;
}

/** The one seal a person shows, the highest: Dono do Lorkarium > Admin > Amigo do Dono > Lenda >
 *  Narrador > Apoiador; `null` for Grátis (not admin nor Dono).
 *
 *  Example: `planSealOf({ plan: 'lenda', admin: true, lorkariumOwner: false })?.label // 'Admin'` */
export function planSealOf(holder: PlanSealHolder): PlanSealLook | null {
  const kind = sealKindOf(holder);
  return kind === null ? null : PLAN_SEAL_LOOKS[kind];
}

/** An account as `/me` and the backoffice carry it (the global `role`, the admin's plan and the
 *  paid one in force) → what its seal is picked from: the higher of the two plans.
 *
 *  Example: `sealHolderOfAccount(session.user).admin // true for an admin` */
export function sealHolderOfAccount(
  account: Readonly<{
    role: UserRoleDto;
    plan: UserPlan;
    paidPlan?: UserPlan | null;
    lorkariumOwner: boolean;
  }>,
): PlanSealHolder {
  const plan = higherPlanOf(account.plan, account.paidPlan ?? null);
  return { plan, admin: account.role === 'admin', lorkariumOwner: account.lorkariumOwner };
}

/** How a plan is named to its holder: the Dono do Lorkarium and the admin by who they are (the
 *  stored plan gives them nothing), everyone else by the plan.
 *
 *  Example: `planTitleOf({ plan: 'free', admin: true, lorkariumOwner: false }) // 'Administrador'` */
export function planTitleOf(holder: PlanSealHolder): string {
  if (holder.lorkariumOwner) return 'Dono do Lorkarium';
  if (holder.admin) return 'Administrador';
  return PLAN_NAMES[holder.plan];
}

/** Whether the account is above every plan on sale (no plan limit): the admin, the Dono do
 *  Lorkarium and the Amigo do Dono.
 *
 *  Example: `isAbovePlans({ plan: 'free', admin: true, lorkariumOwner: false }) // true` */
export function isAbovePlans(holder: PlanSealHolder): boolean {
  return holder.admin || holder.lorkariumOwner || holder.plan === 'amigo_do_dono';
}
