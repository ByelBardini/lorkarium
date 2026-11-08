import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EffectAreaPanel } from '@/features/effect-areas/effect-area-panel';
import { createEffectAreaStyleStore } from '@/stores/effect-area-style-store';
import { pickCustomColor } from '../../support/pick-custom-color';
import { StorageFake } from '../../support/storage-fake';

function renderPanel() {
  const store = createEffectAreaStyleStore(new StorageFake());
  render(<EffectAreaPanel effectAreaStyle={store} />);
  return store;
}

describe('EffectAreaPanel', () => {
  it('"Estilo da área" offers the 9 shapes by name and the 8 colors', () => {
    renderPanel();

    const panel = screen.getByRole('region', { name: 'Estilo da área' });
    const shapes = within(within(panel).getByRole('radiogroup', { name: 'Forma' })).getAllByRole(
      'radio',
    );
    expect(shapes.map((radio) => radio.getAttribute('aria-label') ?? radio.textContent)).toEqual([
      'Quadrado',
      'Círculo',
      'Semicírculo',
      'Cone horizontal',
      'Cone diagonal',
      'Linha',
      'Emanação',
      'Círculo perfeito',
      'Semicírculo perfeito',
    ]);
    expect(within(panel).getByRole('radiogroup', { name: 'Cor' })).toBeInTheDocument();
    expect(
      within(within(panel).getByRole('radiogroup', { name: 'Cor' })).getAllByRole('radio'),
    ).toHaveLength(8);
  });

  it('the stored shape and color start checked', () => {
    renderPanel();

    expect(screen.getByRole('radio', { name: 'Círculo' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Brasa' })).toBeChecked();
  });

  it('picking a shape and a color changes the style', async () => {
    const store = renderPanel();

    await userEvent.click(screen.getByRole('radio', { name: 'Cone diagonal' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Musgo' }));

    expect(store.getState()).toMatchObject({ kind: 'diagonal_cone', color: 'moss' });
  });

  it('a hex goes to the style and marks the tile, with no swatch checked', async () => {
    const store = renderPanel();
    const colors = within(screen.getByRole('radiogroup', { name: 'Cor' }));

    await pickCustomColor(colors.getByRole('button', { name: 'Cor personalizada' }), '#336699');

    expect(store.getState().color).toBe('#336699');
    expect(colors.getByRole('button', { name: 'Cor personalizada: #336699' })).toBeInTheDocument();
    for (const radio of colors.getAllByRole('radio')) expect(radio).not.toBeChecked();
  });
});
