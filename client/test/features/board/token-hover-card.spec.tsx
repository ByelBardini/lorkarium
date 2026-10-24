import { render, screen, within } from '@testing-library/react';
import type { TokenDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { TokenHoverCard } from '@/features/board/token-hover-card';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  KAEL_ID,
  activeCondition,
  kael,
  lyra,
  vharnBoard,
  VHARN_GRID,
} from '../../support/table-session-fixtures';

const RECT = { x: 300, y: 200, width: 64, height: 64 };
const KAEL_CONDITIONS = [
  activeCondition({ id: 'a1', name: 'Abençoado', tone: 'benefit', remainingRounds: null }),
  activeCondition({ id: 'a2', name: 'Envenenado', tone: 'harm', remainingRounds: 2 }),
  activeCondition({ id: 'a3', name: 'Paralisado', tone: 'incapacitating', remainingRounds: 1 }),
  activeCondition({
    id: 'a4',
    name: 'Invisível',
    tone: 'benefit',
    look: 'invisible',
    remainingRounds: null,
  }),
];

describe('TokenHoverCard', () => {
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands: new TableBoardCommandsFake(),
      describeRefusal: String,
    });
  });

  function renderCard(token: TokenDto): void {
    board.getState().apply({ kind: 'board', state: vharnBoard({ tokens: [token] }) });
    render(
      <TokenHoverCard
        request={{ tokenId: KAEL_ID, rect: RECT }}
        board={board}
        interaction={interaction}
      />,
    );
  }

  function card(): HTMLElement {
    return screen.getByRole('tooltip');
  }

  it('names the token and lists every condition, the looks first and then the heaviest, with how long each lasts', () => {
    renderCard(kael({ conditions: KAEL_CONDITIONS }));
    expect(card()).toHaveTextContent('Kael');
    const list = within(card()).getByRole('list', { name: 'Condições de Kael' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Invisívelsem limite',
      'Paralisado1 rodada',
      'Envenenado2 rodadas',
      'Abençoadosem limite',
    ]);
  });

  it('the condition on its last round reads in the error color', () => {
    renderCard(kael({ conditions: KAEL_CONDITIONS }));
    expect(within(card()).getByText('1 rodada')).toHaveClass('text-destructive-text');
    expect(within(card()).getByText('2 rodadas')).not.toHaveClass('text-destructive-text');
  });

  it('with the bar at position 0 received, it shows the meter', () => {
    renderCard(kael({ bars: lyra().bars }));
    expect(within(card()).getByRole('meter', { name: 'PV de Kael' })).toHaveTextContent('32 / 45');
  });

  it('with the bar hidden from this viewer, no meter', () => {
    renderCard(kael({ bars: [] }));
    expect(within(card()).queryByRole('meter')).toBeNull();
  });

  it('a token without condition says so', () => {
    renderCard(kael());
    expect(card()).toHaveTextContent('Nenhuma condição.');
  });

  it('does not take the focus from where it was', () => {
    renderCard(kael({ conditions: KAEL_CONDITIONS }));
    expect(card()).not.toContainElement(document.activeElement as HTMLElement | null);
  });
});
