import type { TokenDto } from '@lorkarium/contracts';
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

function renderLine(
  tokens: TokenDto[],
  vision: 'dark' | 'off',
  role: 'player' | 'master' = 'player',
) {
  const board = createBoardStore(VHARN.id, () => undefined);
  const presence = createTablePresenceStore(VHARN.id);
  presence.getState().apply({ kind: 'state', state: vharnState() });
  presence.getState().apply({ kind: 'status', status: 'live' });
  board.getState().apply({
    kind: 'board',
    state: vharnBoard({
      viewer: { userId: BIA_AT_TABLE.userId, role },
      scene: { ...VHARN_SCENE, vision },
      tokens,
    }),
  });
  const interaction = createBoardInteractionStore({
    campaignId: VHARN.id,
    commands: new TableBoardCommandsFake(),
    describeRefusal: String,
  });
  if (role === 'master') {
    interaction.getState().allowLayerChoice(true);
    interaction.getState().toggleSightPreview();
  }
  render(<BoardStatusLine table={{ presence, board }} interaction={interaction} />);
  return screen.getByRole('status', { name: 'Status do tabuleiro' });
}

describe('BoardStatusLine and sight', () => {
  it('Bia in the dark with no token of hers on the scene reads "Nenhum token seu está nesta cena."', () => {
    const notHers = lyra({ canControl: false, controllerIds: [] });
    expect(renderLine([notHers], 'dark')).toHaveTextContent('Nenhum token seu está nesta cena.');
  });

  it('with a token of hers, even without darkvision, nothing is said', () => {
    expect(renderLine([lyra({ sight: null })], 'dark')).toHaveTextContent('');
  });

  it('the master previewing with no token selected reads "Selecione um token para ver como ele."', () => {
    expect(renderLine([lyra()], 'dark', 'master')).toHaveTextContent(
      'Selecione um token para ver como ele.',
    );
  });
});
