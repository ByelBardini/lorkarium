import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CustomColorPanel } from '@/components/color-picker/custom-color-panel';
import { SavedColorsProvider } from '@/components/color-picker/saved-colors-context';
import { SavedColorsApiFake } from '../../support/saved-colors-api-fake';

describe('CustomColorPanel on its own, inside a popover someone else owns', () => {
  it.each([null, undefined, 'gold'])('a value of %s starts on the accent color', (value) => {
    render(<CustomColorPanel value={value} onPick={vi.fn()} />);

    expect(screen.getByLabelText('Código da cor')).toHaveValue('#c5a46d');
  });

  it('a hex value starts the preview on it', () => {
    render(<CustomColorPanel value="#336699" onPick={vi.fn()} />);

    expect(screen.getByLabelText('Código da cor')).toHaveValue('#336699');
  });

  it('"Usar cor" reports the color and leaves closing to the owner', async () => {
    const onPick = vi.fn();
    render(<CustomColorPanel value="#336699" onPick={onPick} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Usar cor' }));

    expect(onPick.mock.calls).toEqual([['#336699']]);
    expect(screen.getByLabelText('Código da cor')).toBeInTheDocument();
  });

  it('outside a provider it opens with nothing saved', () => {
    render(<CustomColorPanel value={null} onPick={vi.fn()} />);

    expect(screen.getByText('Nenhuma cor salva ainda.')).toBeInTheDocument();
  });

  it('a saved color reports itself to the owner', async () => {
    const api = new SavedColorsApiFake();
    api.colors = ['#112233'];
    const onPick = vi.fn();
    render(
      <SavedColorsProvider api={api} userId="bia">
        <CustomColorPanel value={null} onPick={onPick} />
      </SavedColorsProvider>,
    );

    await userEvent.setup().click(await screen.findByRole('button', { name: '#112233' }));

    expect(onPick.mock.calls).toEqual([['#112233']]);
  });
});
