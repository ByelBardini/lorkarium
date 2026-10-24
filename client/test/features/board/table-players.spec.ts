import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import {
  TablePlayersContext,
  usePlayerIdsOf,
  useTablePlayers,
} from '@/features/board/table-players';
import { createTablePresenceStore, type TablePresenceStore } from '@/stores/table-presence-store';
import { VHARN } from '../../support/campaigns-api-fake';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  biaUpdated,
  duda,
  vharnState,
} from '../../support/table-session-fixtures';

describe('usePlayerIdsOf', () => {
  let presence: StoreApi<TablePresenceStore>;

  beforeEach(() => {
    presence = createTablePresenceStore(VHARN.id);
    const members = [ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE, duda()];
    presence.getState().apply({ kind: 'state', state: vharnState({ members }) });
  });

  it('gives the players of the roster, without the master nor the spectator', () => {
    const { result } = renderHook(() => usePlayerIdsOf(presence));

    expect(result.current).toEqual([BIA_AT_TABLE.userId, CAIO_AT_TABLE.userId]);
  });

  it('Bia going away hands a new roster but the very same players', () => {
    const { result } = renderHook(() => usePlayerIdsOf(presence));
    const first = result.current;
    act(() =>
      presence.getState().apply({
        kind: 'memberActivity',
        event: {
          campaignId: VHARN.id,
          version: 2,
          userId: BIA_AT_TABLE.userId,
          awaySince: '2026-10-15T12:05:00.000Z',
          at: '2026-10-15T12:05:00.000Z',
        },
      }),
    );

    expect(result.current).toBe(first);
  });

  it('Bia demoted to spectator leaves only Caio', () => {
    const { result } = renderHook(() => usePlayerIdsOf(presence));
    act(() =>
      presence.getState().apply({
        kind: 'memberUpdated',
        event: biaUpdated({ member: { ...BIA_AT_TABLE, role: 'spectator' } }),
      }),
    );

    expect(result.current).toEqual([CAIO_AT_TABLE.userId]);
  });

  it('before the table opens (no presence) there are no players', () => {
    const { result } = renderHook(() => usePlayerIdsOf(null));

    expect(result.current).toEqual([]);
  });
});

describe('useTablePlayers', () => {
  it('reads the players the room gives', () => {
    const players = [BIA_AT_TABLE.userId];
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) =>
      createElement(TablePlayersContext.Provider, { value: players }, children);
    const { result } = renderHook(() => useTablePlayers(), { wrapper });

    expect(result.current).toBe(players);
  });

  it('outside a room there are none', () => {
    const { result } = renderHook(() => useTablePlayers());

    expect(result.current).toEqual([]);
  });
});
