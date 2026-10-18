import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { BoardToolbar } from '@/features/board/board-toolbar';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { BoardRendererFake } from '../../support/board-renderer-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';

describe('BoardToolbar', () => {
  let interaction: StoreApi<BoardInteractionStore>;
  let renderer: BoardRendererFake;

  beforeEach(() => {
    interaction = createBoardInteractionStore({
      campaignId: VHARN.id,
      commands: new TableBoardCommandsFake(),
      describeRefusal: String,
    });
    renderer = new BoardRendererFake(() => undefined, 'resolve');
  });

  function renderToolbar(canConfigure = true): void {
    render(
      <BoardToolbar
        interaction={interaction}
        renderer={renderer}
        canConfigure={canConfigure}
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

  it('without a renderer yet, the zoom buttons are disabled', () => {
    render(
      <BoardToolbar
        interaction={interaction}
        renderer={null}
        canConfigure={false}
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
      campaignId: VHARN.id,
      commands: new TableBoardCommandsFake(),
      describeRefusal: String,
    });
    interaction.getState().allowLayerChoice(canConfigure);
    render(
      <BoardToolbar
        interaction={interaction}
        renderer={null}
        canConfigure={canConfigure}
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
