import { z } from 'zod';

/** The plans of an account, one each, cheapest first: the order the client walks to name the plan
 *  that frees a limit. `apoiador` keeps the tables on the Grátis grid and opens only the
 *  account's own customizations; `amigo_do_dono` keeps today's behavior (only the technical
 *  ceilings). */
export const USER_PLANS = ['free', 'apoiador', 'narrador', 'lenda', 'amigo_do_dono'] as const;

/** One master plan of an account (`users.plan`).
 *
 *  Example: `userPlanDto.parse('lenda') // 'lenda'` */
export const userPlanDto = z.enum(USER_PLANS, {
  error: (issue) => `plan ${JSON.stringify(issue.input)}: expected one of ${USER_PLANS.join(', ')}`,
});
export type UserPlan = z.infer<typeof userPlanDto>;

/** Ceilings counted against a number of the grid: `stored + adding` may not pass it. */
export const PLAN_COUNT_RESOURCES = [
  'campaigns',
  'storage',
  'players',
  'masters',
  'spectators',
  'scenes',
  'libraryMaps',
  'sheetTemplates',
  'npcSheets',
  'documentTabs',
  'lights',
  'tokenBars',
  'tokenForms',
  'patrols',
  'sightBlockers',
  'savedRolls',
  'savedRollFolders',
] as const;

/** Things a plan has or has not: the table's (`sceneCopy`, `auraKind`…) or, for `diceTexture`,
 *  `animatedAvatar` and `customColor` on the account, the person's own customization. */
export const PLAN_FEATURE_RESOURCES = [
  'sceneCopy',
  'conditionImage',
  'auraKind',
  'desktopWindows',
  'customColor',
  'diceTexture',
  'animatedAvatar',
] as const;

/** Every resource a `PLAN_LIMIT` refusal may name. The dice with physics are not here: past the
 *  plan they are drawn without a model, never refused.
 *
 *  Example: `planLimitResourceDto.parse('scenes')` */
export const PLAN_LIMIT_RESOURCES = [...PLAN_COUNT_RESOURCES, ...PLAN_FEATURE_RESOURCES] as const;
export const planLimitResourceDto = z.enum(PLAN_LIMIT_RESOURCES);
export type PlanLimitResource = z.infer<typeof planLimitResourceDto>;
export type PlanCountResource = (typeof PLAN_COUNT_RESOURCES)[number];
export type PlanFeatureResource = (typeof PLAN_FEATURE_RESOURCES)[number];

/** What a `PLAN_LIMIT` error body carries: the client builds the pt-BR sentence from it. `limit`
 *  is the ceiling of the plan (0 for a feature the plan lacks); `plan` is the one whose limits
 *  apply (the table owner's, or the person's own for a customization of the account).
 *
 *  Example: `planLimitDto.parse({ resource: 'campaigns', limit: 1, plan: 'free' })` */
export const planLimitDto = z.strictObject({
  resource: planLimitResourceDto,
  limit: z.number().int().nonnegative(),
  plan: userPlanDto,
});
export type PlanLimitDto = z.infer<typeof planLimitDto>;

/** The `code` of every refusal for passing the plan, HTTP 403 and Socket.IO ack alike. */
export const PLAN_LIMIT_CODE = 'PLAN_LIMIT';
