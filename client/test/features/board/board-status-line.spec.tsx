import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BoardStatusLine } from '@/features/board/board-status-line';
import { createBoardInteractionStore } from '@/stores/board-interaction-store';
import { createBoardStore } from '@/stores/board-store';
import { createTablePresenceStore } from '@/stores/table-presence-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  BIA_AT_TABLE,
  VHARN_SCENE,
  lyra,
  vharnBoard,
  vharnState,
} from '../../support/table-session-fixtures';

function renderLine(sight: { bright: number; dim: number } | null, vision: 'dark' | 'off') {
  const board = createBoardStore(VHARN.id, () => undefined);
  const presence = createTablePresenceStore(VHARN.id);
  presence.getState().apply({ kind: 'state', state: vharnState() });
  presence.getState().apply({ kind: 'status', status: 'live' });
  board.getState().apply({
    kind: 'board',
    state: vharnBoard({
      viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
      scene: { ...VHARN_SCENE, vision },
      tokens: [lyra({ sight })],
    }),
  });
  const interaction = createBoardInteractionStore({
    campaignId: VHARN.id,
    commands: new TableBoardCommandsFake(),
    describeRefusal: String,
  });
  render(<BoardStatusLine table={{ presence, board }} interaction={interaction} />);
  return screen.getByRole('status', { name: 'Status do tabuleiro' });
}

describe('BoardStatusLine and sight', () => {
  it('Bia in the dark with no token that sees reads "Nenhum token seu enxerga nesta cena."', () => {
    expect(renderLine(null, 'dark')).toHaveTextContent('Nenhum token seu enxerga nesta cena.');
  });

  it('with a token that sees, or with sight off, nothing is said', () => {
    expect(renderLine({ bright: 3, dim: 3 }, 'dark')).toHaveTextContent('');
  });
});
