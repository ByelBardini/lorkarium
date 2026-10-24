import type { CampaignRoleDto } from '@lorkarium/contracts';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { useInteractionFollowsTable } from '@/features/board/use-interaction-follows-table';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createTablePresenceStore, type TablePresenceStore } from '@/stores/table-presence-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { VHARN_GRID, vharnState } from '../../support/table-session-fixtures';

describe('useInteractionFollowsTable and the role', () => {
  let presence: StoreApi<TablePresenceStore>;
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;

  beforeEach(() => {
    presence = createTablePresenceStore(VHARN.id);
    presence.getState().apply({ kind: 'state', state: vharnState() });
    board = createBoardStore(VHARN.id, () => undefined);
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands: new TableBoardCommandsFake(),
      describeRefusal: String,
    });
  });

  function follow(role: CampaignRoleDto) {
    return renderHook(
      ({ current }: Readonly<{ current: CampaignRoleDto }>) =>
        useInteractionFollowsTable({ presence, board }, interaction, current),
      { initialProps: { current: role } },
    );
  }

  it('a spectator stays read only with the connection live', () => {
    act(() => presence.getState().apply({ kind: 'status', status: 'live' }));
    follow('spectator');

    expect(interaction.getState().readOnly).toBe(true);
  });

  it('a player with the connection live may send', () => {
    act(() => presence.getState().apply({ kind: 'status', status: 'live' }));
    follow('player');

    expect(interaction.getState().readOnly).toBe(false);
  });

  it('a player reconnecting is read only, as before', () => {
    act(() => presence.getState().apply({ kind: 'status', status: 'live' }));
    follow('player');
    act(() => presence.getState().apply({ kind: 'status', status: 'reconnecting' }));

    expect(interaction.getState().readOnly).toBe(true);
  });

  it('promoted live (the role passed changes), the spectator may send at once', () => {
    act(() => presence.getState().apply({ kind: 'status', status: 'live' }));
    const hook = follow('spectator');
    hook.rerender({ current: 'player' });

    expect(interaction.getState().readOnly).toBe(false);
  });

  it('demoted live, the player is read only at once', () => {
    act(() => presence.getState().apply({ kind: 'status', status: 'live' }));
    const hook = follow('player');
    hook.rerender({ current: 'spectator' });

    expect(interaction.getState().readOnly).toBe(true);
  });
});
