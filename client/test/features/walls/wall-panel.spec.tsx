import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WallPanel } from '@/features/walls/wall-panel';
import { createWallStyleStore, wallStyleOf } from '@/stores/wall-style-store';
import { StorageFake } from '../../support/storage-fake';
import type { WallMode } from '@/stores/board-tool-state';

const modes: string[] = [];

function renderPanel(onKind?: (kind: string) => void, mode: WallMode = 'draw') {
  const store = createWallStyleStore(new StorageFake());
  render(
    <WallPanel wallStyle={store} onKind={onKind} mode={mode} onMode={(next) => modes.push(next)} />,
  );
  return store;
}

function namesIn(group: string): string[] {
  const radios = within(screen.getByRole('radiogroup', { name: group })).getAllByRole('radio');
  return radios.map((radio) => radio.getAttribute('aria-label') ?? '');
}

describe('WallPanel', () => {
  it('"Estilo da parede" offers the four kinds and the four shapes by name', () => {
    renderPanel();

    expect(screen.getByRole('region', { name: 'Estilo da parede' })).toBeInTheDocument();
    expect(namesIn('Tipo')).toEqual(['Parede', 'Grade', 'Cortina', 'Porta']);
    expect(namesIn('Forma')).toEqual(['Reta', 'Mão livre', 'Quadrado', 'Círculo']);
  });

  it('picking a kind and a shape changes the style of the next wall', async () => {
    const store = renderPanel();

    await userEvent.click(screen.getByRole('radio', { name: 'Grade' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Quadrado' }));

    expect(wallStyleOf(store.getState())).toEqual({ kind: 'grate', shape: 'rectangle' });
  });

  it('with Porta, the shapes other than Reta are disabled with the hint "Porta é sempre reta."', async () => {
    renderPanel();

    await userEvent.click(screen.getByRole('radio', { name: 'Porta' }));

    expect(screen.getByRole('radio', { name: 'Reta' })).toBeEnabled();
    for (const shape of ['Mão livre', 'Quadrado', 'Círculo']) {
      expect(screen.getByRole('radio', { name: shape })).toBeDisabled();
    }
    expect(screen.getByText('Porta é sempre reta.')).toBeInTheDocument();
  });

  it('with walls selected, a kind goes to them through onKind and the style stays', async () => {
    const onKind = vi.fn();
    const store = renderPanel(onKind);

    await userEvent.click(screen.getByRole('radio', { name: 'Cortina' }));

    expect(onKind).toHaveBeenCalledWith('curtain');
    expect(store.getState().kind).toBe('wall');
  });
});

describe('WallPanel actions', () => {
  it('"Ação" offers Desenhar, Selecionar, Apagar parede and Apagar trecho, and a pick is reported', async () => {
    renderPanel();

    expect(namesIn('Ação')).toEqual(['Desenhar', 'Apagar área', 'Apagar parede', 'Apagar trecho']);
    await userEvent.click(screen.getByRole('radio', { name: 'Apagar trecho' }));

    expect(modes.at(-1)).toBe('eraseSegment');
  });

  it('while erasing there is no kind nor shape to choose', () => {
    renderPanel(undefined, 'eraseArea');

    expect(screen.queryByRole('radiogroup', { name: 'Tipo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Forma' })).not.toBeInTheDocument();
  });
});
