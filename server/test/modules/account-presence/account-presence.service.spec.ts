import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAccountPresenceRegistry } from '../../../src/infrastructure/account-presence-registry/in-memory-account-presence-registry';
import {
  ACCOUNT_PRESENCE_GRACE_MS,
  AccountPresenceService,
} from '../../../src/modules/account-presence/account-presence.service';
import {
  AccountPresencePublisherFake,
  CampaignInfoFake,
  FriendIdsFake,
} from '../../support/account-presence-fakes';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, QUELM_ID, VHARN_ID } from '../../support/campaigns-factories';
import { SchedulerFake } from '../../support/sessions-fakes';

const NOW = new Date('2026-11-12T12:00:00Z');
const AT = NOW.toISOString();
const BIA_GRACE = `account:${BIA_ID}`;
const VHARN = { id: VHARN_ID, name: 'Os Sinos de Vharn', visibility: 'public' } as const;
const QUELM = { id: QUELM_ID, name: 'Quelm', visibility: 'private' } as const;

// Lets the chained announcement (friends read, then publish) run.
async function settled(): Promise<void> {
  for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
}

describe('AccountPresenceService', () => {
  let registry: InMemoryAccountPresenceRegistry;
  let scheduler: SchedulerFake;
  let publisher: AccountPresencePublisherFake;
  let friendships: FriendIdsFake;
  let failures: unknown[];
  let presence: AccountPresenceService;

  beforeEach(() => {
    registry = new InMemoryAccountPresenceRegistry();
    scheduler = new SchedulerFake();
    publisher = new AccountPresencePublisherFake();
    // Ana and Bia are friends; Caio is nobody's.
    friendships = new FriendIdsFake({ [BIA_ID]: [ANA_ID], [ANA_ID]: [BIA_ID] });
    failures = [];
    presence = new AccountPresenceService({
      registry,
      scheduler,
      publisher,
      friendships,
      campaigns: new CampaignInfoFake([VHARN, QUELM]),
      clock: new ClockFake(NOW),
      announceFailed: (error) => failures.push(error),
    });
  });

  function heardByAna(): unknown[] {
    return publisher.published.map(({ friendIds, event }) => ({ friendIds, event }));
  }

  it('Bia connecting: saved, then Ana (her friend) hears her online', async () => {
    presence.connect(BIA_ID, 's1');
    await settled();

    expect(registry.presenceOf(BIA_ID)?.sockets).toEqual(new Set(['s1']));
    expect(heardByAna()).toEqual([
      { friendIds: [ANA_ID], event: { userId: BIA_ID, status: 'online', table: null, at: AT } },
    ]);
  });

  it('a second tab of Bia changes nothing her friends see', async () => {
    presence.connect(BIA_ID, 's1');
    await settled();
    publisher.published.splice(0);

    presence.connect(BIA_ID, 's2');
    await settled();

    expect(publisher.published).toEqual([]);
  });

  it('Caio, who has no friend, is saved but announces to nobody', async () => {
    presence.connect(CAIO_ID, 's1');
    await settled();

    expect(presence.isVisiblyOnline(CAIO_ID)).toBe(true);
    expect(publisher.published).toEqual([]);
  });

  describe('dropping and leaving', () => {
    beforeEach(async () => {
      presence.connect(BIA_ID, 's1');
      await settled();
      publisher.published.splice(0);
    });

    it('a drop of the last tab keeps Bia online for the tolerance, then offline', async () => {
      presence.drop(BIA_ID, 's1', 'dropped');
      await settled();
      expect(publisher.published).toEqual([]);
      expect(scheduler.scheduled[BIA_GRACE]?.delayMs).toBe(ACCOUNT_PRESENCE_GRACE_MS);

      scheduler.fire(BIA_GRACE);
      await settled();

      expect(publisher.published.map(({ event }) => event.status)).toEqual(['offline']);
      expect(registry.presenceOf(BIA_ID)).toBeUndefined();
    });

    it('coming back within the tolerance cancels it and announces nothing', async () => {
      presence.drop(BIA_ID, 's1', 'dropped');
      presence.connect(BIA_ID, 's2');
      await settled();

      expect(scheduler.cancelled).toContain(BIA_GRACE);
      expect(publisher.published).toEqual([]);
    });

    it('leaving on purpose (logout) is offline at once, with no tolerance', async () => {
      presence.drop(BIA_ID, 's1', 'left');
      await settled();

      expect(scheduler.scheduled[BIA_GRACE]).toBeUndefined();
      expect(publisher.published.map(({ event }) => event.status)).toEqual(['offline']);
    });

    it('an unknown socket is idempotent: nothing saved, nothing announced', async () => {
      presence.drop(BIA_ID, 'ghost', 'dropped');
      await settled();

      expect(scheduler.scheduled[BIA_GRACE]).toBeUndefined();
      expect(publisher.published).toEqual([]);
    });
  });

  describe('visibility and activity', () => {
    beforeEach(async () => {
      presence.connect(BIA_ID, 's1');
      await settled();
      publisher.published.splice(0);
    });

    it('Bia invisible: Ana hears offline, and Bia is no longer visibly online', async () => {
      presence.setVisibility(BIA_ID, 'invisible');
      await settled();

      expect(publisher.published.map(({ event }) => event.status)).toEqual(['offline']);
      expect(presence.isVisiblyOnline(BIA_ID)).toBe(false);
    });

    it('back to online from invisible announces online again', async () => {
      presence.setVisibility(BIA_ID, 'invisible');
      presence.setVisibility(BIA_ID, 'online');
      await settled();

      expect(publisher.published.map(({ event }) => event.status)).toEqual(['offline', 'online']);
    });

    it('every tab still is away; moving again is online, in that order', async () => {
      presence.activityChanged(BIA_ID, 's1', true);
      presence.activityChanged(BIA_ID, 's1', false);
      await settled();

      expect(publisher.published.map(({ event }) => event.status)).toEqual(['away', 'online']);
    });

    it('invisible and away at once announces nothing new', async () => {
      presence.setVisibility(BIA_ID, 'invisible');
      await settled();
      publisher.published.splice(0);

      presence.activityChanged(BIA_ID, 's1', true);
      await settled();

      expect(publisher.published).toEqual([]);
    });
  });

  describe('tables', () => {
    beforeEach(async () => {
      presence.connect(BIA_ID, 's1');
      await settled();
      publisher.published.splice(0);
    });

    it('Bia opening Vharn (public): Ana sees "Na mesa" Vharn', async () => {
      presence.tableOpened({ userId: BIA_ID, campaignId: VHARN_ID, socketId: 's1' });
      await settled();

      expect(publisher.published.map(({ event }) => event.table)).toEqual([
        { campaignId: VHARN_ID, name: 'Os Sinos de Vharn' },
      ]);
    });

    it('Bia opening Quelm (private): nothing friends see changes', async () => {
      presence.tableOpened({ userId: BIA_ID, campaignId: QUELM_ID, socketId: 's1' });
      await settled();

      expect(publisher.published).toEqual([]);
      expect(registry.presenceOf(BIA_ID)?.tables).toHaveLength(1);
    });

    it('closed while its name was still being read: the table never shows', async () => {
      const visit = { userId: BIA_ID, campaignId: VHARN_ID, socketId: 's1' };
      presence.tableOpened(visit);
      presence.tableClosed(visit);
      await settled();

      expect(registry.presenceOf(BIA_ID)?.tables).toEqual([]);
      expect(publisher.published).toEqual([]);
    });

    it('taken out of Vharn on every tab: the table goes from both', async () => {
      presence.connect(BIA_ID, 's2');
      presence.tableOpened({ userId: BIA_ID, campaignId: VHARN_ID, socketId: 's1' });
      presence.tableOpened({ userId: BIA_ID, campaignId: VHARN_ID, socketId: 's2' });
      await settled();
      publisher.published.splice(0);

      presence.tableLeftEverywhere(BIA_ID, VHARN_ID);
      await settled();

      expect(registry.presenceOf(BIA_ID)?.tables).toEqual([]);
      expect(publisher.published.map(({ event }) => event.table)).toEqual([null]);
    });
  });

  describe('sync', () => {
    it('Ana reads every friend, offline ones included', async () => {
      expect(await presence.sync(ANA_ID)).toEqual([
        { userId: BIA_ID, status: 'offline', table: null },
      ]);
    });

    it('an invisible friend reads as offline', async () => {
      presence.connect(BIA_ID, 's1');
      presence.setVisibility(BIA_ID, 'invisible');

      expect(await presence.sync(ANA_ID)).toEqual([
        { userId: BIA_ID, status: 'offline', table: null },
      ]);
    });

    it('Caio reads nobody: he has no friend', async () => {
      presence.connect(BIA_ID, 's1');

      expect(await presence.sync(CAIO_ID)).toEqual([]);
    });
  });

  describe('the friends memory', () => {
    it("away and back again cost no second read of Bia's friends", async () => {
      presence.connect(BIA_ID, 's1');
      presence.activityChanged(BIA_ID, 's1', true);
      presence.activityChanged(BIA_ID, 's1', false);
      await settled();

      expect(friendships.reads).toEqual([BIA_ID]);
      expect(publisher.published).toHaveLength(3);
    });

    it("a saved change of Bia's list makes the next announcement read again", async () => {
      presence.connect(BIA_ID, 's1');
      await settled();

      await presence.friendsChanged({ userIds: [BIA_ID], at: NOW });
      presence.activityChanged(BIA_ID, 's1', true);
      await settled();

      expect(friendships.reads).toEqual([BIA_ID, BIA_ID]);
    });

    it('offline for good: the next connection reads the friends again', async () => {
      presence.connect(BIA_ID, 's1');
      presence.drop(BIA_ID, 's1', 'left');
      await settled();

      presence.connect(BIA_ID, 's2');
      await settled();

      expect(friendships.reads).toEqual([BIA_ID, BIA_ID]);
    });
  });

  it('a friends read that fails is reported, never thrown, and the state stays saved', async () => {
    friendships.failing = true;

    presence.connect(BIA_ID, 's1');
    await settled();

    expect(failures).toHaveLength(1);
    expect(presence.isVisiblyOnline(BIA_ID)).toBe(true);
  });
});
