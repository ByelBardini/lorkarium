import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import {
  OPEN_TABLES_STORAGE_KEY,
  createOpenTablesStore,
  type OpenTablesStore,
} from '@/stores/open-tables-store';
import { ANA } from '../support/auth-api-fake';
import { QUELM, VHARN } from '../support/campaigns-api-fake';
import { StorageFake } from '../support/storage-fake';
import { TableSessionApiFake } from '../support/table-session-api-fake';
import { copiedOf } from '@/lib/paste-placement';
import { BIA_AT_TABLE, lyra, vharnState } from '../support/table-session-fixtures';

const VHARN_TABLE = { campaignId: VHARN.id, name: 'Vharn' };
const QUELM_TABLE = { campaignId: QUELM.id, name: 'Quelm' };
const MORE_TABLES = [1, 2, 3, 4].map((n) => ({
  campaignId: `a1000000-0000-4000-8000-00000000000${n}`,
  name: `Mesa ${n}`,
}));

describe('open tables store', () => {
  let api: TableSessionApiFake;
  let storage: StorageFake;
  let store: StoreApi<OpenTablesStore>;

  beforeEach(() => {
    api = new TableSessionApiFake();
    storage = new StorageFake();
    store = createOpenTablesStore({ api, storage });
  });

  function stored(): unknown {
    const raw = storage.values.get(OPEN_TABLES_STORAGE_KEY);
    return raw === undefined ? undefined : JSON.parse(raw);
  }

  function openIds(): string[] {
    return store.getState().tables.map(({ campaignId }) => campaignId);
  }

  function storeWith(value: unknown): void {
    storage.values.set(OPEN_TABLES_STORAGE_KEY, JSON.stringify(value));
  }

  it('opening VHARN after restoring Ana lists it, opens its session and stores it with her id', () => {
    store.getState().restore(ANA.id);
    expect(store.getState().open(VHARN_TABLE)).toBe('opened');
    expect(openIds()).toEqual([VHARN.id]);
    expect(api.opened).toEqual([VHARN.id]);
    expect(stored()).toEqual({ userId: ANA.id, tables: [VHARN_TABLE] });
  });

  it('opening VHARN again is already-open and does not open a second session', () => {
    store.getState().restore(ANA.id);
    store.getState().open(VHARN_TABLE);
    expect(store.getState().open(VHARN_TABLE)).toBe('already-open');
    expect(api.opened).toEqual([VHARN.id]);
  });

  it('an update of VHARN reaches the VHARN presence and one of QUELM leaves it alone', () => {
    store.getState().restore(ANA.id);
    store.getState().open(VHARN_TABLE);
    store.getState().open(QUELM_TABLE);
    api.emitTo(VHARN.id, { kind: 'state', state: vharnState() });
    api.emitTo(QUELM.id, { kind: 'status', status: 'reconnecting' });
    const [vharn, quelm] = store.getState().tables;
    expect(vharn?.presence.getState().members).toHaveLength(3);
    expect(vharn?.presence.getState().status).toBe('connecting');
    expect(quelm?.presence.getState().status).toBe('reconnecting');
  });

  it('with 5 tables open, opening a 6th is full and changes nothing', () => {
    store.getState().restore(ANA.id);
    for (const table of [...MORE_TABLES, VHARN_TABLE]) store.getState().open(table);
    expect(store.getState().open(QUELM_TABLE)).toBe('full');
    expect(api.opened).toHaveLength(5);
    expect(openIds()).not.toContain(QUELM.id);
  });

  it('closing VHARN closes its session and takes it out of the list and the storage', () => {
    store.getState().restore(ANA.id);
    store.getState().open(VHARN_TABLE);
    store.getState().open(QUELM_TABLE);
    store.getState().close(VHARN.id);
    expect(api.closedIds).toEqual([VHARN.id]);
    expect(openIds()).toEqual([QUELM.id]);
    expect(stored()).toEqual({ userId: ANA.id, tables: [QUELM_TABLE] });
  });

  it('closing a table that is not open does nothing', () => {
    store.getState().restore(ANA.id);
    store.getState().open(QUELM_TABLE);
    store.getState().close(VHARN.id);
    expect(api.closedIds).toEqual([]);
    expect(openIds()).toEqual([QUELM.id]);
  });

  it('restoring Ana after an F5 reopens VHARN and QUELM in that order, and a second restore opens nothing', () => {
    storeWith({ userId: ANA.id, tables: [VHARN_TABLE, QUELM_TABLE] });
    store.getState().restore(ANA.id);
    store.getState().restore(ANA.id);
    expect(api.opened).toEqual([VHARN.id, QUELM.id]);
    expect(store.getState().tables.map(({ name }) => name)).toEqual(['Vharn', 'Quelm']);
  });

  it('restoring Ana from a list stored by Bia opens nothing', () => {
    storeWith({ userId: BIA_AT_TABLE.userId, tables: [VHARN_TABLE] });
    store.getState().restore(ANA.id);
    expect(api.opened).toEqual([]);
    expect(store.getState().ownerId).toBe(ANA.id);
  });

  it('restoring Bia in a tab where Ana left tables open closes the tables of Ana', () => {
    store.getState().restore(ANA.id);
    store.getState().open(VHARN_TABLE);
    store.getState().restore(BIA_AT_TABLE.userId);
    expect(api.closedIds).toEqual([VHARN.id]);
    expect(store.getState().tables).toEqual([]);
    expect(store.getState().ownerId).toBe(BIA_AT_TABLE.userId);
  });

  it.each([
    ['invalid JSON', '{not json'],
    ['the wrong shape', JSON.stringify({ userId: ANA.id, tables: 'VHARN' })],
    [
      'more than 5 tables',
      JSON.stringify({ userId: ANA.id, tables: [...MORE_TABLES, VHARN_TABLE, QUELM_TABLE] }),
    ],
  ])('restoring from %s gives an empty list without error', (_, raw) => {
    storage.values.set(OPEN_TABLES_STORAGE_KEY, raw);
    store.getState().restore(ANA.id);
    expect(store.getState().tables).toEqual([]);
  });

  it('a storage that throws gives an empty list and still opens tables in memory', () => {
    store = createOpenTablesStore({ api, storage: new StorageFake(true) });
    store.getState().restore(ANA.id);
    expect(store.getState().open(VHARN_TABLE)).toBe('opened');
    expect(openIds()).toEqual([VHARN.id]);
  });

  it('closing all on logout closes every session, empties the list, clears the storage and forgets the owner', () => {
    store.getState().restore(ANA.id);
    store.getState().open(VHARN_TABLE);
    store.getState().open(QUELM_TABLE);
    store.getState().closeAll();
    expect(api.closedIds).toEqual([VHARN.id, QUELM.id]);
    expect(store.getState().tables).toEqual([]);
    expect(stored()).toBeUndefined();
    expect(store.getState().ownerId).toBeNull();
  });

  it('suspending all after a refused session closes every table and keeps the list for the next restore', () => {
    store.getState().restore(ANA.id);
    store.getState().open(VHARN_TABLE);
    api.emitTo(VHARN.id, { kind: 'failed', failure: 'unauthenticated' });
    store.getState().suspendAll();
    expect(api.closedIds).toEqual([VHARN.id]);
    expect(store.getState()).toMatchObject({ ownerId: null, tables: [], sessionRefused: false });
    store.getState().restore(ANA.id);
    expect(api.opened).toEqual([VHARN.id, VHARN.id]);
  });

  it('a session refused as unauthenticated in any table marks sessionRefused', () => {
    store.getState().restore(ANA.id);
    store.getState().open(VHARN_TABLE);
    store.getState().open(QUELM_TABLE);
    expect(store.getState().sessionRefused).toBe(false);
    api.emitTo(QUELM.id, { kind: 'failed', failure: 'unauthenticated' });
    expect(store.getState().sessionRefused).toBe(true);
  });

  it('each open table keeps its own copy area: a copy at VHARN is not there at QUELM', () => {
    store.getState().restore(ANA.id);
    store.getState().open(VHARN_TABLE);
    store.getState().open(QUELM_TABLE);
    const [vharn, quelm] = store.getState().tables;

    vharn?.edits.getState().copy(copiedOf([lyra()], []));

    expect(vharn?.edits.getState().copied?.tokens).toHaveLength(1);
    expect(quelm?.edits.getState().copied).toBeNull();
  });

  it('the copy of a table stays while it is open, whatever table the room shows', () => {
    store.getState().restore(ANA.id);
    store.getState().open(VHARN_TABLE);
    store
      .getState()
      .tables[0]?.edits.getState()
      .copy(copiedOf([lyra()], []));

    store.getState().open(QUELM_TABLE);

    const vharn = store.getState().tables.find(({ campaignId }) => campaignId === VHARN.id);
    expect(vharn?.edits.getState().copied?.tokens).toHaveLength(1);
  });
});
