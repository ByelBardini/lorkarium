import { z } from 'zod';
import { planLimitsDto } from './plan-limits';
import { userPlanDto } from './user-plan.dto';

const usageCount = z.number().int().nonnegative();

/** What the account already spends of the limits counted on it: the tables it owns (any status)
 *  and the bytes of their files. */
export const accountPlanUsageDto = z.strictObject({
  campaignsOwned: usageCount,
  storageBytes: usageCount,
});
export type AccountPlanUsageDto = z.infer<typeof accountPlanUsageDto>;

/** Response of `GET /api/account/plan` ("Seu plano"): the stored plan, the
 *  effective limits (an admin gets those of `amigo_do_dono`), whether the account's own
 *  customizations are open, and the usage.
 *
 *  Example: `accountPlanDto.parse(body).usage.campaignsOwned // 1` */
export const accountPlanDto = z.strictObject({
  plan: userPlanDto,
  limits: planLimitsDto,
  customization: z.boolean(),
  usage: accountPlanUsageDto,
});
export type AccountPlanDto = z.infer<typeof accountPlanDto>;
