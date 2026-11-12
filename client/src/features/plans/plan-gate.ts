import {
  PLAN_COUNT_LIMIT_KEY,
  PLAN_LIMITS,
  type PlanCountResource,
  type PlanLimits,
  type UserPlan,
} from '@lorkarium/contracts';
import { planLimitMessage } from '@/lib/plan-limit-message';
import { PLAN_NAMES } from '@/lib/plan-seal';

/** Whether a control the plan rules is offered: `hint` says why not (the plan's sentence). */
export type PlanGate =
  Readonly<{ open: true; hint: null }> | Readonly<{ open: false; hint: string }>;

/** The gate of everything the plan does not stop. */
export const OPEN_GATE: PlanGate = { open: true, hint: null };

// Amigo do Dono is given, never bought, and the Apoiador opens only the account: a hint only
// points at the master plans one can move to.
const PLANS_ON_OFFER: readonly Exclude<UserPlan, 'free' | 'apoiador' | 'amigo_do_dono'>[] = [
  'narrador',
  'lenda',
];

const IN_PLAN: Readonly<Record<(typeof PLANS_ON_OFFER)[number], string>> = {
  narrador: 'no Narrador',
  lenda: 'na Lenda',
};

/** "Disponível no Narrador": the cheapest plan on offer that has what `has` asks of a grid.
 *
 *  Example: `availableInText((limits) => limits.sceneCopy) // 'Disponível no Narrador'` */
export function availableInText(has: (limits: PlanLimits) => boolean): string {
  const plan = PLANS_ON_OFFER.find((offer) => has(PLAN_LIMITS[offer]));
  return plan === undefined ? 'Disponível nos planos pagos' : `Disponível ${IN_PLAN[plan]}`;
}

/** Whether one more of a counted resource fits, `stored` being how many there are. Open with no
 *  limits known, no ceiling, or a ceiling at the technical one (that refusal stays as it was);
 *  a ceiling of 0 says which plan has it.
 *
 *  Example: `countGate(PLAN_LIMITS.free, 'scenes', 5).hint // 'Esta mesa usa o plano Grátis, que permite até 5 grids. O Narrador libera 20.'` */
export function countGate(
  limits: PlanLimits | null,
  resource: PlanCountResource,
  stored: number,
): PlanGate {
  if (limits === null) return OPEN_GATE;
  const key = PLAN_COUNT_LIMIT_KEY[resource];
  const limit = limits[key];
  const technical = PLAN_LIMITS.amigo_do_dono[key];
  if (limit === null || (technical !== null && limit >= technical)) return OPEN_GATE;
  if (limit === 0) return closed(availableInText((offer) => offer[key] !== 0));
  if (stored < limit) return OPEN_GATE;
  return closed(planLimitMessage({ resource, limit, plan: limits.plan }));
}

/** Whether a feature of the grid is offered: open with no limits known or when `has` holds.
 *
 *  Example: `featureGate(PLAN_LIMITS.free, (limits) => limits.conditionImage).hint // 'Disponível no Narrador'` */
export function featureGate(
  limits: PlanLimits | null,
  has: (limits: PlanLimits) => boolean,
): PlanGate {
  if (limits === null || has(limits)) return OPEN_GATE;
  return closed(availableInText(has));
}

function closed(hint: string): PlanGate {
  return { open: false, hint };
}

/** The account's own customizations (custom color, dice texture): open when it may customize.
 *
 *  Example: `customizationGate(false).hint // 'Disponível no Apoiador'` */
export function customizationGate(customization: boolean | null): PlanGate {
  if (customization !== false) return OPEN_GATE;
  // The account customizations are the one thing Apoiador unlocks, so it is the cheapest plan to name.
  return closed(`Disponível no ${PLAN_NAMES.apoiador}`);
}

/** The `aria-describedby` of a control under a `PlanGateHint` with that `id`.
 *
 *  Example: `<Button disabled={!gate.open} aria-describedby={planHintIdOf(gate, 'x')} />` */
export function planHintIdOf(gate: PlanGate, id: string): string | undefined {
  return gate.open ? undefined : id;
}
