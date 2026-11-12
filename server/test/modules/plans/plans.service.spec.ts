import { PLAN_LIMITS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { PlansService } from '../../../src/modules/plans/plans.service';
import { ANA_ID } from '../../support/auth-factories';
import { QUOTA_NOW, StorageUsageFake } from '../../support/asset-quota-fakes';
import { ClockFake } from '../../support/auth-fakes';
import { planAccount } from '../../support/plan-account-fakes';
import { AccountPlansFake, OwnedCampaignsFake } from '../../support/plans-fakes';

function serviceWith(
  accounts: AccountPlansFake,
  campaigns: OwnedCampaignsFake,
  storage = new StorageUsageFake(),
): PlansService {
  return new PlansService({ accounts, campaigns, storage, clock: new ClockFake(QUOTA_NOW) });
}

describe('PlansService.accountPlanOf', () => {
  it('a free account with one table gets its plan, the free limits and the usage', async () => {
    const accounts = new AccountPlansFake().set(ANA_ID, planAccount({ plan: 'free' }));
    const service = serviceWith(accounts, new OwnedCampaignsFake().set(ANA_ID, 1));

    expect(await service.accountPlanOf(ANA_ID)).toEqual({
      plan: 'free',
      limits: PLAN_LIMITS.free,
      customization: false,
      usage: { campaignsOwned: 1, storageBytes: 0 },
    });
  });

  it('the storage usage is what the owned tables keep, counted up to the 24 h grace cutoff', async () => {
    const accounts = new AccountPlansFake().set(ANA_ID, planAccount({ plan: 'free' }));
    const storage = new StorageUsageFake().set(ANA_ID, 52_428_800);

    const plan = await serviceWith(accounts, new OwnedCampaignsFake(), storage).accountPlanOf(
      ANA_ID,
    );

    expect(plan.usage.storageBytes).toBe(52_428_800);
    expect(storage.asked).toEqual([{ ownerId: ANA_ID, cutoff: new Date('2026-11-10T12:00:00Z') }]);
  });

  it('an admin on free keeps its stored plan but gets the limits of amigo_do_dono', async () => {
    const admin = planAccount({ role: 'admin', plan: 'free' });
    const service = serviceWith(
      new AccountPlansFake().set(ANA_ID, admin),
      new OwnedCampaignsFake(),
    );

    const plan = await service.accountPlanOf(ANA_ID);

    expect(plan).toMatchObject({ plan: 'free', customization: true });
    expect(plan.limits).toEqual(PLAN_LIMITS.amigo_do_dono);
  });

  it('the Apoiador opens the customization and keeps the table limits of free', async () => {
    const apoiador = planAccount({ plan: 'apoiador' });
    const accounts = new AccountPlansFake().set(ANA_ID, apoiador);

    const plan = await serviceWith(accounts, new OwnedCampaignsFake()).accountPlanOf(ANA_ID);

    expect(plan).toMatchObject({ plan: 'apoiador', customization: true });
    expect(plan.limits).toEqual({ ...PLAN_LIMITS.free, plan: 'apoiador' });
  });

  it('an account that is gone fails naming the id', async () => {
    const service = serviceWith(new AccountPlansFake(), new OwnedCampaignsFake());

    await expect(service.accountPlanOf(ANA_ID)).rejects.toThrow(ANA_ID);
  });
});
