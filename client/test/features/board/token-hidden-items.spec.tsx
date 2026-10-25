import type { TokenDto } from '@lorkarium/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { DropdownMenu, DropdownMenuContent } from '@/components/ui/dropdown-menu';
import { TokenHiddenItems } from '@/features/board/token-hidden-items';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { KAEL_ID, VHARN_GRID, kael, lyra } from '../../support/table-session-fixtures';

describe('TokenHiddenItems', () => {
  let commands: TableBoardCommandsFake;
  let interaction: StoreApi<BoardInteractionStore>;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: String,
    });
  });

  function renderItems(targets: readonly TokenDto[]): void {
    render(
      <DropdownMenu open>
        <DropdownMenuContent aria-label="Ações">
          <TokenHiddenItems targets={targets} interaction={interaction} />
        </DropdownMenuContent>
      </DropdownMenu>,
    );
  }

  const item = (name: string) => screen.queryByRole('menuitem', { name });

  it('only visible targets offer "Tornar invisível" alone', () => {
    renderItems([lyra(), kael()]);

    expect(item('Tornar invisível')).not.toBeNull();
    expect(item('Tornar visível')).toBeNull();
  });

  it('only hidden targets offer "Tornar visível" alone', () => {
    renderItems([lyra({ hidden: true })]);

    expect(item('Tornar visível')).not.toBeNull();
    expect(item('Tornar invisível')).toBeNull();
  });

  it('a mixed selection offers both, and "Tornar invisível" sends only the visible one', async () => {
    renderItems([lyra({ hidden: true }), kael()]);

    expect(item('Tornar visível')).not.toBeNull();
    await userEvent.click(item('Tornar invisível') as HTMLElement);

    expect(commands.sentAs('setTokensHidden').map(({ fields }) => fields)).toEqual([
      { tokenIds: [KAEL_ID], hidden: true },
    ]);
  });
});
