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
  vharnState,
} from '../support/table-session-fixtures';

const DUDA = {
  userId: '1e2d3c4b-5a69-4788-9abc-def012345678',
  name: 'Duda',
  role: 'player',
  online: true,
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
});
