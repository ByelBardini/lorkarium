import { cell } from '@lorkarium/game-core';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { boardCommandFailureMessage } from '@/features/board/board-messages';
import { TokenContextMenu } from '@/features/board/token-context-menu';
import { TokenDialog } from '@/features/tokens/token-dialog';
import { CardLinkDialog, type CardLinkRequest } from '@/features/tokens/token-link-items';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createTablePresenceStore, type TablePresenceStore } from '@/stores/table-presence-store';
import { AssetsApiFake } from '../../support/assets-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { LYRA_ANCHOR_ID, castBoard, linkedLyra } from '../../support/cast-fixtures';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  KAEL_ID,
  LYRA_ID,
  kael,
  memberCard,
  vharnBoard,
  VHARN_GRID,
} from '../../support/table-session-fixtures';

const BIA_CARD = memberCard({ anchorTokenId: LYRA_ANCHOR_ID });

describe('the character on a token', () => {
  let board: StoreApi<BoardStore>;
  let cast: StoreApi<BoardStore>;
  let presence: StoreApi<TablePresenceStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;

  beforeEach(() => {
    cast = createBoardStore(VHARN.id, () => undefined);
    cast.getState().apply({ kind: 'board', state: castBoard({ memberCards: [BIA_CARD] }) });
    board = createBoardStore(
      VHARN.id,
      () => undefined,
      () => cast.getState().board,
    );
    const tokens = [kael(), linkedLyra({ col: 8 })];
    board.getState().apply({ kind: 'board', state: vharnBoard({ tokens }) });
    presence = createTablePresenceStore(VHARN.id);
    presence.setState({ members: [ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE] });
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: boardCommandFailureMessage,
    });
    interaction.getState().allowLayerChoice(true);
  });

  // The room's part: the menu, and the confirmation it may ask for once it closed.
  function Room({ tokenId }: Readonly<{ tokenId: string }>) {
    const [menu, setMenu] = useState(true);
    const [link, setLink] = useState<CardLinkRequest | null>(null);
    return (
      <>
        {menu && (
          <TokenContextMenu
            request={{ tokenId, x: 10, y: 10 }}
            board={board}
            presence={presence}
            interaction={interaction}
            onApplyCondition={() => undefined}
            onChangeImage={() => undefined}
            onChangeAura={() => undefined}
            characters={{ cast, onConfirmLink: setLink }}
            onClose={() => setMenu(false)}
          />
        )}
        {link && (
          <CardLinkDialog request={link} interaction={interaction} onClose={() => setLink(null)} />
        )}
      </>
    );
  }

  async function chooseCardOf(name: string): Promise<void> {
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ligar à ficha de…' }));
    await userEvent.click(screen.getByRole('menuitem', { name }));
  }

  it('the master has "Ligar à ficha de…" on a loose token, with one item per player', async () => {
    render(<Room tokenId={KAEL_ID} />);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ligar à ficha de…' }));
    const names = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(names).toEqual(expect.arrayContaining(['Bia', 'Caio']));
    expect(names).not.toContain('Ana');
    expect(screen.queryByRole('menuitem', { name: 'Desligar da ficha' })).toBeNull();
  });

  it('linking to the card of Caio, who has no character yet, sends it at once', async () => {
    render(<Room tokenId={KAEL_ID} />);
    await chooseCardOf('Caio');
    expect(commands.sentAs('linkTokenToCard')).toEqual([
      {
        name: 'linkTokenToCard',
        ...VHARN_GRID,
        fields: { tokenId: KAEL_ID, memberId: CAIO_AT_TABLE.userId },
      },
    ]);
  });

  it('linking to the card of Bia, who has Lyra, asks first and "Ligar" sends it', async () => {
    render(<Room tokenId={KAEL_ID} />);
    await chooseCardOf('Bia');
    const question = screen.getByRole('alertdialog', { name: 'Ligar à ficha de Bia?' });
    expect(question).toHaveTextContent(
      'Este token passa a usar as barras e condições de Lyra (ficha de Bia).',
    );
    expect(commands.sentAs('linkTokenToCard')).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Ligar' }));
    expect(commands.sentAs('linkTokenToCard').map(({ fields }) => fields)).toEqual([
      { tokenId: KAEL_ID, memberId: BIA_AT_TABLE.userId },
    ]);
  });

  it('"Cancelar" on the question sends nothing', async () => {
    render(<Room tokenId={KAEL_ID} />);
    await chooseCardOf('Bia');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(commands.sent).toEqual([]);
  });

  it('a linked token has "Desligar da ficha", which sends the unlink', async () => {
    render(<Room tokenId={LYRA_ID} />);
    expect(screen.queryByRole('menuitem', { name: 'Ligar à ficha de…' })).toBeNull();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Desligar da ficha' }));
    expect(commands.sentAs('unlinkTokenFromCard').map(({ fields }) => fields)).toEqual([
      { tokenId: LYRA_ID },
    ]);
  });

  it('CHARACTER_ALREADY_PLACED goes to the status line', async () => {
    commands.answerWith({ ok: false, failure: 'character_already_placed' });
    render(<Room tokenId={KAEL_ID} />);
    await chooseCardOf('Caio');
    await act(() => Promise.resolve());
    expect(interaction.getState().notice).toBe('Esse personagem já tem um token neste grid.');
  });

  it('a player has no character items', () => {
    interaction.getState().allowLayerChoice(false);
    render(<Room tokenId={KAEL_ID} />);
    expect(screen.queryByRole('menuitem', { name: 'Ligar à ficha de…' })).toBeNull();
  });

  describe('the token dialog', () => {
    function renderDialog(cardOwner: string | null): void {
      const lyraToken = board.getState().board?.tokens.find(({ id }) => id === LYRA_ID) ?? null;
      render(
        <TokenDialog
          scope={VHARN_GRID}
          token={lyraToken}
          placeAt={cell(0, 0)}
          layer="tokens"
          players={[]}
          commands={commands}
          assets={new AssetsApiFake()}
          distance={{ cellDistance: 1.5, cellUnit: 'm' }}
          connected
          cardOwner={cardOwner}
          onClose={() => undefined}
        />,
      );
    }

    it('marks the shared fields of a linked token "Na ficha de Bia · vale em todo grid"', async () => {
      renderDialog('Bia');
      expect(screen.getByText('Na ficha de Bia · vale em todo grid')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('tab', { name: /^Barras/ }));
      expect(screen.getByText('Na ficha de Bia · vale em todo grid')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('tab', { name: 'Visão e luz' }));
      expect(screen.queryByText('Na ficha de Bia · vale em todo grid')).toBeNull();
    });

    it('a loose token has no mark', () => {
      renderDialog(null);
      expect(screen.queryByText(/vale em todo grid/)).toBeNull();
    });
  });
});
