import { beforeEach, describe, expect, it } from 'vitest';
import type { FriendsOverviewDto } from '@lorkarium/contracts';
import type { FriendsResult } from '@/services/friends-api';
import {
  createFriendsStore,
  presenceOf,
  selectIncomingCount,
  type FriendsStore,
} from '@/stores/friends-store';
import type { StoreApi } from 'zustand/vanilla';
import { FriendsApiFake } from '../support/friends-api-fake';
import {
  BIA,
  CAIO,
  THIAGO_ASKS,
  friendsOverview,
  presenceChanged,
} from '../support/friends-fixtures';

const OFFLINE = { ok: false, failure: { kind: 'offline' } } as const;
const VHARN_TABLE = { campaignId: '3d4e5f60-7182-4a93-8ba4-c5d6e7f80911', name: 'Vharn' };

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('friends store', () => {
  let api: FriendsApiFake;
  let store: StoreApi<FriendsStore>;

  beforeEach(() => {
    api = new FriendsApiFake();
    store = createFriendsStore(api);
  });

  it('starts empty: no lists, not loading, everyone offline', () => {
    expect(store.getState()).toMatchObject({ overview: null, loading: false, failure: null });
    expect(presenceOf(store.getState(), BIA.userId)).toEqual({ status: 'offline', table: null });
    expect(selectIncomingCount(store.getState())).toBe(0);
  });

  it('load fills the four lists', async () => {
    await store.getState().load();
    expect(store.getState().overview).toEqual(friendsOverview());
    expect(store.getState().loading).toBe(false);
    expect(selectIncomingCount(store.getState())).toBe(1);
  });

  it('is loading while the read is in flight', () => {
    api.answers.hold('overview');
    void store.getState().load();
    expect(store.getState().loading).toBe(true);
  });

  it('friendsChanged reads the lists again', async () => {
    await store.getState().load();
    api.lists = friendsOverview({ incoming: [] });
    store.getState().apply({ kind: 'friendsChanged' });
    await settle();
    expect(store.getState().overview?.incoming).toEqual([]);
  });

  it('two friendsChanged in a row keep one read in flight, and one more after it answers', async () => {
    const release = api.answers.hold('overview');
    store.getState().apply({ kind: 'friendsChanged' });
    store.getState().apply({ kind: 'friendsChanged' });
    store.getState().apply({ kind: 'friendsChanged' });
    expect(api.answers.callsOf('overview')).toHaveLength(1);
    api.answers.clear('overview');
    release({ ok: true, value: friendsOverview() });
    await settle();
    expect(api.answers.callsOf('overview')).toHaveLength(2);
  });

  it('a read offline keeps the last lists with the failure; the next good read clears it', async () => {
    await store.getState().load();
    api.answers.answer('overview', OFFLINE);
    await store.getState().load();
    expect(store.getState()).toMatchObject({
      overview: friendsOverview(),
      failure: { kind: 'offline' },
    });
    api.answers.clear('overview');
    await store.getState().load();
    expect(store.getState().failure).toBeNull();
  });

  it('presenceSynced replaces every presence', async () => {
    await store.getState().load();
    store
      .getState()
      .apply({ kind: 'friendChanged', event: presenceChanged({ userId: CAIO.userId }) });
    store.getState().apply({
      kind: 'presenceSynced',
      friends: [{ userId: BIA.userId, status: 'away', table: null }],
    });
    expect(presenceOf(store.getState(), BIA.userId).status).toBe('away');
    expect(presenceOf(store.getState(), CAIO.userId).status).toBe('offline');
  });

  it('friendChanged of a friend changes that one presence in place, table included', async () => {
    await store.getState().load();
    store
      .getState()
      .apply({ kind: 'friendChanged', event: presenceChanged({ table: VHARN_TABLE }) });
    expect(presenceOf(store.getState(), BIA.userId)).toEqual({
      status: 'online',
      table: VHARN_TABLE,
    });
    expect(presenceOf(store.getState(), CAIO.userId).status).toBe('offline');
  });

  it('friendChanged of someone who is not a friend is ignored', async () => {
    await store.getState().load();
    store.getState().apply({
      kind: 'friendChanged',
      event: presenceChanged({ userId: THIAGO_ASKS.userId }),
    });
    expect(store.getState().presence).toEqual({});
  });

  it('friendChanged before the lists arrive is ignored', () => {
    store.getState().apply({ kind: 'friendChanged', event: presenceChanged() });
    expect(store.getState().presence).toEqual({});
  });

  it.each([
    ['acceptRequest', THIAGO_ASKS.userId],
    ['dropRequest', THIAGO_ASKS.userId],
    ['removeFriend', BIA.userId],
    ['unblock', BIA.userId],
  ] as const)('%s that succeeds answers ok and reads the lists again', async (method, userId) => {
    api.answers.answer(method, {
      ok: true,
      value: method === 'acceptRequest' ? BIA : null,
    } as never);
    expect(await store.getState()[method](userId)).toEqual({ ok: true, value: null });
    await settle();
    expect(api.answers.callsOf(method)).toEqual([userId]);
    expect(api.answers.callsOf('overview')).toHaveLength(1);
  });

  it('sendRequest answers the outcome and reads the lists again', async () => {
    api.answers.answer('sendRequest', { ok: true, value: 'sent' });
    expect(await store.getState().sendRequest('@thiagaum')).toEqual({ ok: true, value: 'sent' });
    await settle();
    expect(api.answers.callsOf('overview')).toHaveLength(1);
  });

  it('block by @ answers ok and reads the lists again', async () => {
    api.answers.answer('block', { ok: true, value: { ...BIA, at: BIA.since } });
    expect(await store.getState().block({ username: 'biaflor' })).toEqual({
      ok: true,
      value: null,
    });
    await settle();
    expect(api.answers.callsOf('overview')).toHaveLength(1);
  });

  it('a refused command answers the failure and reads nothing', async () => {
    const refused: FriendsResult<null> = { ok: false, failure: { kind: 'friend_not_found' } };
    api.answers.answer('removeFriend', refused);
    expect(await store.getState().removeFriend(BIA.userId)).toEqual(refused);
    await settle();
    expect(api.answers.callsOf('overview')).toHaveLength(0);
  });

  it('reset forgets the lists and the presence, and drops a read that answers after', async () => {
    await store.getState().load();
    store.getState().apply({ kind: 'friendChanged', event: presenceChanged() });
    const release = api.answers.hold('overview');
    void store.getState().load();
    store.getState().reset();
    release({ ok: true, value: friendsOverview() as FriendsOverviewDto });
    await settle();
    expect(store.getState()).toMatchObject({ overview: null, presence: {}, loading: false });
  });
});
