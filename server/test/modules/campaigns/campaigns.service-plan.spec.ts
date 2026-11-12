import { beforeEach, describe, expect, it } from 'vitest';
import { CampaignsService } from '../../../src/modules/campaigns/campaigns.service';
import { PlanLimitError } from '../../../src/modules/plans/plans.error';
import { ClockFake, PasswordHasherFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { PresenceReaderFake } from '../../support/campaign-settings-fakes';
import { campaignPo } from '../../support/campaigns-factories';
import {
  CampaignCodeFake,
  CampaignMembersDaoFake,
  CampaignsDaoFake,
  ConditionDefinitionsFake,
  TransactionRunnerFake,
} from '../../support/campaigns-fakes';
import { PlanAccountsFake, planAccount } from '../../support/plan-account-fakes';
import { ScenesDaoFake } from '../../support/scenes-fakes';

const NOW = new Date('2026-11-11T21:00:00Z');
const NEW_CAMPAIGN = {
  name: 'A Torre',
  system: null,
  status: 'building',
  description: null,
  visibility: 'private',
} as const;

describe('CampaignsService.create against the owner plan', () => {
  let campaigns: CampaignsDaoFake;
  let owners: PlanAccountsFake;
  let runner: TransactionRunnerFake;
  let service: CampaignsService;

  function ownedByAna(total: number): void {
    for (let index = 0; index < total; index += 1) {
      campaigns.rows.push(
        campaignPo({ id: `owned-${index}`, ownerId: ANA_ID, joinCode: `OWN${index}` }),
      );
    }
  }

  beforeEach(() => {
    campaigns = new CampaignsDaoFake();
    const members = new CampaignMembersDaoFake(campaigns, { [ANA_ID]: 'Ana' });
    owners = new PlanAccountsFake();
    const scenes = new ScenesDaoFake();
    const conditions = new ConditionDefinitionsFake();
    runner = new TransactionRunnerFake({ campaigns, members, scenes, conditions, owners });
    service = new CampaignsService({
      campaigns,
      members,
      memberships: members,
      presence: new PresenceReaderFake(),
      transaction: runner.run,
      codes: new CampaignCodeFake(['VHRN7K2Q', 'PNTN2345']),
      hasher: new PasswordHasherFake(),
      clock: new ClockFake(NOW),
    });
  });

  it('locks the owner and counts its tables inside the transaction, before the insert', async () => {
    owners.set(ANA_ID, planAccount({ plan: 'free' }));

    await service.create(ANA_ID, NEW_CAMPAIGN);

    expect(owners.asked).toEqual([ANA_ID]);
    expect(runner.writesInside.slice(0, 3)).toEqual([
      'owners.lockForPlan',
      'campaigns.countOwnedBy',
      'campaigns.insert',
    ]);
  });

  it('a free owner with no table creates the first', async () => {
    owners.set(ANA_ID, planAccount({ plan: 'free' }));

    await expect(service.create(ANA_ID, NEW_CAMPAIGN)).resolves.toMatchObject({ name: 'A Torre' });
  });

  it('a free owner with one table is refused PLAN_LIMIT campaigns 1 free, and nothing is written', async () => {
    owners.set(ANA_ID, planAccount({ plan: 'free' }));
    ownedByAna(1);

    const refusal = service.create(ANA_ID, NEW_CAMPAIGN);

    await expect(refusal).rejects.toBeInstanceOf(PlanLimitError);
    await expect(refusal).rejects.toMatchObject({
      code: 'PLAN_LIMIT',
      resource: 'campaigns',
      limit: 1,
      plan: 'free',
    });
    expect(campaigns.rows).toHaveLength(1);
    expect(runner.writesInside).not.toContain('campaigns.insert');
  });

  it('a narrador owner with 4 tables creates the 5th and is refused the 6th', async () => {
    owners.set(ANA_ID, planAccount({ plan: 'narrador' }));
    ownedByAna(4);

    await service.create(ANA_ID, NEW_CAMPAIGN);

    await expect(service.create(ANA_ID, NEW_CAMPAIGN)).rejects.toMatchObject({
      resource: 'campaigns',
      limit: 5,
      plan: 'narrador',
    });
  });

  it('an amigo_do_dono owner with 7 tables creates the 8th', async () => {
    owners.set(ANA_ID, planAccount({ plan: 'amigo_do_dono' }));
    ownedByAna(7);

    await service.create(ANA_ID, NEW_CAMPAIGN);

    expect(campaigns.rows).toHaveLength(8);
  });

  it('an admin on free with 3 tables creates the 4th', async () => {
    owners.set(ANA_ID, planAccount({ role: 'admin', plan: 'free' }));
    ownedByAna(3);

    await service.create(ANA_ID, NEW_CAMPAIGN);

    expect(campaigns.rows).toHaveLength(4);
  });
});
