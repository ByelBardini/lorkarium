import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SizeField, type TokenSize } from '@/features/tokens/size-field';

function Harness({ initial }: Readonly<{ initial: TokenSize }>) {
  const [size, setSize] = useState(initial);
  return (
    <>
      <SizeField size={size} onChange={setSize} />
      <output aria-label="Tamanho escolhido">{`${size.width} × ${size.height}`}</output>
    </>
  );
}

describe('SizeField', () => {
  it('the five presets are Miúdo, Médio, Grande, Enorme and Imenso, in a group "Tamanho"', () => {
    render(<Harness initial={{ width: 1, height: 1 }} />);

    const group = screen.getByRole('group', { name: 'Tamanho' });
    for (const name of ['Miúdo', 'Médio', 'Grande', 'Enorme', 'Imenso']) {
      expect(group).toContainElement(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
    }
  });

  it('a 1 × 1 has "Médio" pressed; choosing "Grande" makes it 2 × 2 and presses it', async () => {
    render(<Harness initial={{ width: 1, height: 1 }} />);
    expect(screen.getByRole('button', { name: /^Médio/ })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: /^Grande/ }));

    expect(screen.getByRole('button', { name: /^Grande/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Médio/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Tamanho escolhido')).toHaveTextContent('2 × 2');
  });

  it('"Miúdo" is half a cell each way', async () => {
    render(<Harness initial={{ width: 2, height: 2 }} />);

    await userEvent.click(screen.getByRole('button', { name: /^Miúdo/ }));

    expect(screen.getByLabelText('Tamanho escolhido')).toHaveTextContent('0.5 × 0.5');
  });

  it('"Aumentar largura" of a 2 × 2 reads "2,5" and no preset stays pressed', async () => {
    render(<Harness initial={{ width: 2, height: 2 }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Aumentar largura' }));

    expect(screen.getByLabelText('Largura')).toHaveTextContent('2,5');
    expect(screen.getByLabelText('Tamanho escolhido')).toHaveTextContent('2.5 × 2');
    expect(screen.getByRole('button', { name: /^Grande/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('"Diminuir altura" takes half a cell from the height only', async () => {
    render(<Harness initial={{ width: 2, height: 2 }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Diminuir altura' }));

    expect(screen.getByLabelText('Tamanho escolhido')).toHaveTextContent('2 × 1.5');
  });

  it('"Aumentar largura" is disabled at 10 and "Diminuir altura" at 0,5', () => {
    render(<Harness initial={{ width: 10, height: 0.5 }} />);

    expect(screen.getByRole('button', { name: 'Aumentar largura' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Diminuir altura' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Diminuir largura' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Aumentar altura' })).toBeEnabled();
  });
});
