import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SavedColorGrid } from '@/components/color-picker/saved-color-grid';

describe('SavedColorGrid', () => {
  it('names each color by its hex, in the order received', () => {
    render(<SavedColorGrid colors={['#112233', '#445566']} onPick={vi.fn()} onRemove={vi.fn()} />);

    const swatches = screen.getAllByRole('button', { name: /^#/ });
    expect(swatches.map((swatch) => swatch.getAttribute('title'))).toEqual(['#112233', '#445566']);
  });

  it('a click on a color picks only that color', async () => {
    const onPick = vi.fn();
    const onRemove = vi.fn();
    render(<SavedColorGrid colors={['#112233', '#445566']} onPick={onPick} onRemove={onRemove} />);

    await userEvent.setup().click(screen.getByRole('button', { name: '#445566' }));

    expect(onPick.mock.calls).toEqual([['#445566']]);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('a click on the "x" removes only that color', async () => {
    const onPick = vi.fn();
    const onRemove = vi.fn();
    render(<SavedColorGrid colors={['#112233', '#445566']} onPick={onPick} onRemove={onRemove} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Excluir #112233' }));

    expect(onRemove.mock.calls).toEqual([['#112233']]);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('an empty list says so and draws no color', () => {
    render(<SavedColorGrid colors={[]} onPick={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByText('Nenhuma cor salva ainda.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
