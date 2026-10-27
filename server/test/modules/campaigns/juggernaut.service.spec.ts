import { beforeEach, describe, expect, it } from 'vitest';
import { CampaignsService } from '../../../src/modules/campaigns/campaigns.service';
import { JuggernautService } from '../../../src/modules/campaigns/juggernaut.service';
import { ClockFake, PasswordHasherFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { PresenceReaderFake } from '../../support/campaign-settings-fakes';
import {
  CampaignCodeFake,
  CampaignsDaoFake,
  ConditionDefinitionsFake,
  TransactionRunnerFake,
} from '../../support/campaigns-fakes';
import {
  BIA_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberPo,
  campaignPo,
} from '../../support/campaigns-factories';
import { JuggernautMembersFake, MemberRemovedFake } from '../../support/juggernaut-fakes';
import { ForgottenMembershipsFake, MemberRoleChangedFake } from '../../support/member-role-fakes';
import { castPo } from '../../support/scenes-factories';
import { ScenesDaoFake } from '../../support/scenes-fakes';

const NOW = new Date('2026-10-26T20:00:00Z');
const ROOT_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('JuggernautService', () => {
  let campaigns: CampaignsDaoFake;
  let members: JuggernautMembersFake;
  let changed: MemberRoleChangedFake;
  let removed: MemberRemovedFake;
  let service: JuggernautService;

  beforeEach(() => {
    campaigns = new CampaignsDaoFake([
      campaignPo({ id: VHARN_ID }),
      campaignPo({ id: QUELM_ID, joinCode: 'QLMR2345', ownerId: BIA_ID }),
    ]);
    const names = { [ANA_ID]: 'Ana', [BIA_ID]: 'Bia', [ROOT_ID]: 'Root' };
    members = new JuggernautMembersFake(campaigns, names, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: QUELM_ID, userId: BIA_ID, role: 'master' }),
    ]);
    changed = new MemberRoleChangedFake(members.writes);
    removed = new MemberRemovedFake(members.writes);
    const casts = [
      castPo({ campaignId: VHARN_ID }),
      castPo({ id: 'quelm-cast', campaignId: QUELM_ID }),
    ];
    const scenes = new ScenesDaoFake(casts);
    const presence = new PresenceReaderFake();
    const clock = new ClockFake(NOW);
    const conditions = new ConditionDefinitionsFake();
    const runner = new TransactionRunnerFake({ campaigns, members, scenes, conditions });
    const detail = new CampaignsService({
      ...{ campaigns, members, scenes, memberships: members, presence, clock },
      ...{
        transaction: runner.run,
        codes: new CampaignCodeFake([]),
        hasher: new PasswordHasherFake(),
      },
    });
    const memberships = new ForgottenMembershipsFake(members.writes);
    service = new JuggernautService({
      campaigns,
      members,
      memberships,
      changed,
      removed,
      detail,
      clock,
    });
  });

  function rootPlays(campaignId = VHARN_ID): void {
    members.rows.push(campaignMemberPo({ campaignId, userId: ROOT_ID, role: 'player' }));
  }

  it('Root, a player, turning it on: saved, forgotten, then the table hears him as master', async () => {
    rootPlays();

    await service.start(ROOT_ID, VHARN_ID);

    expect(members.writes).toEqual([
      `startJuggernaut:${VHARN_ID}:${ROOT_ID}`,
      `forget:${VHARN_ID}:${ROOT_ID}`,
      `memberRoleChanged:${ROOT_ID}:master`,
    ]);
    expect(changed.told[0]?.change).toMatchObject({ role: 'master', from: 'player' });
  });

  it('Root, not a member, turning it on is saved and forgotten; nobody hears an offline juggernaut', async () => {
    await service.start(ROOT_ID, VHARN_ID);

    expect(members.writes).toEqual([
      `startJuggernaut:${VHARN_ID}:${ROOT_ID}`,
      `forget:${VHARN_ID}:${ROOT_ID}`,
    ]);
  });

  it('turning it on answers the detail as Root reads it: master, juggernaut and the code', async () => {
    const detail = await service.start(ROOT_ID, VHARN_ID);

    expect(detail).toMatchObject({ myRole: 'master', juggernaut: true, joinCode: 'VHRN7K2Q' });
  });

  it('turning it on again writes and tells nothing', async () => {
    await service.start(ROOT_ID, VHARN_ID);
    members.writes.splice(0);

    await service.start(ROOT_ID, VHARN_ID);

    expect(members.writes).toEqual([]);
  });

  it('turning it off with a role before: saved, forgotten, then the table hears him as player', async () => {
    rootPlays();
    await service.start(ROOT_ID, VHARN_ID);
    members.writes.splice(0);

    expect(await service.end(ROOT_ID, VHARN_ID)).toEqual({ myRole: 'player' });
    expect(members.writes).toEqual([
      `endJuggernaut:${VHARN_ID}:${ROOT_ID}`,
      `forget:${VHARN_ID}:${ROOT_ID}`,
      `memberRoleChanged:${ROOT_ID}:player`,
    ]);
  });

  it('turning it off with no role before: saved, forgotten, then his connections leave the table', async () => {
    await service.start(ROOT_ID, VHARN_ID);
    members.writes.splice(0);

    expect(await service.end(ROOT_ID, VHARN_ID)).toEqual({ myRole: null });
    expect(members.writes).toEqual([
      `endJuggernaut:${VHARN_ID}:${ROOT_ID}`,
      `forget:${VHARN_ID}:${ROOT_ID}`,
      `memberRemoved:${ROOT_ID}`,
    ]);
    expect(removed.removed).toEqual([{ campaignId: VHARN_ID, userId: ROOT_ID }]);
  });

  it('turning off a mode that is off writes nothing and answers the role he has', async () => {
    rootPlays();

    expect(await service.end(ROOT_ID, VHARN_ID)).toEqual({ myRole: 'player' });
    expect(members.writes).toEqual([]);
  });

  it('a campaign that does not exist is CAMPAIGN_NOT_FOUND and nothing is written', async () => {
    await expect(service.start(ROOT_ID, UNKNOWN_ID)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
    expect(members.writes).toEqual([]);
  });

  it('Ana, the owner, turning it on at Vharn is ALREADY_OWNER and nothing is written', async () => {
    await expect(service.start(ANA_ID, VHARN_ID)).rejects.toMatchObject({ code: 'ALREADY_OWNER' });
    expect(members.writes).toEqual([]);
  });

  it('endAllOf turns it off at every table of Root, each with its own notice', async () => {
    rootPlays();
    await service.start(ROOT_ID, VHARN_ID);
    await service.start(ROOT_ID, QUELM_ID);
    members.writes.splice(0);

    await service.endAllOf(ROOT_ID);

    expect(members.writes).toContain(`memberRoleChanged:${ROOT_ID}:player`);
    expect(members.writes).toContain(`memberRemoved:${ROOT_ID}`);
    expect(await members.juggernautCampaignIdsOf(ROOT_ID)).toEqual([]);
  });
});
