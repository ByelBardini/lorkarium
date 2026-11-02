import { cell } from '@lorkarium/game-core';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { boardCommandFailureMessage } from '@/features/board/board-messages';
import { TokenContextMenu } from '@/features/board/token-context-menu';
import { TokenDialog } from '@/features/tokens/token-dialog';
import { CharacterLinkDialog, type CharacterLinkRequest } from '@/features/tokens/token-link-items';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createCharactersStore, type CharactersStore } from '@/stores/characters-store';
import { AssetsApiFake } from '../../support/assets-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import {
  KAEL_CHARACTER_ID,
  charactersSynced,
  kaelCharacter,
  linkedLyra,
  lyraCharacter,
} from '../../support/character-fixtures';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  KAEL_ID,
  LYRA_ID,
  kael,
  vharnBoard,
  VHARN_GRID,
} from '../../support/table-session-fixtures';

const GOBLIN_ID = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';

describe('the character on a token', () => {
  let board: StoreApi<BoardStore>;
  let characters: StoreApi<CharactersStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;

  beforeEach(() => {
    characters = createCharactersStore(VHARN.id, () => undefined);
    const orphan = lyraCharacter({ id: GOBLIN_ID, userId: null, name: 'Duda de antes' });
    characters.getState().apply(charactersSynced(3, lyraCharacter(), kaelCharacter(), orphan));
    board = createBoardStore(VHARN.id, () => undefined);
    const tokens = [kael(), linkedLyra({ col: 8 })];
    board.getState().apply({ kind: 'board', state: vharnBoard({ tokens }) });
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: boardCommandFailureMessage,
    });
    interaction.getState().allowLayerChoice(true);
  });

  // The room's part: the menu, and the confirmation it asks for once it closed.
  function Room({ tokenId }: Readonly<{ tokenId: string }>) {
    const [menu, setMenu] = useState(true);
    const [link, setLink] = useState<CharacterLinkRequest | null>(null);
    return (
      <>
        {menu && (
          <TokenContextMenu
            request={{ tokenId, x: 10, y: 10 }}
            board={board}
            interaction={interaction}
            onApplyCondition={() => undefined}
            onChangeImage={() => undefined}
            onChangeAura={() => undefined}
            characters={{ store: characters, onConfirmLink: setLink }}
            onClose={() => setMenu(false)}
          />
        )}
        {link && (
          <CharacterLinkDialog
            request={link}
            interaction={interaction}
            onClose={() => setLink(null)}
          />
        )}
      </>
    );
  }

  async function chooseCharacter(name: string): Promise<void> {
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ligar a personagem…' }));
    await userEvent.click(screen.getByRole('menuitem', { name }));
  }

  it('the master has "Ligar a personagem…" on a free token, one item per character of the table', async () => {
    render(<Room tokenId={KAEL_ID} />);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ligar a personagem…' }));
    expect(screen.getByRole('menuitem', { name: 'Kael' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Duda de antes' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Desligar do personagem' })).toBeNull();
  });

  it('a character already placed in this grid is there, disabled', async () => {
    render(<Room tokenId={KAEL_ID} />);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ligar a personagem…' }));
    expect(screen.getByRole('menuitem', { name: 'Lyra' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: 'Kael' })).not.toHaveAttribute('aria-disabled');
  });

  it('picking Kael asks first, and "Ligar" sends token:linkToCharacter with his character', async () => {
    render(<Room tokenId={KAEL_ID} />);
    await chooseCharacter('Kael');
    const question = screen.getByRole('alertdialog', { name: 'Ligar a Kael?' });
    expect(question).toHaveTextContent('Este token passa a usar as barras e condições de Kael.');
    expect(commands.sentAs('linkTokenToCharacter')).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Ligar' }));
    expect(commands.sentAs('linkTokenToCharacter')).toEqual([
      {
        name: 'linkTokenToCharacter',
        ...VHARN_GRID,
        fields: { tokenId: KAEL_ID, characterId: KAEL_CHARACTER_ID },
      },
    ]);
  });

  it('"Cancelar" on the question sends nothing', async () => {
    render(<Room tokenId={KAEL_ID} />);
    await chooseCharacter('Kael');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(commands.sent).toEqual([]);
  });

  it('a linked token has "Desligar do personagem", which sends the unlink', async () => {
    render(<Room tokenId={LYRA_ID} />);
    expect(screen.queryByRole('menuitem', { name: 'Ligar a personagem…' })).toBeNull();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Desligar do personagem' }));
    expect(commands.sentAs('unlinkTokenFromCharacter').map(({ fields }) => fields)).toEqual([
      { tokenId: LYRA_ID },
    ]);
  });

  it('CHARACTER_ALREADY_PLACED goes to the status line', async () => {
    commands.answerWith({ ok: false, failure: 'character_already_placed' });
    render(<Room tokenId={KAEL_ID} />);
    await chooseCharacter('Kael');
    await userEvent.click(screen.getByRole('button', { name: 'Ligar' }));
    await act(() => Promise.resolve());
    expect(interaction.getState().notice).toBe('Esse personagem já tem um token neste grid.');
  });

  it('a table without characters leaves "Ligar a personagem…" disabled', () => {
    characters.getState().apply(charactersSynced(4));
    render(<Room tokenId={KAEL_ID} />);
    expect(screen.getByRole('menuitem', { name: 'Ligar a personagem…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('a player has no character items', () => {
    interaction.getState().allowLayerChoice(false);
    render(<Room tokenId={KAEL_ID} />);
    expect(screen.queryByRole('menuitem', { name: 'Ligar a personagem…' })).toBeNull();
  });

  describe('the token dialog', () => {
    function renderDialog(characterName: string | null): void {
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
          characterName={characterName}
          onClose={() => undefined}
        />,
      );
    }

    it('marks the shared fields of a linked token "No personagem Lyra · vale em todo grid"', async () => {
      renderDialog('Lyra');
      expect(screen.getByText('No personagem Lyra · vale em todo grid')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('tab', { name: /^Barras/ }));
      expect(screen.getByText('No personagem Lyra · vale em todo grid')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('tab', { name: 'Visão e luz' }));
      expect(screen.queryByText('No personagem Lyra · vale em todo grid')).toBeNull();
    });

    it('a free token has no mark', () => {
      renderDialog(null);
      expect(screen.queryByText(/vale em todo grid/)).toBeNull();
    });
  });
});
