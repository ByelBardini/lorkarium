import { beforeEach, describe, expect, it } from 'vitest';
import { TableSessionService } from '../../../src/modules/sessions/sessions.service';
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
        { userId: ANA_ID, name: 'Ana', role: 'master', online: true },
        { userId: BIA_ID, name: 'Bia', role: 'player', online: false },
      ],
      at: '2026-10-15T12:00:00.000Z',
    });
    expect(publisher.published).toEqual([
      {
        name: 'memberJoined',
        event: {
          campaignId: VHARN_ID,
          version: 1,
          member: { userId: ANA_ID, name: 'Ana', role: 'master', online: true },
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
      { userId: CAIO_ID, name: 'Caio', role: 'master', online: true },
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
