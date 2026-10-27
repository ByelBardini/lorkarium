import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { BoardToolbar } from '@/features/board/board-toolbar';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createAuraMotionStore, type AuraMotionStore } from '@/stores/aura-motion-store';
import { BoardRendererFake } from '../../support/board-renderer-fake';
import { StorageFake } from '../../support/storage-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { BIA_AT_TABLE, LYRA_ID, VHARN_GRID } from '../../support/table-session-fixtures';
import { cell } from '@lorkarium/game-core';
import { boardCommandFailureMessage } from '@/features/board/board-messages';
import { TableTokenKeysContext } from '@/features/board/table-token-rights';

describe('BoardToolbar', () => {
  let interaction: StoreApi<BoardInteractionStore>;
  let renderer: BoardRendererFake;
  let auraMotion: StoreApi<AuraMotionStore>;

  beforeEach(() => {
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands: new TableBoardCommandsFake(),
      describeRefusal: String,
    });
    renderer = new BoardRendererFake(() => undefined, 'resolve');
    auraMotion = createAuraMotionStore(new StorageFake());
  });

  function renderToolbar(canConfigure = true): void {
    render(
      <BoardToolbar
        interaction={interaction}
        renderer={renderer}
        role={canConfigure ? 'master' : 'player'}
        auraMotion={auraMotion}
        onConfigure={() => undefined}
        onNewToken={() => undefined}
      />,
    );
  }

  function tool(name: string): HTMLElement {
    return screen.getByRole('button', { name });
  }

  it('Selecionar is pressed at first and Régua is not', () => {
    renderToolbar();
    expect(tool('Selecionar (V)')).toHaveAttribute('aria-pressed', 'true');
    expect(tool('Régua (R)')).toHaveAttribute('aria-pressed', 'false');
  });

  it('Régua presses itself and hints on the status line', async () => {
    renderToolbar();
    await userEvent.click(tool('Régua (R)'));
    expect(tool('Régua (R)')).toHaveAttribute('aria-pressed', 'true');
    expect(interaction.getState().notice).toBe('Arraste para medir.');
  });

  it('Animar auras is pressed at first and turns the local aura motion off and on', async () => {
    renderToolbar(false);
    expect(tool('Animar auras')).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(tool('Animar auras'));
    expect(tool('Animar auras')).toHaveAttribute('aria-pressed', 'false');
    expect(auraMotion.getState().animated).toBe(false);

    await userEvent.click(tool('Animar auras'));
    expect(auraMotion.getState().animated).toBe(true);
  });

  it('Grid toggles the local grid only, and says so', async () => {
    renderToolbar();
    await userEvent.click(tool('Grid (G)'));
    expect(tool('Grid (G)')).toHaveAttribute('aria-pressed', 'false');
    expect(interaction.getState().localGridVisible).toBe(false);
  });

  it('Aproximar and Afastar ask the renderer, and the label follows the camera', async () => {
    renderToolbar();
    await userEvent.click(tool('Aproximar (+)'));
    await userEvent.click(tool('Afastar (−)'));
    expect(renderer.zooms).toEqual([1.25, 0.8]);
    act(() => interaction.getState().pointer({ kind: 'cameraChanged', zoom: 1.25 }));
    expect(screen.getByText('125%')).toBeInTheDocument();
  });

  it('Enquadrar cena asks the renderer to fit the scene', async () => {
    renderToolbar();
    await userEvent.click(tool('Enquadrar cena (0)'));
    expect(renderer.fits).toBe(1);
  });

  it('the master sees "Novo token" and "Configurar cena", and a player sees neither', () => {
    renderToolbar(false);
    expect(screen.queryByRole('button', { name: 'Configurar cena' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Novo token' })).toBeNull();
  });

  it('the master sees the "Camada" group with Tokens pressed, and choosing Objetos presses it', async () => {
    act(() => interaction.getState().allowLayerChoice(true));
    renderToolbar();
    expect(screen.getByRole('group', { name: 'Camada' })).not.toBeNull();
    expect(tool('Tokens (1)')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(tool('Objetos (2)'));
    expect(tool('Objetos (2)')).toHaveAttribute('aria-pressed', 'true');
    expect(tool('Tokens (1)')).toHaveAttribute('aria-pressed', 'false');
    expect(tool('Fundo (3)')).toHaveAttribute('aria-pressed', 'false');
  });

  it('a player sees no "Camada" group', () => {
    renderToolbar(false);
    expect(screen.queryByRole('group', { name: 'Camada' })).toBeNull();
  });

  it.each([
    ['master', true],
    ['player', false],
  ])(
    'the %s has "Condição (C)", which presses itself and asks for a condition',
    async (_, master) => {
      renderToolbar(master);
      expect(tool('Condição (C)')).toHaveAttribute('aria-pressed', 'false');
      await userEvent.click(tool('Condição (C)'));
      expect(tool('Condição (C)')).toHaveAttribute('aria-pressed', 'true');
      expect(interaction.getState().tool).toBe('conditions');
      expect(interaction.getState().notice).toBe('Escolha uma condição no painel.');
    },
  );

  it('a spectator picks only Selecionar and Régua, and keeps the local grid and the camera', () => {
    render(
      <BoardToolbar
        auraMotion={createAuraMotionStore(new StorageFake())}
        interaction={interaction}
        renderer={renderer}
        role="spectator"
        onConfigure={() => undefined}
        onNewToken={() => undefined}
      />,
    );
    const names = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'));
    expect(names).toEqual([
      'Selecionar (V)',
      'Régua (R)',
      'Grid (G)',
      'Animar auras',
      'Aproximar (+)',
      'Afastar (−)',
      'Enquadrar cena (0)',
    ]);
  });

  it('without a renderer yet, the zoom buttons are disabled', () => {
    render(
      <BoardToolbar
        auraMotion={createAuraMotionStore(new StorageFake())}
        interaction={interaction}
        renderer={null}
        role="player"
        onConfigure={() => undefined}
        onNewToken={() => undefined}
      />,
    );
    expect(tool('Aproximar (+)')).toBeDisabled();
    expect(tool('Enquadrar cena (0)')).toBeDisabled();
  });
});

describe('BoardToolbar, "Ver como os selecionados"', () => {
  function renderWith(canConfigure: boolean, sightOn: boolean) {
    const interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands: new TableBoardCommandsFake(),
      describeRefusal: String,
    });
    interaction.getState().allowLayerChoice(canConfigure);
    render(
      <BoardToolbar
        auraMotion={createAuraMotionStore(new StorageFake())}
        interaction={interaction}
        renderer={null}
        role={canConfigure ? 'master' : 'player'}
        sightOn={sightOn}
        onConfigure={() => undefined}
        onNewToken={() => undefined}
      />,
    );
    return interaction;
  }

  it('the master in a dark scene has the button, and pressing it turns the preview on', async () => {
    const interaction = renderWith(true, true);

    const button = screen.getByRole('button', { name: 'Ver como os selecionados' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button);

    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(interaction.getState().sightPreview).toBe(true);
  });

  it('with vision off, or for a player, there is no such button', () => {
    renderWith(true, false);
    expect(
      screen.queryByRole('button', { name: 'Ver como os selecionados' }),
    ).not.toBeInTheDocument();
  });
});

describe('BoardToolbar, "Adicionar jogadores"', () => {
  const DAVI = { userId: 'd4a7e1b2-3c5f-4e6a-8b9c-0d1e2f3a4b5c', name: 'Davi' };
  let commands: TableBoardCommandsFake;
  let interaction: StoreApi<BoardInteractionStore>;
  let renderer: BoardRendererFake;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: boardCommandFailureMessage,
    });
    renderer = new BoardRendererFake(() => undefined, 'resolve');
    renderer.centerCell = cell(10, 6);
  });

  function renderToolbar(canConfigure = true): void {
    render(
      <BoardToolbar
        auraMotion={createAuraMotionStore(new StorageFake())}
        interaction={interaction}
        renderer={renderer}
        role={canConfigure ? 'master' : 'player'}
        members={[BIA_AT_TABLE, DAVI]}
        onConfigure={() => undefined}
        onNewToken={() => undefined}
      />,
    );
  }

  const addPlayers = () => screen.getByRole('button', { name: 'Adicionar jogadores' });

  it('the master sends token:addPlayers with the cell at the center of the view', async () => {
    renderToolbar();
    await userEvent.click(addPlayers());
    expect(commands.sentAs('addPlayers')).toEqual([
      { name: 'addPlayers', ...VHARN_GRID, fields: { center: { col: 10, row: 6 } } },
    ]);
  });

  it('a player sees no "Adicionar jogadores"', () => {
    renderToolbar(false);
    expect(screen.queryByRole('button', { name: 'Adicionar jogadores' })).toBeNull();
  });

  it('a player skipped for having no token is named on the status line', async () => {
    commands.answerAddPlayersWith({
      ok: true,
      version: 5,
      createdIds: [LYRA_ID],
      skippedMemberIds: [DAVI.userId],
    });
    renderToolbar();
    await userEvent.click(addPlayers());
    expect(interaction.getState().notice).toBe('Davi ainda não tem token.');
  });

  it('NO_FREE_CELLS reads "Não há casas livres neste grid."', async () => {
    commands.answerWith({ ok: false, failure: 'no_free_cells' });
    renderToolbar();
    await userEvent.click(addPlayers());
    expect(interaction.getState().notice).toBe('Não há casas livres neste grid.');
  });

  it('with the middle of the view off the grid, nothing is sent and the line says why', async () => {
    renderer.centerCell = null;
    renderToolbar();
    await userEvent.click(addPlayers());
    expect(commands.sentAs('addPlayers')).toEqual([]);
    expect(interaction.getState().notice).toBe('Traga o grid para a vista primeiro.');
  });
});

describe('BoardToolbar, "Novo token" of a player', () => {
  function renderAs(
    role: 'player' | 'spectator',
    keys: Readonly<{ create: boolean; delete: boolean }>,
  ): void {
    render(
      <TableTokenKeysContext value={keys}>
        <BoardToolbar
          interaction={createBoardInteractionStore({
            scopeOf: () => VHARN_GRID,
            commands: new TableBoardCommandsFake(),
            describeRefusal: String,
          })}
          renderer={null}
          role={role}
          auraMotion={createAuraMotionStore(new StorageFake())}
          onConfigure={() => undefined}
          onNewToken={() => undefined}
        />
      </TableTokenKeysContext>,
    );
  }

  it('a player with the create key sees "Novo token", and still no "Configurar cena"', () => {
    renderAs('player', { create: true, delete: false });
    expect(screen.getByRole('button', { name: 'Novo token' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Configurar cena' })).toBeNull();
  });

  it('a player without the create key sees no "Novo token"', () => {
    renderAs('player', { create: false, delete: true });
    expect(screen.queryByRole('button', { name: 'Novo token' })).toBeNull();
  });

  it('a spectator with the create key sees no "Novo token"', () => {
    renderAs('spectator', { create: true, delete: true });
    expect(screen.queryByRole('button', { name: 'Novo token' })).toBeNull();
  });
});
