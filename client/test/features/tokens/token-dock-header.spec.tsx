import type { TokenDto } from '@lorkarium/contracts';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { DockHeader } from '@/features/tokens/token-dock-header';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  KAEL_ID,
  kael,
  lyra,
  VHARN_GRID,
} from '../../support/table-session-fixtures';

describe('DockHeader', () => {
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: String,
    });
  });

  function renderHeader(token: TokenDto, isMain = false): void {
    render(
      <DockHeader
        token={token}
        isMain={isMain}
        viewerId={BIA_AT_TABLE.userId}
        members={[BIA_AT_TABLE]}
        interaction={interaction}
      />,
    );
  }

  const star = () => screen.getByRole('button', { name: 'Tornar Kael meu principal' });

  it('the main token carries the "Principal" mark, no star and no "Fechar ficha"', () => {
    renderHeader(lyra(), true);

    expect(screen.getByText('Principal')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /meu principal/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fechar ficha' })).toBeNull();
  });

  it('the star on Kael sends setMainToken with his id, and the focus goes to the name', async () => {
    renderHeader(kael());

    await userEvent.click(star());

    expect(commands.sentAs('setMainToken').map(({ fields }) => fields)).toEqual([
      { tokenId: KAEL_ID },
    ]);
    expect(screen.getByRole('heading', { name: 'Kael' })).toHaveFocus();
  });

  it('a token Bia is not listed in the control of has no star, only "Fechar ficha"', () => {
    renderHeader(kael({ controllerIds: [CAIO_AT_TABLE.userId] }));

    expect(screen.queryByRole('button', { name: /meu principal/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Fechar ficha' })).toBeInTheDocument();
  });

  it('while reconnecting the star is disabled', () => {
    renderHeader(kael());

    act(() => interaction.getState().setReadOnly(true));

    expect(star()).toBeDisabled();
  });

  it('a refusal says why on the status line, keeps the focus off the name and no mark appears', async () => {
    commands.answerWith({ ok: false, failure: 'forbidden' });
    renderHeader(kael());

    await userEvent.click(star());

    expect(interaction.getState().notice).toBe('forbidden');
    expect(screen.getByRole('heading', { name: 'Kael' })).not.toHaveFocus();
    expect(screen.queryByText('Principal')).toBeNull();
  });
});
