import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DrawStylePanel } from '@/features/drawings/draw-style-panel';
import { createDrawingStyleStore } from '@/stores/drawing-style-store';
import { StorageFake } from '../../support/storage-fake';

function renderPanel(storage = new StorageFake()) {
  const store = createDrawingStyleStore(storage);
  render(<DrawStylePanel drawingStyle={store} />);
  return store;
}

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
