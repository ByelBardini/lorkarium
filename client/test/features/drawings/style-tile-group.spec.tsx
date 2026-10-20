import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StyleTileGroup, type StyleTile } from '@/features/drawings/style-tile-group';

const TILES: readonly StyleTile<'a' | 'b'>[] = [
  { value: 'a', label: 'Alfa', picture: <span>A</span> },
  { value: 'b', label: 'Beta', picture: <span>B</span> },
];

describe('StyleTileGroup', () => {
  it('names each picture tile by its label, also as the hover title, with the value checked', () => {
    render(
      <StyleTileGroup legend="Grupo" value="b" tiles={TILES} onChange={vi.fn()} shape="round" />,
    );

    expect(screen.getByRole('radiogroup', { name: 'Grupo' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Alfa' })).toHaveAttribute('title', 'Alfa');
  });

  it('legendHidden keeps the legend as the name of the group, only for screen readers', () => {
    render(
      <StyleTileGroup
        legend="Cor de PV"
        legendHidden
        value="a"
        tiles={TILES}
        onChange={vi.fn()}
        shape="round"
      />,
    );

    expect(screen.getByRole('radiogroup', { name: 'Cor de PV' })).toBeInTheDocument();
    expect(screen.getByText('Cor de PV')).toHaveClass('sr-only');
  });

  it('clicking a tile reports its value', async () => {
    const onChange = vi.fn();
    render(
      <StyleTileGroup legend="Grupo" value="a" tiles={TILES} onChange={onChange} shape="square" />,
    );

    await userEvent.setup().click(screen.getByRole('radio', { name: 'Beta' }));

    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('disabled turns every tile off and ties the hint to the group', () => {
    render(
      <StyleTileGroup
        legend="Grupo"
        value="a"
        tiles={TILES}
        onChange={vi.fn()}
        shape="round"
        disabled
        hint="Por quê"
      />,
    );

    expect(screen.getByRole('radio', { name: 'Beta' })).toBeDisabled();
    expect(screen.getByRole('radiogroup', { name: 'Grupo' })).toHaveAccessibleDescription(
      'Por quê',
    );
  });
});
