import type { TokenDto } from '@lorkarium/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { TokenContextMenu } from '@/features/board/token-context-menu';
import { TableTokenKeysContext } from '@/features/board/table-token-rights';
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
  vharnBoard,
} from '../../support/table-session-fixtures';
import { WOLF_FORM_ID, shapeshiftingLyra } from '../../support/token-form-fixtures';

const BIA_VIEWER = { userId: BIA_AT_TABLE.userId, role: 'player' } as const;

describe('TokenFormItems ("Trocar forma" in the token menu)', () => {
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;
  let editFormsOf: string[];

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
    });
    editFormsOf = [];
  });

  function openOn(token: TokenDto, viewer?: typeof BIA_VIEWER): void {
    const state = vharnBoard({ tokens: [token], ...(viewer && { viewer }) });
    board.getState().apply({ kind: 'board', state });
    render(
      <TokenContextMenu
        request={{ tokenId: token.id, x: 120, y: 80 }}
        board={board}
        interaction={interaction}
        onApplyCondition={() => undefined}
        onChangeImage={() => undefined}
        onChangeAura={() => undefined}
        onEditForms={(tokenId) => editFormsOf.push(tokenId)}
        onClose={() => undefined}
      />,
    );
  }

  async function openForms(): Promise<void> {
    await userEvent.click(screen.getByRole('menuitem', { name: 'Trocar forma' }));
  }

  it('lists the three forms as radios, the active one checked and the key on the others', async () => {
    openOn(shapeshiftingLyra());

    await openForms();

    const radios = screen.getAllByRole('menuitemradio');
    expect(radios.map((radio) => radio.textContent)).toEqual(['Lyra', 'Lobo atroz2', 'Corvo3']);
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(within(radios[1] as HTMLElement).getByText('2')).not.toBeNull();
  });

  it('choosing "Lobo atroz" switches Lyra to the wolf', async () => {
    openOn(shapeshiftingLyra());
    await openForms();

    await userEvent.click(screen.getByRole('menuitemradio', { name: /Lobo atroz/ }));

    expect(commands.sentAs('setTokenForm').map(({ fields }) => fields)).toEqual([
      { tokenId: LYRA_ID, formId: WOLF_FORM_ID },
    ]);
  });

  it('a token without forms has no "Trocar forma"', () => {
    openOn(shapeshiftingLyra({ forms: [], activeFormId: null }));

    expect(screen.queryByRole('menuitem', { name: 'Trocar forma' })).toBeNull();
  });

  it('whoever does not control the token has no "Trocar forma"', () => {
    openOn(shapeshiftingLyra({ canControl: false }));

    expect(screen.queryByRole('menuitem', { name: 'Trocar forma' })).toBeNull();
  });

  it('"Editar formas…" asks for the dialog of that token', async () => {
    openOn(shapeshiftingLyra());
    await openForms();

    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar formas…' }));

    expect(editFormsOf).toEqual([LYRA_ID]);
  });

  it('a player who controls but may not edit the token switches with no "Editar formas…"', async () => {
    openOn(shapeshiftingLyra({ createdBy: BIA_AT_TABLE.userId }), BIA_VIEWER);
    await openForms();

    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3);
    expect(screen.queryByRole('menuitem', { name: 'Editar formas…' })).toBeNull();
  });

  it('a player who created the token, with the key to create, also gets "Editar formas…"', async () => {
    const keys = { create: true, delete: false };
    const state = vharnBoard({
      tokens: [shapeshiftingLyra({ createdBy: BIA_AT_TABLE.userId })],
      viewer: BIA_VIEWER,
    });
    board.getState().apply({ kind: 'board', state });
    render(
      <TableTokenKeysContext value={keys}>
        <TokenContextMenu
          request={{ tokenId: LYRA_ID, x: 120, y: 80 }}
          board={board}
          interaction={interaction}
          onApplyCondition={() => undefined}
          onChangeImage={() => undefined}
          onChangeAura={() => undefined}
          onEditForms={(tokenId) => editFormsOf.push(tokenId)}
          onClose={() => undefined}
        />
      </TableTokenKeysContext>,
    );
    await openForms();

    expect(screen.getByRole('menuitem', { name: 'Editar formas…' })).not.toBeNull();
  });
});
