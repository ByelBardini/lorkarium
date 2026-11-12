import type { AccountPlanDto } from '@lorkarium/contracts';
import type { AssetReferencesDao } from '../assets/asset-references.dao';
import { looseCutoffOf } from '../assets/asset-quota.bo';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignsDao } from '../campaigns/campaigns.dao';
import { toAccountPlanDto } from './plans.mapper';
import type { PlansDao } from './plans.dao';

export type PlansServiceDeps = Readonly<{
  accounts: Pick<PlansDao, 'accountOf'>;
  campaigns: Pick<CampaignsDao, 'countOwnedBy'>;
  storage: Pick<AssetReferencesDao, 'usageOfOwner'>;
  clock: ClockPort;
}>;

/** "Seu plano": what the signed-in account has and spends. Only reads, always of the session's
 *  account.
 *
 *  Example: `await plansService.accountPlanOf(userOf(request).id) // { plan: 'free', … }` */
export class PlansService {
  constructor(private readonly deps: PlansServiceDeps) {}

  async accountPlanOf(userId: string): Promise<AccountPlanDto> {
    const account = await this.deps.accounts.accountOf(userId);
    if (!account) throw new Error(`plan of account ${userId}: expected an existing account`);
    const campaignsOwned = await this.deps.campaigns.countOwnedBy(userId);
    const cutoff = looseCutoffOf(this.deps.clock.now());
    const storageBytes = await this.deps.storage.usageOfOwner(userId, cutoff);
    return toAccountPlanDto(account, { campaignsOwned, storageBytes });
  }
}
