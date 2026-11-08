import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DrawStylePanel } from '@/features/drawings/draw-style-panel';
import type { DrawMode } from '@/stores/board-tool-state';
import { createDrawingStyleStore } from '@/stores/drawing-style-store';
import { pickCustomColor } from '../../support/pick-custom-color';
import { StorageFake } from '../../support/storage-fake';

function renderPanel(
  storage = new StorageFake(),
  mode: DrawMode = 'draw',
  onMode: (mode: DrawMode) => void = () => undefined,
) {
  const store = createDrawingStyleStore(storage);
  render(<DrawStylePanel drawingStyle={store} mode={mode} onMode={onMode} />);
  return store;
}

describe('DrawStylePanel, the action', () => {
  it('shows Desenhar and Selecionar with the current mode checked', () => {
    renderPanel(new StorageFake(), 'select');

    const action = within(screen.getByRole('radiogroup', { name: 'Ação' }));
    expect(action.getByRole('radio', { name: 'Selecionar' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(action.getByRole('radio', { name: 'Desenhar' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('picking Selecionar reports the mode', async () => {
    const user = userEvent.setup();
    const modes: DrawMode[] = [];
    renderPanel(new StorageFake(), 'draw', (mode) => modes.push(mode));

    await user.click(screen.getByRole('radio', { name: 'Selecionar' }));

    expect(modes).toEqual(['select']);
  });

  it('in Selecionar the style of the next drawing is hidden: nothing is drawn', () => {
    renderPanel(new StorageFake(), 'select');

    expect(screen.queryByRole('radiogroup', { name: 'Forma' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Cor do traço' })).not.toBeInTheDocument();
  });
});

describe('DrawStylePanel, the custom color', () => {
  function colorTile(legend: string): HTMLElement {
    const group = within(screen.getByRole('radiogroup', { name: legend }));
    return group.getByRole('button', { name: /^Cor personalizada/ });
  }

  it('a hex on the stroke goes to the style and marks the tile, with no swatch checked', async () => {
    const store = renderPanel();

    await pickCustomColor(colorTile('Cor do traço'), '#336699');

    expect(store.getState().stroke).toBe('#336699');
    expect(colorTile('Cor do traço')).toHaveAccessibleName('Cor personalizada: #336699');
    const stroke = within(screen.getByRole('radiogroup', { name: 'Cor do traço' }));
    for (const radio of stroke.getAllByRole('radio')) expect(radio).not.toBeChecked();
  });

  it('a hex on the fill goes to the style, and "Nenhum" still takes it away', async () => {
    const user = userEvent.setup();
    const store = renderPanel();
    await user.click(screen.getByRole('radio', { name: 'Quadrado' }));

    await pickCustomColor(colorTile('Preenchimento'), '#aabbcc');
    expect(store.getState().fill).toBe('#aabbcc');

    await user.click(screen.getByRole('radio', { name: 'Nenhum' }));
    expect(store.getState().fill).toBeNull();
    expect(colorTile('Preenchimento')).toHaveAccessibleName('Cor personalizada');
  });

  it('with freehand only the tile of the fill is off: the stroke keeps its own', () => {
    renderPanel();

    expect(colorTile('Preenchimento')).toBeDisabled();
    expect(colorTile('Cor do traço')).toBeEnabled();
  });
});

describe('DrawStylePanel', () => {
  it('shows shape, stroke color, fill and line width as radio groups with the current choice checked', () => {
    renderPanel();

    expect(screen.getByRole('region', { name: 'Estilo do desenho' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Mão livre' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radiogroup', { name: 'Cor do traço' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Preenchimento' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Média' })).toHaveAttribute('aria-checked', 'true');
  });

  it('picking a shape, a color, a fill and a width changes the style', async () => {
    const user = userEvent.setup();
    const store = renderPanel();

    await user.click(screen.getByRole('radio', { name: 'Círculo' }));
    const stroke = within(screen.getByRole('radiogroup', { name: 'Cor do traço' }));
    await user.click(stroke.getByRole('radio', { name: 'Violeta' }));
    await user.click(screen.getByRole('radio', { name: 'Grossa' }));
    await user.click(screen.getByRole('radio', { name: 'Círculo' }));
    const fill = within(screen.getByRole('radiogroup', { name: 'Preenchimento' }));
    await user.click(fill.getByRole('radio', { name: 'Musgo' }));

    expect(store.getState()).toMatchObject({
      kind: 'ellipse',
      stroke: 'violet',
      fill: 'moss',
      strokeWidth: 'thick',
    });
  });

  it('with freehand the fill is disabled and says only fixed shapes are filled', () => {
    renderPanel();

    const none = screen.getByRole('radio', { name: 'Nenhum' });
    expect(none).toBeDisabled();
    expect(screen.getByText('Só formas fixas têm preenchimento.')).toBeInTheDocument();
  });

  it('with a fixed shape the fill can be chosen', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('radio', { name: 'Quadrado' }));

    expect(screen.getByRole('radio', { name: 'Nenhum' })).toBeEnabled();
    expect(screen.queryByText('Só formas fixas têm preenchimento.')).not.toBeInTheDocument();
  });

  it('the style comes back from the storage when the panel mounts again', async () => {
    const user = userEvent.setup();
    const storage = new StorageFake();
    renderPanel(storage);
    await user.click(screen.getByRole('radio', { name: 'Triângulo' }));

    document.body.innerHTML = '';
    renderPanel(storage);

    expect(screen.getByRole('radio', { name: 'Triângulo' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
