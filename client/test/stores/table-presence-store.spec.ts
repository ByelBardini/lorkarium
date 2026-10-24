import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import {
  createTablePresenceStore,
  selectOnlineCount,
  type TablePresenceStore,
} from '@/stores/table-presence-store';
import { QUELM, VHARN } from '../support/campaigns-api-fake';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  biaJoined,
  biaLeft,
  biaUpdated,
  vharnRenamed,
  vharnState,
} from '../support/table-session-fixtures';

const DUDA = {
  userId: '1e2d3c4b-5a69-4788-9abc-def012345678',
  name: 'Duda',
  username: 'duda',
  color: 'teal',
  avatarId: null,
  bio: null,
  role: 'player',
  online: true,
  awaySince: null,
} as const;

describe('table presence store', () => {
  let store: StoreApi<TablePresenceStore>;

  beforeEach(() => {
    store = createTablePresenceStore(VHARN.id);
  });

  function apply(...updates: Parameters<TablePresenceStore['apply']>[0][]): void {
    for (const update of updates) store.getState().apply(update);
  }

  it('starts connecting, with no members and no version', () => {
    expect(store.getState()).toMatchObject({ status: 'connecting', version: null, members: [] });
  });

  it('a snapshot of version 3 sets the members and the version', () => {
    apply({ kind: 'state', state: vharnState({ version: 3 }) });
    expect(store.getState()).toMatchObject({
      version: 3,
      members: [ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE],
    });
  });

  it('memberJoined of someone already listed turns them online in place', () => {
    apply(
      { kind: 'state', state: vharnState({ version: 3 }) },
      { kind: 'memberJoined', event: biaJoined({ version: 4 }) },
    );
    expect(store.getState().members).toEqual([
      ANA_AT_TABLE,
      { ...BIA_AT_TABLE, online: true },
      CAIO_AT_TABLE,
    ]);
    expect(store.getState().version).toBe(4);
  });

  it('memberJoined of someone not listed adds them at the end', () => {
    apply(
      { kind: 'state', state: vharnState({ version: 3 }) },
      { kind: 'memberJoined', event: biaJoined({ version: 4, member: DUDA }) },
    );
    expect(store.getState().members.at(-1)).toEqual(DUDA);
  });

  it('an event whose version is not above the current one is discarded', () => {
    apply(
      { kind: 'state', state: vharnState({ version: 3 }) },
      { kind: 'memberJoined', event: biaJoined({ version: 3 }) },
    );
    expect(store.getState().members[1]).toEqual(BIA_AT_TABLE);
    expect(store.getState().version).toBe(3);
  });

  it('memberLeft turns the member offline and keeps them in the list', () => {
    apply(
      {
        kind: 'state',
        state: vharnState({
          version: 3,
          members: [ANA_AT_TABLE, { ...BIA_AT_TABLE, online: true }],
        }),
      },
      { kind: 'memberLeft', event: biaLeft({ version: 5 }) },
    );
    expect(store.getState().members).toEqual([ANA_AT_TABLE, BIA_AT_TABLE]);
    expect(store.getState().version).toBe(5);
  });

  it('an event before any snapshot is ignored', () => {
    apply({ kind: 'memberJoined', event: biaJoined({ version: 4 }) });
    expect(store.getState()).toMatchObject({ version: null, members: [] });
  });

  it('an event of another table is ignored', () => {
    apply(
      { kind: 'state', state: vharnState({ version: 3 }) },
      { kind: 'memberJoined', event: biaJoined({ version: 4, campaignId: QUELM.id }) },
    );
    expect(store.getState().version).toBe(3);
  });

  it('a snapshot of a lower version (the server restarted) is accepted', () => {
    apply(
      { kind: 'state', state: vharnState({ version: 7 }) },
      { kind: 'state', state: vharnState({ version: 1, members: [ANA_AT_TABLE] }) },
    );
    expect(store.getState()).toMatchObject({ version: 1, members: [ANA_AT_TABLE] });
  });

  it('status and failure updates are mirrored', () => {
    apply({ kind: 'status', status: 'live' });
    expect(store.getState().status).toBe('live');
    apply({ kind: 'failed', failure: 'not_found' });
    expect(store.getState()).toMatchObject({ status: 'failed', failure: 'not_found' });
  });

  it('onlineCount counts only who is online', () => {
    apply({ kind: 'state', state: vharnState() });
    expect(selectOnlineCount(store.getState())).toBe(2);
  });

  describe('activity', () => {
    const awaySince = '2026-10-22T12:00:00.000Z';

    function activity(version: number, since: string | null) {
      return {
        kind: 'memberActivity' as const,
        event: {
          campaignId: VHARN.id,
          version,
          userId: CAIO_AT_TABLE.userId,
          awaySince: since,
          at: awaySince,
        },
      };
    }

    function caio() {
      return store.getState().members.find(({ userId }) => userId === CAIO_AT_TABLE.userId);
    }

    it('memberActivity with a higher version marks since when Caio is away', () => {
      apply({ kind: 'state', state: vharnState({ version: 3 }) }, activity(4, awaySince));

      expect(caio()?.awaySince).toBe(awaySince);
      expect(store.getState().version).toBe(4);
    });

    it('memberActivity with a version not above the current one is ignored', () => {
      apply({ kind: 'state', state: vharnState({ version: 3 }) }, activity(3, awaySince));

      expect(caio()?.awaySince).toBeNull();
    });

    it('a snapshot replaces the absence', () => {
      apply({ kind: 'state', state: vharnState({ version: 3 }) }, activity(4, awaySince), {
        kind: 'state',
        state: vharnState({ version: 5 }),
      });

      expect(caio()?.awaySince).toBeNull();
    });

    it('memberLeft clears the absence along with the presence', () => {
      apply({ kind: 'state', state: vharnState({ version: 3 }) }, activity(4, awaySince), {
        kind: 'memberLeft',
        event: { campaignId: VHARN.id, version: 5, userId: CAIO_AT_TABLE.userId, at: awaySince },
      });

      expect(caio()).toMatchObject({ online: false, awaySince: null });
    });
  });

  describe('profile', () => {
    const awaySince = '2026-10-22T12:00:00.000Z';
    const biaAway = { ...BIA_AT_TABLE, online: true, awaySince };

    function bia() {
      return store.getState().members.find(({ userId }) => userId === BIA_AT_TABLE.userId);
    }

    function snapshotWithBiaAway(version: number) {
      return {
        kind: 'state' as const,
        state: vharnState({ version, members: [ANA_AT_TABLE, biaAway, CAIO_AT_TABLE] }),
      };
    }

    it('memberUpdated with a higher version swaps Bia in place, keeping her online and away', () => {
      apply(snapshotWithBiaAway(3), { kind: 'memberUpdated', event: biaUpdated({ version: 4 }) });

      expect(store.getState().members.map(({ userId }) => userId)).toEqual([
        ANA_AT_TABLE.userId,
        BIA_AT_TABLE.userId,
        CAIO_AT_TABLE.userId,
      ]);
      expect(bia()).toEqual({
        ...biaUpdated().member,
        online: true,
        awaySince,
      });
      expect(store.getState().version).toBe(4);
    });

    it('memberUpdated with a version not above the current one is ignored', () => {
      apply(snapshotWithBiaAway(3), { kind: 'memberUpdated', event: biaUpdated({ version: 3 }) });

      expect(bia()).toEqual(biaAway);
      expect(store.getState().version).toBe(3);
    });

    it('memberUpdated before any snapshot is ignored', () => {
      apply({ kind: 'memberUpdated', event: biaUpdated({ version: 4 }) });

      expect(store.getState()).toMatchObject({ version: null, members: [] });
    });

    it('memberUpdated of someone not in the roster adds no one', () => {
      const stranger = { ...biaUpdated().member, userId: '1e2d3c4b-5a69-4788-9abc-def012345678' };
      apply(snapshotWithBiaAway(3), {
        kind: 'memberUpdated',
        event: biaUpdated({ version: 4, member: stranger }),
      });

      expect(store.getState().members).toEqual([ANA_AT_TABLE, biaAway, CAIO_AT_TABLE]);
    });
  });

  describe('campaign changed', () => {
    it('campaignUpdated with a higher version moves the version and the time, members untouched', () => {
      apply({ kind: 'state', state: vharnState({ version: 3 }) });
      const members = store.getState().members;

      apply({
        kind: 'campaignUpdated',
        event: vharnRenamed({ version: 4, at: '2026-10-22T12:07:00.000Z' }),
      });

      expect(store.getState()).toMatchObject({ version: 4, at: '2026-10-22T12:07:00.000Z' });
      expect(store.getState().members).toBe(members);
    });

    it('campaignUpdated with a version not above the current one is ignored', () => {
      apply({ kind: 'state', state: vharnState({ version: 3 }) });

      apply({ kind: 'campaignUpdated', event: vharnRenamed({ version: 3 }) });

      expect(store.getState().version).toBe(3);
    });

    it('campaignUpdated of another table is ignored', () => {
      apply({ kind: 'state', state: vharnState({ version: 3 }) });

      apply({ kind: 'campaignUpdated', event: vharnRenamed({ version: 4, campaignId: QUELM.id }) });

      expect(store.getState().version).toBe(3);
    });

    it('a memberJoined right after a campaignUpdated applies above the new version', () => {
      apply({ kind: 'state', state: vharnState({ version: 1 }) });
      apply({ kind: 'campaignUpdated', event: vharnRenamed({ version: 2 }) });

      apply({ kind: 'memberJoined', event: biaJoined({ version: 2 }) });
      expect(store.getState().version).toBe(2);

      apply({ kind: 'memberJoined', event: biaJoined({ version: 3 }) });
      expect(store.getState().version).toBe(3);
    });
  });

  it('keeps the server time of the snapshot and of each newer event (what "há N min" counts from)', () => {
    apply({ kind: 'state', state: vharnState({ version: 3, at: '2026-10-22T12:00:00.000Z' }) });
    expect(store.getState().at).toBe('2026-10-22T12:00:00.000Z');

    apply({ kind: 'memberLeft', event: biaLeft({ version: 4, at: '2026-10-22T12:05:00.000Z' }) });
    expect(store.getState().at).toBe('2026-10-22T12:05:00.000Z');

    apply({ kind: 'memberLeft', event: biaLeft({ version: 4, at: '2026-10-22T12:09:00.000Z' }) });
    expect(store.getState().at).toBe('2026-10-22T12:05:00.000Z');
  });
});
