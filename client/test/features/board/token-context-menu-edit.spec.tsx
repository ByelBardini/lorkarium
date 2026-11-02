import type { TableTokenRights } from '@lorkarium/game-core';
import type { TokenDto } from '@lorkarium/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { TokenContextMenu } from '@/features/board/token-context-menu';
import { TableTokenKeysContext } from '@/features/board/table-token-rights';
import { NO_TOKEN_KEYS } from '@/lib/token-rights-of-viewer';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  BIA_AT_TABLE,
  LYRA_ID,
  VHARN_GRID,
  lyra,
  vharnBoard,
} from '../../support/table-session-fixtures';

const BIA_VIEWER = { userId: BIA_AT_TABLE.userId, role: 'player' } as const;
const BIA_CREATES: TableTokenRights = { create: true, delete: false };

describe('TokenContextMenu, "Editar token…"', () => {
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;
  let editOf: string[];
  let closed: number;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
    });
    editOf = [];
    closed = 0;
  });

  type OpenOptions = Readonly<{
    viewer?: typeof BIA_VIEWER;
    keys?: TableTokenRights;
    withEdit?: boolean;
  }>;

  function openOn(token: TokenDto, options: OpenOptions = {}): void {
    const { viewer, keys = NO_TOKEN_KEYS, withEdit = true } = options;
    const state = vharnBoard({ tokens: [token], ...(viewer && { viewer }) });
    board.getState().apply({ kind: 'board', state });
    render(
      <TableTokenKeysContext value={keys}>
        <TokenContextMenu
          request={{ tokenId: token.id, x: 120, y: 80 }}
          board={board}
          interaction={interaction}
          onApplyCondition={() => undefined}
          onChangeImage={() => undefined}
          onChangeAura={() => undefined}
          {...(withEdit && { onEditToken: (tokenId: string) => editOf.push(tokenId) })}
          onClose={() => (closed += 1)}
        />
      </TableTokenKeysContext>,
    );
  }

  it('is the first item for the master', () => {
    openOn(lyra());

    expect(screen.getAllByRole('menuitem')[0]).toHaveTextContent('Editar token…');
  });

  it('asks for the dialog of that token alone, even inside a selection, and closes', async () => {
    interaction.getState().selectMany([LYRA_ID, 'outro'], { additive: false });
    openOn(lyra());

    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar token…' }));

    expect(editOf).toEqual([LYRA_ID]);
    expect(closed).toBe(1);
    expect(commands.sent).toEqual([]);
  });

  it('a player who controls a token the master made has no "Editar token…"', () => {
    openOn(lyra({ createdBy: null }), { viewer: BIA_VIEWER, keys: BIA_CREATES });

    expect(screen.getByRole('menuitem', { name: 'Aplicar condição…' })).not.toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Editar token…' })).toBeNull();
  });

  it('a player who created the token, with the key to create, gets "Editar token…"', () => {
    openOn(lyra({ createdBy: BIA_AT_TABLE.userId }), { viewer: BIA_VIEWER, keys: BIA_CREATES });

    expect(screen.getByRole('menuitem', { name: 'Editar token…' })).not.toBeNull();
  });

  it('the same player without the key to create has no "Editar token…"', () => {
    openOn(lyra({ createdBy: BIA_AT_TABLE.userId }), { viewer: BIA_VIEWER });

    expect(screen.queryByRole('menuitem', { name: 'Editar token…' })).toBeNull();
  });

  it('without onEditToken there is no such item', () => {
    openOn(lyra(), { withEdit: false });

    expect(screen.queryByRole('menuitem', { name: 'Editar token…' })).toBeNull();
  });
});
