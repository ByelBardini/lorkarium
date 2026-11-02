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

  function renderHeader(token: TokenDto, isMain = false, isMaster = false): void {
    render(
      <DockHeader
        token={token}
        isMain={isMain}
        isMaster={isMaster}
        members={[BIA_AT_TABLE]}
        interaction={interaction}
      />,
    );
  }

  it('the main token carries the "Principal" mark, no star and no "Fechar ficha"', () => {
    renderHeader(lyra(), true);

    expect(screen.getByText('Principal')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /meu principal/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fechar ficha' })).toBeNull();
  });

  // The main token is the token of one's character: there is nothing to choose any more.
  it('another token Bia controls has "Fechar ficha" and no star to make it her main one', () => {
    renderHeader(kael());

    expect(screen.getByRole('button', { name: 'Fechar ficha' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /meu principal/ })).toBeNull();
  });

  describe('"Invisível para os jogadores" (master)', () => {
    const wolf = (hidden: boolean) => kael({ name: 'Lobo', hidden, controllerIds: [] });
    const toggle = () => screen.queryByRole('button', { name: 'Invisível para os jogadores' });

    it('on the hidden wolf the master sees the switch pressed', () => {
      renderHeader(wolf(true), false, true);

      expect(toggle()).toHaveAttribute('aria-pressed', 'true');
    });

    it('pressing it on the visible wolf hides him and the screen reader hears it', async () => {
      renderHeader(wolf(false), false, true);
      expect(toggle()).toHaveAttribute('aria-pressed', 'false');

      await userEvent.click(toggle() as HTMLElement);

      expect(commands.sentAs('setTokensHidden').map(({ fields }) => fields)).toEqual([
        { tokenIds: [KAEL_ID], hidden: true },
      ]);
      expect(interaction.getState().notice).toBe('Lobo invisível para os jogadores.');
    });

    it('pressing it on the hidden wolf shows him: "Lobo visível para os jogadores."', async () => {
      renderHeader(wolf(true), false, true);

      await userEvent.click(toggle() as HTMLElement);

      expect(interaction.getState().notice).toBe('Lobo visível para os jogadores.');
    });

    it('a player never sees the switch', () => {
      renderHeader(wolf(true));

      expect(toggle()).toBeNull();
    });

    it('while reconnecting the switch is disabled', () => {
      renderHeader(wolf(false), false, true);

      act(() => interaction.getState().setReadOnly(true));

      expect(toggle()).toBeDisabled();
    });
  });
});
