import type { AccountPlanDto, AccountPlanUsageDto } from '@lorkarium/contracts';
import type { AccountPlanPo } from './plans.dao';
import { customizationAllowed, effectiveLimitsOf } from './plan-limits.bo';

/** PO + usage → DTO: the admin's plan, the paid one in force and its end, the mark, the effective limits and the customization flag.
 *
 *  Example: `toAccountPlanDto(account, { campaignsOwned: 1, storageBytes: 0 }).limits.maxCampaigns // 1` */
export function toAccountPlanDto(
  account: AccountPlanPo,
  usage: AccountPlanUsageDto,
): AccountPlanDto {
  return {
    plan: account.plan,
    paidPlan: account.activePaidPlan,
    paidPlanUntil: account.activePaidPlanUntil?.toISOString() ?? null,
    limits: effectiveLimitsOf(account),
    customization: customizationAllowed(account),
    usage,
  };
}
