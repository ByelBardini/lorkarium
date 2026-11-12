import type { AccountPlanDto, AccountPlanUsageDto } from '@lorkarium/contracts';
import type { UserPlanPo } from '../auth/users.po';
import { customizationAllowed, effectiveLimitsOf } from './plan-limits.bo';

/** PO + usage → DTO: the stored plan and mark, the effective limits and the customization flag.
 *
 *  Example: `toAccountPlanDto(account, { campaignsOwned: 1, storageBytes: 0 }).limits.maxCampaigns // 1` */
export function toAccountPlanDto(account: UserPlanPo, usage: AccountPlanUsageDto): AccountPlanDto {
  return {
    plan: account.plan,
    limits: effectiveLimitsOf(account),
    customization: customizationAllowed(account),
    usage,
  };
}
