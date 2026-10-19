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

const METERS = { cellDistance: 1.5, cellUnit: 'm' };

function Harness({ start }: Readonly<{ start: TokenFormValues }>): React.JSX.Element {
  const [form, setForm] = useState(start);
  const [errors, setErrors] = useState<TokenFormErrors>({});
  return (
    <>
      <BarsEditor form={form} errors={errors.bars} onChange={setForm} />
      <button
        type="button"
        onClick={() => {
          const result = parseTokenForm({ ...form, name: 'Kael' }, METERS);
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

  it('offers the five colors as swatches named by their color', () => {
    render(<Harness start={addBar(emptyTokenForm())} />);
    const [pv] = bars();
    if (!pv) throw new Error('no bar row');
    const colors = within(within(pv).getByRole('group', { name: 'Cor de PV' })).getAllByRole(
      'radio',
    );
    expect(colors.map((swatch) => swatch.getAttribute('aria-label'))).toEqual([
      'Ouro',
      'Aço',
      'Brasa',
      'Musgo',
      'Cinza',
    ]);
  });

  it('picking a swatch checks that color', async () => {
    render(<Harness start={addBar(emptyTokenForm())} />);
    const [pv] = bars();
    if (!pv) throw new Error('no bar row');
    await userEvent.click(within(pv).getByRole('radio', { name: 'Musgo' }));
    expect(within(pv).getByRole('radio', { name: 'Musgo' })).toBeChecked();
    expect(within(pv).getByRole('radio', { name: 'Brasa' })).not.toBeChecked();
  });

  it('the values are not typed here: no Atual and no Máximo field', () => {
    render(<Harness start={addBar(emptyTokenForm())} />);
    const [pv] = bars();
    if (!pv) throw new Error('no bar row');
    expect(within(pv).queryByLabelText('Atual')).not.toBeInTheDocument();
    expect(within(pv).queryByLabelText('Máximo')).not.toBeInTheDocument();
  });

  it('a bar starts as "Valor inteiro" and may switch to "Percentual"', async () => {
    render(<Harness start={addBar(emptyTokenForm())} />);
    const [pv] = bars();
    if (!pv) throw new Error('no bar row');
    const display = within(within(pv).getByRole('group', { name: 'Como PV aparece' }));
    expect(display.getByRole('radio', { name: 'Valor inteiro' })).toBeChecked();
    await userEvent.click(display.getByRole('radio', { name: 'Percentual' }));
    expect(display.getByRole('radio', { name: 'Percentual' })).toBeChecked();
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

  it('an empty label says what is wrong on that bar', async () => {
    render(<Harness start={addBar(emptyTokenForm())} />);
    const [pv] = bars();
    if (!pv) throw new Error('no bar row');
    await userEvent.clear(within(pv).getByLabelText('Rótulo'));
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }));
    expect(within(pv).getByLabelText('Rótulo')).toHaveAccessibleDescription('Dê um nome à barra.');
  });
});
