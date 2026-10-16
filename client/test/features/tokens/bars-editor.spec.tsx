import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { BarsEditor } from '@/features/tokens/bars-editor';
import {
  addBar,
  emptyTokenForm,
  parseTokenForm,
  type TokenFormErrors,
  type TokenFormValues,
} from '@/features/tokens/token-form-state';

function Harness({ start }: Readonly<{ start: TokenFormValues }>): React.JSX.Element {
  const [form, setForm] = useState(start);
  const [errors, setErrors] = useState<TokenFormErrors>({});
  return (
    <>
      <BarsEditor form={form} errors={errors.bars} onChange={setForm} />
      <button
        type="button"
        onClick={() => {
          const result = parseTokenForm({ ...form, name: 'Kael' });
          setErrors(result.ok ? {} : result.errors);
        }}
      >
        Validar
      </button>
      <output aria-label="Ordem">{form.bars.map(({ label }) => label).join(',')}</output>
    </>
  );
}

function bars(): HTMLElement[] {
  return within(screen.getByRole('region', { name: 'Barras' })).getAllByRole('listitem');
}

describe('BarsEditor', () => {
  it('"Adicionar barra" creates the PV first, ember and hidden, with the hint about the token', async () => {
    render(<Harness start={emptyTokenForm()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar barra' }));
    const [pv] = bars();
    if (!pv) throw new Error('no bar row');
    expect(within(pv).getByLabelText('Rótulo')).toHaveValue('PV');
    expect(within(pv).getByRole('radio', { name: 'Brasa' })).toBeChecked();
    expect(within(pv).getByRole('radio', { name: 'Só mestre e quem controla' })).toBeChecked();
    expect(screen.getByText('A primeira barra aparece no token.')).toBeInTheDocument();
  });

  it('offers the five colors by name', async () => {
    render(<Harness start={addBar(emptyTokenForm())} />);
    const [pv] = bars();
    if (!pv) throw new Error('no bar row');
    const names = within(pv).getByRole('group', { name: 'Cor de PV' }).querySelectorAll('label');
    expect([...names].map((label) => label.textContent)).toEqual([
      'Ouro',
      'Aço',
      'Brasa',
      'Musgo',
      'Cinza',
    ]);
  });

  it('↑ and ↓ reorder the bars', async () => {
    render(<Harness start={addBar(addBar(emptyTokenForm()))} />);
    await userEvent.click(screen.getByRole('button', { name: 'Subir Barra 2' }));
    expect(screen.getByRole('status', { name: 'Ordem' })).toHaveTextContent('Barra 2,PV');
  });

  it('with 8 bars "Adicionar barra" is disabled and says the maximum', () => {
    let full = emptyTokenForm();
    for (let index = 0; index < 8; index += 1) full = addBar(full);
    render(<Harness start={full} />);
    expect(screen.getByRole('button', { name: 'Adicionar barra' })).toBeDisabled();
    expect(screen.getByText('Máximo de 8 barras.')).toBeInTheDocument();
  });

  it('a negative current value is accepted', async () => {
    render(<Harness start={addBar(emptyTokenForm())} />);
    const [pv] = bars();
    if (!pv) throw new Error('no bar row');
    await userEvent.clear(within(pv).getByLabelText('Atual'));
    await userEvent.type(within(pv).getByLabelText('Atual'), '-4');
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }));
    expect(within(pv).getByLabelText('Atual')).not.toHaveAttribute('aria-invalid');
  });

  it('a maximum of 0 and an empty label say what is wrong on that bar', async () => {
    render(<Harness start={addBar(emptyTokenForm())} />);
    const [pv] = bars();
    if (!pv) throw new Error('no bar row');
    await userEvent.clear(within(pv).getByLabelText('Rótulo'));
    await userEvent.clear(within(pv).getByLabelText('Máximo'));
    await userEvent.type(within(pv).getByLabelText('Máximo'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }));
    expect(within(pv).getByLabelText('Máximo')).toHaveAccessibleDescription(
      'O máximo vai de 1 a 99 999.',
    );
    expect(within(pv).getByLabelText('Rótulo')).toHaveAccessibleDescription('Dê um nome à barra.');
  });
});
