import { beforeEach, describe, expect, it } from 'vitest';
import { TableSessionService } from '../../../src/modules/sessions/sessions.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, VHARN_ID, campaignMemberRow } from '../../support/campaigns-factories';
import {
  CampaignRosterFake,
  PresenceRegistryFake,
  PrivateGridsFake,
  SchedulerFake,
  SessionPublisherFake,
  SessionsJournal,
  TableOpenedFake,
} from '../../support/sessions-fakes';

const NOW = new Date('2026-11-12T12:00:00Z');
const ANA = campaignMemberRow({ userId: ANA_ID, name: 'Ana', role: 'master' });
const BIA = campaignMemberRow({ userId: BIA_ID, name: 'Bia', role: 'player' });
const STRANGER_ID = '0f1e2d3c-4b5a-4968-8776-655443322110';

describe('TableSessionService tells the account presence (TableOpenedPort)', () => {
  let tables: TableOpenedFake;
  let service: TableSessionService;

  beforeEach(() => {
    const journal = new SessionsJournal();
    tables = new TableOpenedFake();
    service = new TableSessionService({
      grids: new PrivateGridsFake(),
      campaigns: new CampaignRosterFake({ [VHARN_ID]: [ANA, BIA] }),
      registry: new PresenceRegistryFake(journal),
      scheduler: new SchedulerFake(),
      publisher: new SessionPublisherFake(journal),
      tables,
      clock: new ClockFake(NOW),
    });
  });

  it('Bia joining Vharn on s1 opens the table on that tab', async () => {
    await service.join(BIA_ID, VHARN_ID, 's1');

    expect(tables.calls).toEqual([
      { kind: 'opened', visit: { userId: BIA_ID, campaignId: VHARN_ID, socketId: 's1' } },
    ]);
  });

  it('a join refused (not a member) opens nothing', async () => {
    await expect(service.join(STRANGER_ID, VHARN_ID, 's9')).rejects.toThrow();

    expect(tables.calls).toEqual([]);
  });

  it.each([
    ['leave', (s: TableSessionService) => s.leave(BIA_ID, VHARN_ID, 's1')],
    ['drop', (s: TableSessionService) => s.drop(BIA_ID, VHARN_ID, 's1')],
  ] as const)('a %s closes the table on that tab only', async (_, close) => {
    await service.join(BIA_ID, VHARN_ID, 's1');
    tables.calls.splice(0);

    close(service);

    expect(tables.calls).toEqual([
      { kind: 'closed', visit: { userId: BIA_ID, campaignId: VHARN_ID, socketId: 's1' } },
    ]);
  });

  it('session:setActivity feeds the account: still, then moving again', async () => {
    await service.join(BIA_ID, VHARN_ID, 's1');
    tables.calls.splice(0);

    service.setActivity(BIA_ID, VHARN_ID, 's1', true);
    service.setActivity(BIA_ID, VHARN_ID, 's1', false);

    expect(tables.calls).toEqual([
      { kind: 'activity', userId: BIA_ID, socketId: 's1', away: true },
      { kind: 'activity', userId: BIA_ID, socketId: 's1', away: false },
    ]);
  });

  it('Bia taken out of Vharn leaves it on every tab', async () => {
    await service.join(BIA_ID, VHARN_ID, 's1');
    tables.calls.splice(0);

    await service.memberRemoved({ campaignId: VHARN_ID, userId: BIA_ID });

    expect(tables.calls).toEqual([
      { kind: 'left-everywhere', userId: BIA_ID, campaignId: VHARN_ID },
    ]);
  });

  it('Vharn deleted: everyone at it leaves it on every tab', async () => {
    await service.join(ANA_ID, VHARN_ID, 's1');
    await service.join(BIA_ID, VHARN_ID, 's2');
    tables.calls.splice(0);

    await service.campaignDeleted(VHARN_ID);

    expect(tables.calls).toEqual([
      { kind: 'left-everywhere', userId: ANA_ID, campaignId: VHARN_ID },
      { kind: 'left-everywhere', userId: BIA_ID, campaignId: VHARN_ID },
    ]);
  });
});
