import { beforeEach, describe, expect, it } from 'vitest';
import { TableSessionService } from '../../../src/modules/sessions/sessions.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import {
  BIA_ID,
  DUDA_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberRow,
} from '../../support/campaigns-factories';
import {
  CampaignRosterFake,
  PresenceRegistryFake,
  SchedulerFake,
  SessionPublisherFake,
  SessionsJournal,
} from '../../support/sessions-fakes';

const NOW = new Date('2026-10-24T21:00:00Z');
const ANA = campaignMemberRow({ userId: ANA_ID, name: 'Ana', role: 'master' });
const BIA = campaignMemberRow({ userId: BIA_ID, name: 'Bia', role: 'player' });

// The roster fake answers what the database holds after the write: the role is already the new one.
function dudaAs(role: 'player' | 'spectator') {
  return campaignMemberRow({ userId: DUDA_ID, name: 'Duda', role });
}

describe('TableSessionService.memberRoleChanged', () => {
  let journal: SessionsJournal;
  let registry: PresenceRegistryFake;
  let publisher: SessionPublisherFake;
  let campaigns: CampaignRosterFake;
  let service: TableSessionService;

  beforeEach(() => {
    journal = new SessionsJournal();
    registry = new PresenceRegistryFake(journal);
    publisher = new SessionPublisherFake(journal);
    campaigns = new CampaignRosterFake({ [VHARN_ID]: [ANA, BIA, dudaAs('spectator')] });
    service = new TableSessionService({
      campaigns,
      registry,
      scheduler: new SchedulerFake(),
      publisher,
      clock: new ClockFake(NOW),
    });
  });

  it('Duda promoted at a live Vharn: saved, then her rooms move and the table hears her as a player', async () => {
    await service.join(DUDA_ID, VHARN_ID, 's1');
    campaigns.tables[VHARN_ID] = [ANA, BIA, dudaAs('player')];
    journal.entries.splice(0);

    await service.memberRoleChanged({ campaignId: VHARN_ID, userId: DUDA_ID, role: 'player' });

    expect(journal.entries).toEqual([`save:${VHARN_ID}`, `publish:memberRoleChanged:${VHARN_ID}`]);
    expect(publisher.published.at(-1)).toEqual({
      name: 'memberRoleChanged',
      event: {
        campaignId: VHARN_ID,
        version: 2,
        member: {
          userId: DUDA_ID,
          name: 'Duda',
          username: 'duda',
          color: expect.any(String),
          avatarId: null,
          bio: null,
          role: 'player',
          online: true,
          awaySince: null,
        },
        at: NOW.toISOString(),
      },
      move: { campaignId: VHARN_ID, userId: DUDA_ID, audience: 'player' },
    });
    expect(registry.rosterOf(VHARN_ID)?.version).toBe(2);
  });

  it('Bia moved to the spectators while online: her rooms leave the player ones, the table hears her as a spectator', async () => {
    await service.join(BIA_ID, VHARN_ID, 's2');
    campaigns.tables[VHARN_ID] = [ANA, { ...BIA, role: 'spectator' }, dudaAs('spectator')];

    await service.memberRoleChanged({ campaignId: VHARN_ID, userId: BIA_ID, role: 'spectator' });

    expect(publisher.published.at(-1)).toMatchObject({
      name: 'memberRoleChanged',
      event: { member: { userId: BIA_ID, role: 'spectator', online: true } },
      move: { audience: 'spectator' },
    });
  });

  it('Bia moved to the spectators while offline is still announced, so the others drop her card', async () => {
    await service.join(ANA_ID, VHARN_ID, 's3');
    campaigns.tables[VHARN_ID] = [ANA, { ...BIA, role: 'spectator' }, dudaAs('spectator')];

    await service.memberRoleChanged({ campaignId: VHARN_ID, userId: BIA_ID, role: 'spectator' });

    expect(publisher.published.at(-1)).toMatchObject({
      name: 'memberRoleChanged',
      event: { version: 2, member: { userId: BIA_ID, role: 'spectator', online: false } },
    });
  });

  it('a role changed at a table nobody is at publishes nothing and keeps no roster', async () => {
    await service.memberRoleChanged({ campaignId: VHARN_ID, userId: DUDA_ID, role: 'player' });

    expect(journal.entries).toEqual([]);
    expect(registry.rosterOf(VHARN_ID)).toBeUndefined();
  });

  it('a role changed at Vharn leaves the roster of Quelm as it was', async () => {
    campaigns.tables[QUELM_ID] = [{ ...ANA, role: 'player' }];
    await service.join(ANA_ID, QUELM_ID, 's4');
    await service.join(BIA_ID, VHARN_ID, 's5');
    const quelm = registry.rosterOf(QUELM_ID);

    await service.memberRoleChanged({ campaignId: VHARN_ID, userId: DUDA_ID, role: 'player' });

    expect(registry.rosterOf(QUELM_ID)).toBe(quelm);
  });
});
