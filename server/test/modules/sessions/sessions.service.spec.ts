import type { CampaignInfoDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { TableSessionService } from '../../../src/modules/sessions/sessions.service';
import { EMPTY_ROSTER } from '../../../src/modules/sessions/table-presence.bo';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import {
  BIA_ID,
  CAIO_ID,
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

const NOW = new Date('2026-10-15T12:00:00Z');
const ANA = campaignMemberRow({ userId: ANA_ID, name: 'Ana', role: 'master' });
const BIA = campaignMemberRow({ userId: BIA_ID, name: 'Bia', role: 'player' });
const CAIO = campaignMemberRow({ userId: CAIO_ID, name: 'Caio', role: 'master' });
const BIA_GRACE_KEY = `${VHARN_ID}:${BIA_ID}`;

describe('TableSessionService', () => {
  let journal: SessionsJournal;
  let registry: PresenceRegistryFake;
  let scheduler: SchedulerFake;
  let publisher: SessionPublisherFake;
  let service: TableSessionService;

  beforeEach(() => {
    journal = new SessionsJournal();
    registry = new PresenceRegistryFake(journal);
    scheduler = new SchedulerFake();
    publisher = new SessionPublisherFake(journal);
    service = new TableSessionService({
      campaigns: new CampaignRosterFake({ [VHARN_ID]: [ANA, BIA], [QUELM_ID]: [CAIO] }),
      registry,
      scheduler,
      publisher,
      clock: new ClockFake(NOW),
    });
  });

  it('Ana joining VHARN gets the snapshot with herself online and publishes memberJoined after saving', async () => {
    const state = await service.join(ANA_ID, VHARN_ID, 's1');
    expect(state).toEqual({
      campaignId: VHARN_ID,
      version: 1,
      members: [
        {
          userId: ANA_ID,
          name: 'Ana',
          username: 'ana',
          color: 'teal',
          avatarId: null,
          bio: null,
          role: 'master',
          online: true,
          awaySince: null,
        },
        {
          userId: BIA_ID,
          name: 'Bia',
          username: 'bia',
          color: 'moss',
          avatarId: null,
          bio: null,
          role: 'player',
          online: false,
          awaySince: null,
        },
      ],
      at: '2026-10-15T12:00:00.000Z',
    });
    expect(publisher.published).toEqual([
      {
        name: 'memberJoined',
        event: {
          campaignId: VHARN_ID,
          version: 1,
          member: {
            userId: ANA_ID,
            name: 'Ana',
            username: 'ana',
            color: 'teal',
            avatarId: null,
            bio: null,
            role: 'master',
            online: true,
            awaySince: null,
          },
          at: '2026-10-15T12:00:00.000Z',
        },
      },
    ]);
    expect(journal.entries).toEqual([`save:${VHARN_ID}`, 'publish:memberJoined']);
  });

  it('a second tab of Ana gets the snapshot and publishes nothing', async () => {
    await service.join(ANA_ID, VHARN_ID, 's1');
    const state = await service.join(ANA_ID, VHARN_ID, 's2');
    expect(state.version).toBe(1);
    expect(publisher.published).toHaveLength(1);
  });

  it('Caio, who is not a member of VHARN, is refused with CAMPAIGN_NOT_FOUND and nothing is saved', async () => {
    await expect(service.join(CAIO_ID, VHARN_ID, 's9')).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
    expect(journal.entries).toEqual([]);
  });

  it('Ana online in VHARN does not show up in the snapshot of QUELM', async () => {
    await service.join(ANA_ID, VHARN_ID, 's1');
    const state = await service.join(CAIO_ID, QUELM_ID, 's2');
    expect(state.members).toEqual([
      {
        userId: CAIO_ID,
        name: 'Caio',
        username: 'caio',
        color: 'steel',
        avatarId: null,
        bio: null,
        role: 'master',
        online: true,
        awaySince: null,
      },
    ]);
    expect(state.version).toBe(1);
  });

  it('Bia leaving from her last tab publishes memberLeft at once; leaving again publishes nothing', async () => {
    await service.join(BIA_ID, VHARN_ID, 's2');
    service.leave(BIA_ID, VHARN_ID, 's2');
    service.leave(BIA_ID, VHARN_ID, 's2');
    expect(publisher.published.map(({ name }) => name)).toEqual(['memberJoined', 'memberLeft']);
    expect(publisher.published[1]?.event).toEqual({
      campaignId: VHARN_ID,
      version: 2,
      userId: BIA_ID,
      at: '2026-10-15T12:00:00.000Z',
    });
    expect(journal.entries.slice(-2)).toEqual([`save:${VHARN_ID}`, 'publish:memberLeft']);
  });

  it('Bia dropping her last tab publishes nothing and schedules her expiry in 5000 ms', async () => {
    await service.join(BIA_ID, VHARN_ID, 's2');
    service.drop(BIA_ID, VHARN_ID, 's2');
    expect(publisher.published.map(({ name }) => name)).toEqual(['memberJoined']);
    expect(scheduler.scheduled[BIA_GRACE_KEY]?.delayMs).toBe(5000);
  });

  it('the grace period ending without return publishes memberLeft with the version bumped', async () => {
    await service.join(BIA_ID, VHARN_ID, 's2');
    service.drop(BIA_ID, VHARN_ID, 's2');
    scheduler.fire(BIA_GRACE_KEY);
    expect(publisher.published[1]).toEqual({
      name: 'memberLeft',
      event: { campaignId: VHARN_ID, version: 2, userId: BIA_ID, at: '2026-10-15T12:00:00.000Z' },
    });
    expect(registry.rosterOf(VHARN_ID)?.inGrace.size).toBe(0);
  });

  it('Bia coming back before the grace period ends cancels the expiry and publishes nothing', async () => {
    await service.join(BIA_ID, VHARN_ID, 's2');
    service.drop(BIA_ID, VHARN_ID, 's2');
    const state = await service.join(BIA_ID, VHARN_ID, 's3');
    expect(scheduler.cancelled).toEqual([BIA_GRACE_KEY]);
    expect(scheduler.scheduled).toEqual({});
    expect(publisher.published.map(({ name }) => name)).toEqual(['memberJoined']);
    expect(state.version).toBe(1);
  });
});

describe('TableSessionService tables of a connection', () => {
  const FIVE_OPEN: ReadonlySet<string> = new Set([
    'a1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000004',
    QUELM_ID,
  ]);
  let journal: SessionsJournal;
  let service: TableSessionService;

  beforeEach(() => {
    journal = new SessionsJournal();
    service = new TableSessionService({
      campaigns: new CampaignRosterFake({ [VHARN_ID]: [ANA] }),
      registry: new PresenceRegistryFake(journal),
      scheduler: new SchedulerFake(),
      publisher: new SessionPublisherFake(journal),
      clock: new ClockFake(NOW),
    });
  });

  it('admitting a 6th table throws TOO_MANY_TABLES without touching the registry or the publisher', () => {
    expect(() => service.admitTable(FIVE_OPEN, VHARN_ID)).toThrow(
      expect.objectContaining({ code: 'TOO_MANY_TABLES' }),
    );
    expect(journal.entries).toEqual([]);
  });

  it('admitting and then releasing a table hands back the new set each time', () => {
    const admitted = service.admitTable(new Set([QUELM_ID]), VHARN_ID);
    expect(admitted.tables).toEqual(new Set([QUELM_ID, VHARN_ID]));
    const released = service.releaseTable(admitted.tables, QUELM_ID);
    expect(released.tables).toEqual(new Set([VHARN_ID]));
  });
});

describe('TableSessionService activity', () => {
  let journal: SessionsJournal;
  let publisher: SessionPublisherFake;
  let service: TableSessionService;

  beforeEach(() => {
    journal = new SessionsJournal();
    publisher = new SessionPublisherFake(journal);
    service = new TableSessionService({
      campaigns: new CampaignRosterFake({ [VHARN_ID]: [ANA, BIA] }),
      registry: new PresenceRegistryFake(journal),
      scheduler: new SchedulerFake(),
      publisher,
      clock: new ClockFake(NOW),
    });
  });

  describe('Bia at VHARN', () => {
    it('Bia standing still saves and then publishes memberActivity since the clock', async () => {
      await service.join(BIA_ID, VHARN_ID, 's1');
      journal.entries.length = 0;

      service.setActivity(BIA_ID, VHARN_ID, 's1', true);

      expect(journal.entries).toEqual([`save:${VHARN_ID}`, 'publish:memberActivity']);
      expect(publisher.published.at(-1)).toEqual({
        name: 'memberActivity',
        event: {
          campaignId: VHARN_ID,
          version: 2,
          userId: BIA_ID,
          awaySince: NOW.toISOString(),
          at: NOW.toISOString(),
        },
      });
    });

    it('Bia already away standing still again saves and publishes nothing', async () => {
      await service.join(BIA_ID, VHARN_ID, 's1');
      service.setActivity(BIA_ID, VHARN_ID, 's1', true);
      journal.entries.length = 0;

      service.setActivity(BIA_ID, VHARN_ID, 's1', true);

      expect(journal.entries).toEqual([]);
    });

    it('one of two tabs standing still is still-active: kept, but nothing published', async () => {
      await service.join(BIA_ID, VHARN_ID, 's1');
      await service.join(BIA_ID, VHARN_ID, 's2');
      journal.entries.length = 0;

      service.setActivity(BIA_ID, VHARN_ID, 's1', true);

      expect(journal.entries).toEqual([`save:${VHARN_ID}`]);
      service.setActivity(BIA_ID, VHARN_ID, 's2', true);
      expect(journal.entries).toEqual([
        `save:${VHARN_ID}`,
        `save:${VHARN_ID}`,
        'publish:memberActivity',
      ]);
    });

    it('Bia moving again publishes memberActivity with awaySince null', async () => {
      await service.join(BIA_ID, VHARN_ID, 's1');
      service.setActivity(BIA_ID, VHARN_ID, 's1', true);

      service.setActivity(BIA_ID, VHARN_ID, 's1', false);

      expect(publisher.published.at(-1)).toMatchObject({
        name: 'memberActivity',
        event: { version: 3, userId: BIA_ID, awaySince: null },
      });
    });

    it('the join of a new tab of Bia, away, publishes memberActivity with null', async () => {
      await service.join(BIA_ID, VHARN_ID, 's1');
      service.setActivity(BIA_ID, VHARN_ID, 's1', true);

      const state = await service.join(BIA_ID, VHARN_ID, 's2');

      expect(publisher.published.at(-1)).toMatchObject({
        name: 'memberActivity',
        event: { userId: BIA_ID, awaySince: null },
      });
      expect(state.members.find(({ userId }) => userId === BIA_ID)?.awaySince).toBeNull();
    });

    it('the active tab closing while the other stands still publishes memberActivity', async () => {
      await service.join(BIA_ID, VHARN_ID, 's1');
      await service.join(BIA_ID, VHARN_ID, 's2');
      service.setActivity(BIA_ID, VHARN_ID, 's2', true);

      service.leave(BIA_ID, VHARN_ID, 's1');

      expect(publisher.published.at(-1)).toMatchObject({
        name: 'memberActivity',
        event: { userId: BIA_ID, awaySince: NOW.toISOString() },
      });
    });
  });
});

describe('TableSessionService.profileChanged', () => {
  let journal: SessionsJournal;
  let registry: PresenceRegistryFake;
  let publisher: SessionPublisherFake;
  let campaigns: CampaignRosterFake;
  let service: TableSessionService;

  beforeEach(() => {
    journal = new SessionsJournal();
    registry = new PresenceRegistryFake(journal);
    publisher = new SessionPublisherFake(journal);
    const anaAtQuelm = campaignMemberRow({ userId: ANA_ID, name: 'Ana', role: 'player' });
    campaigns = new CampaignRosterFake({ [VHARN_ID]: [ANA, BIA], [QUELM_ID]: [CAIO, anaAtQuelm] });
    service = new TableSessionService({
      campaigns,
      registry,
      scheduler: new SchedulerFake(),
      publisher,
      clock: new ClockFake(NOW),
    });
  });

  it('Ana, member of a live VHARN and an empty QUELM, is announced only at VHARN, after saving', async () => {
    await service.join(BIA_ID, VHARN_ID, 's1');
    journal.entries.splice(0);

    await service.profileChanged(ANA_ID);

    expect(journal.entries).toEqual([`save:${VHARN_ID}`, `publish:memberUpdated:${VHARN_ID}`]);
    expect(registry.rosterOf(QUELM_ID)).toBeUndefined();
  });

  it('the announced member is the one read again from the roster, with the version moved by one', async () => {
    await service.join(BIA_ID, VHARN_ID, 's1');
    const rose = campaignMemberRow({ userId: ANA_ID, name: 'Aninha', colorChoice: 'rose' });
    campaigns.tables[VHARN_ID] = [rose, BIA];

    await service.profileChanged(ANA_ID);

    expect(publisher.published.at(-1)).toEqual({
      name: 'memberUpdated',
      event: {
        campaignId: VHARN_ID,
        version: 2,
        member: {
          userId: ANA_ID,
          name: 'Aninha',
          username: 'aninha',
          color: 'rose',
          avatarId: null,
          bio: null,
          role: 'master',
          online: false,
          awaySince: null,
        },
        at: NOW.toISOString(),
      },
    });
    expect(registry.rosterOf(VHARN_ID)?.version).toBe(2);
  });

  it('a person at no live table publishes nothing and keeps no roster', async () => {
    await service.profileChanged(ANA_ID);

    expect(journal.entries).toEqual([]);
    expect(registry.rosterOf(VHARN_ID)).toBeUndefined();
  });
});

describe('TableSessionService campaign changes', () => {
  const VHARN_INFO: CampaignInfoDto = {
    id: VHARN_ID,
    name: 'Os Sinos de Vharn',
    system: 'D&D 5e',
    status: 'ongoing',
    description: null,
    visibility: 'private',
    masterName: 'Ana',
    memberCount: 2,
    cover: { kind: 'drawn', drawing: 1, tone: 2 },
    contentWarnings: [],
    tags: [],
  };

  let journal: SessionsJournal;
  let registry: PresenceRegistryFake;
  let scheduler: SchedulerFake;
  let publisher: SessionPublisherFake;
  let service: TableSessionService;

  beforeEach(() => {
    journal = new SessionsJournal();
    registry = new PresenceRegistryFake(journal);
    scheduler = new SchedulerFake();
    publisher = new SessionPublisherFake(journal);
    service = new TableSessionService({
      campaigns: new CampaignRosterFake({ [VHARN_ID]: [ANA, BIA], [QUELM_ID]: [CAIO] }),
      registry,
      scheduler,
      publisher,
      clock: new ClockFake(NOW),
    });
  });

  it('a saved campaign with someone at the table moves the version and is published after saving', async () => {
    await service.join(BIA_ID, VHARN_ID, 's1');
    journal.entries.splice(0);

    service.campaignUpdated(VHARN_INFO);

    expect(journal.entries).toEqual([`save:${VHARN_ID}`, `publish:campaignUpdated:${VHARN_ID}`]);
    expect(publisher.published.at(-1)).toEqual({
      name: 'campaignUpdated',
      event: { campaignId: VHARN_ID, version: 2, campaign: VHARN_INFO, at: NOW.toISOString() },
    });
    expect(registry.rosterOf(VHARN_ID)?.version).toBe(2);
  });

  it('a saved campaign nobody is at publishes nothing and keeps no roster', () => {
    service.campaignUpdated(VHARN_INFO);

    expect(journal.entries).toEqual([]);
    expect(registry.rosterOf(VHARN_ID)).toBeUndefined();
  });

  it('a saved campaign leaves the other tables as they were', async () => {
    await service.join(CAIO_ID, QUELM_ID, 's9');

    service.campaignUpdated(VHARN_INFO);

    expect(registry.rosterOf(QUELM_ID)?.version).toBe(1);
    expect(publisher.published.map(({ name }) => name)).toEqual(['memberJoined']);
  });

  it('a deleted campaign drops its roster before the room hears it', async () => {
    await service.join(BIA_ID, VHARN_ID, 's1');
    journal.entries.splice(0);

    await service.campaignDeleted(VHARN_ID);

    expect(journal.entries).toEqual([`save:${VHARN_ID}`, `publish:campaignDeleted:${VHARN_ID}`]);
    // The empty roster is what the real registry drops (`InMemoryPresenceRegistry.save`).
    expect(registry.rosterOf(VHARN_ID)).toEqual(EMPTY_ROSTER);
    expect(publisher.published.at(-1)).toEqual({
      name: 'campaignDeleted',
      event: { campaignId: VHARN_ID, at: NOW.toISOString() },
    });
  });

  it('a deleted campaign cancels the grace of whoever dropped from it', async () => {
    await service.join(BIA_ID, VHARN_ID, 's1');
    service.drop(BIA_ID, VHARN_ID, 's1');

    await service.campaignDeleted(VHARN_ID);

    expect(scheduler.cancelled).toEqual([BIA_GRACE_KEY]);
    expect(scheduler.scheduled).toEqual({});
  });

  it('a deleted campaign keeps the roster of the other tables', async () => {
    await service.join(CAIO_ID, QUELM_ID, 's9');

    await service.campaignDeleted(VHARN_ID);

    expect(registry.rosterOf(QUELM_ID)?.sockets.get(CAIO_ID)).toEqual(new Set(['s9']));
  });
});
