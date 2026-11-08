import type { HexColorDto } from '@lorkarium/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PaletteColorField } from '@/features/drawings/palette-color-field';
import type { StyleTile } from '@/features/drawings/style-tile-group';

type Fixed = 'gold' | 'steel';
type Choice = Fixed | HexColorDto;

const TILES: readonly StyleTile<Fixed>[] = [
  { value: 'gold', label: 'Ouro', picture: <span>O</span> },
  { value: 'steel', label: 'Aço', picture: <span>A</span> },
];

function field(
  value: Choice | null,
  onChange: (next: Choice) => void = vi.fn(),
): React.JSX.Element {
  return <PaletteColorField legend="Cor" value={value} tiles={TILES} onChange={onChange} />;
}

describe('PaletteColorField', () => {
  it('a palette value checks its radio and leaves the tile empty', () => {
    render(field('steel'));

    expect(screen.getByRole('radio', { name: 'Aço' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Cor personalizada' })).toBeInTheDocument();
  });

  it('a hex value checks no radio and marks the tile with its code', () => {
    render(field('#336699'));

    expect(screen.getByRole('radio', { name: 'Ouro' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Aço' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Cor personalizada: #336699' })).toBeInTheDocument();
  });

  it('a palette radio reports its name', async () => {
    const onChange = vi.fn();
    render(field('#336699', onChange));

    await userEvent.setup().click(screen.getByRole('radio', { name: 'Aço' }));

    expect(onChange).toHaveBeenCalledWith('steel');
  });

  it('a custom color reports its hex', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(field('gold', onChange));

    await user.click(screen.getByRole('button', { name: 'Cor personalizada' }));
    const code = await screen.findByLabelText('Código da cor');
    await user.clear(code);
    await user.type(code, '#336699');
    await user.click(screen.getByRole('button', { name: 'Usar cor' }));

    expect(onChange.mock.calls).toEqual([['#336699']]);
  });

  it('the arrows walk only the fixed colors and do not open the popover', async () => {
    const user = userEvent.setup();
    render(field('gold'));

    screen.getByRole('radio', { name: 'Ouro' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Aço' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('radio', { name: 'Ouro' })).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('disabled turns the tile off along with the radios', () => {
    render(
      <PaletteColorField legend="Cor" value="gold" tiles={TILES} onChange={vi.fn()} disabled />,
    );

    expect(screen.getByRole('radio', { name: 'Ouro' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cor personalizada' })).toBeDisabled();
  });

  it('customDisabled turns off the tile alone', () => {
    render(
      <PaletteColorField
        legend="Cor"
        value="gold"
        tiles={TILES}
        onChange={vi.fn()}
        customDisabled
      />,
    );

    expect(screen.getByRole('radio', { name: 'Ouro' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cor personalizada' })).toBeDisabled();
  });

  it('legibleOn reaches the panel of the tile', async () => {
    const user = userEvent.setup();
    render(
      <PaletteColorField
        legend="Cor"
        value="#101010"
        tiles={TILES}
        onChange={vi.fn()}
        legibleOn="#15181d"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cor personalizada: #101010' }));

    expect(await screen.findByText(/pouco contraste/i)).toBeInTheDocument();
  });
});
