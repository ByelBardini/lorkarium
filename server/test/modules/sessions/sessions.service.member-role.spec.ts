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
  PrivateGridsFake,
  PresenceRegistryFake,
  SchedulerFake,
  SessionPublisherFake,
  SessionsJournal,
} from '../../support/sessions-fakes';

const NOW = new Date('2026-10-24T21:00:00Z');
const ANA = campaignMemberRow({ userId: ANA_ID, name: 'Ana', role: 'master' });
const BIA = campaignMemberRow({ userId: BIA_ID, name: 'Bia', role: 'player' });

// The roster fake answers what the database holds after the write: the role is already the new one.
function dudaAs(role: 'master' | 'player' | 'spectator') {
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
      grids: new PrivateGridsFake(),
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

    await service.memberRoleChanged({
      campaignId: VHARN_ID,
      userId: DUDA_ID,
      role: 'player',
      from: 'spectator',
    });

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
          juggernaut: false,
          online: true,
          awaySince: null,
        },
        at: NOW.toISOString(),
      },
      move: { campaignId: VHARN_ID, userId: DUDA_ID, audience: 'player', closedSceneIds: [] },
    });
    expect(registry.rosterOf(VHARN_ID)?.version).toBe(2);
  });

  it('Bia moved to the spectators while online: her rooms leave the player ones, the table hears her as a spectator', async () => {
    await service.join(BIA_ID, VHARN_ID, 's2');
    campaigns.tables[VHARN_ID] = [ANA, { ...BIA, role: 'spectator' }, dudaAs('spectator')];

    await service.memberRoleChanged({
      campaignId: VHARN_ID,
      userId: BIA_ID,
      role: 'spectator',
      from: 'player',
    });

    expect(publisher.published.at(-1)).toMatchObject({
      name: 'memberRoleChanged',
      event: { member: { userId: BIA_ID, role: 'spectator', online: true } },
      move: { audience: 'spectator' },
    });
  });

  it('Bia moved to the spectators while offline is still announced, so the others drop her card', async () => {
    await service.join(ANA_ID, VHARN_ID, 's3');
    campaigns.tables[VHARN_ID] = [ANA, { ...BIA, role: 'spectator' }, dudaAs('spectator')];

    await service.memberRoleChanged({
      campaignId: VHARN_ID,
      userId: BIA_ID,
      role: 'spectator',
      from: 'player',
    });

    expect(publisher.published.at(-1)).toMatchObject({
      name: 'memberRoleChanged',
      event: { version: 2, member: { userId: BIA_ID, role: 'spectator', online: false } },
    });
  });

  it('a role changed at a table nobody is at publishes nothing and keeps no roster', async () => {
    await service.memberRoleChanged({
      campaignId: VHARN_ID,
      userId: DUDA_ID,
      role: 'player',
      from: 'spectator',
    });

    expect(journal.entries).toEqual([]);
    expect(registry.rosterOf(VHARN_ID)).toBeUndefined();
  });

  it('a role changed at Vharn leaves the roster of Quelm as it was', async () => {
    campaigns.tables[QUELM_ID] = [{ ...ANA, role: 'player' }];
    await service.join(ANA_ID, QUELM_ID, 's4');
    await service.join(BIA_ID, VHARN_ID, 's5');
    const quelm = registry.rosterOf(QUELM_ID);

    await service.memberRoleChanged({
      campaignId: VHARN_ID,
      userId: DUDA_ID,
      role: 'player',
      from: 'spectator',
    });

    expect(registry.rosterOf(QUELM_ID)).toBe(quelm);
  });

  describe('to and from the masters', () => {
    const CRIPTA_ID = '8c9d0e1f-2a3b-4c4d-8e5f-7a8b9c0d1e2f';
    let grids: PrivateGridsFake;

    beforeEach(() => {
      grids = new PrivateGridsFake({ [VHARN_ID]: [CRIPTA_ID] });
      service = new TableSessionService({
        campaigns,
        grids,
        registry,
        scheduler: new SchedulerFake(),
        publisher,
        clock: new ClockFake(NOW),
      });
    });

    it('Duda demoted from master asks the rooms move to close the private grids of Vharn', async () => {
      await service.join(DUDA_ID, VHARN_ID, 's6');
      campaigns.tables[VHARN_ID] = [ANA, BIA, dudaAs('player')];

      const change = {
        campaignId: VHARN_ID,
        userId: DUDA_ID,
        role: 'player',
        from: 'master',
      } as const;
      await service.memberRoleChanged(change);

      expect(publisher.published.at(-1)).toMatchObject({
        move: { audience: 'player', closedSceneIds: [CRIPTA_ID] },
      });
      expect(grids.reads).toEqual([VHARN_ID]);
    });

    it('Duda promoted to master closes nothing and reads no grid', async () => {
      await service.join(DUDA_ID, VHARN_ID, 's7');
      campaigns.tables[VHARN_ID] = [ANA, BIA, dudaAs('master')];

      const change = {
        campaignId: VHARN_ID,
        userId: DUDA_ID,
        role: 'master',
        from: 'player',
      } as const;
      await service.memberRoleChanged(change);

      expect(publisher.published.at(-1)).toMatchObject({
        move: { audience: 'master', closedSceneIds: [] },
      });
      expect(grids.reads).toEqual([]);
    });
  });

  describe('memberRemoved: Root, a juggernaut who was not a member, turned the mode off', () => {
    const ROOT_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
    const ROOT = campaignMemberRow({
      userId: ROOT_ID,
      name: 'Root',
      role: 'master',
      juggernaut: true,
    });

    it('with two tabs at a live Vharn: out of the roster, saved, then his tabs and the table are told', async () => {
      campaigns.tables[VHARN_ID] = [ANA, BIA, ROOT];
      await service.join(ROOT_ID, VHARN_ID, 's8');
      await service.join(ROOT_ID, VHARN_ID, 's9');
      journal.entries.splice(0);

      await service.memberRemoved({ campaignId: VHARN_ID, userId: ROOT_ID });

      expect(journal.entries).toEqual([`save:${VHARN_ID}`, `publish:memberRemoved:${VHARN_ID}`]);
      expect(publisher.published.at(-1)).toEqual({
        name: 'memberRemoved',
        event: {
          userId: ROOT_ID,
          removed: { campaignId: VHARN_ID, at: NOW.toISOString() },
          left: { campaignId: VHARN_ID, version: 2, userId: ROOT_ID, at: NOW.toISOString() },
        },
      });
      expect(registry.rosterOf(VHARN_ID)?.sockets.has(ROOT_ID)).toBe(false);
    });

    it('offline at a live Vharn: nothing saved, his connections are told with no memberLeft', async () => {
      await service.join(ANA_ID, VHARN_ID, 's10');
      journal.entries.splice(0);

      await service.memberRemoved({ campaignId: VHARN_ID, userId: ROOT_ID });

      expect(journal.entries).toEqual([`publish:memberRemoved:${VHARN_ID}`]);
      expect(publisher.published.at(-1)).toMatchObject({ event: { left: null } });
    });

    it('at a table nobody is at: nothing is published nor kept', async () => {
      await service.memberRemoved({ campaignId: VHARN_ID, userId: ROOT_ID });

      expect(journal.entries).toEqual([]);
      expect(registry.rosterOf(VHARN_ID)).toBeUndefined();
    });
  });
});
