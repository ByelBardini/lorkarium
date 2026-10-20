import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { MAX_BARS_PER_TOKEN } from '@lorkarium/contracts';
import { BarsEditor } from '@/features/tokens/bars-editor';
import { addBar, type BarFormErrors, type BarFormValues } from '@/features/tokens/bar-form-state';

type HarnessProps = Readonly<{
  start?: readonly BarFormValues[];
  errors?: Readonly<Record<number, BarFormErrors>>;
}>;

function Harness({ start = [], errors }: HarnessProps): React.JSX.Element {
  const [bars, setBars] = useState(start);
  return (
    <>
      <BarsEditor bars={bars} errors={errors} onChange={setBars} />
      <output aria-label="Ordem">{bars.map(({ label }) => label).join(',')}</output>
    </>
  );
}

function rows(): HTMLElement[] {
  return within(screen.getByRole('region', { name: 'Barras' })).queryAllByRole('listitem');
}

function row(index: number): HTMLElement {
  const found = rows()[index];
  if (!found) throw new Error(`no bar row ${index}`);
  return found;
}

function barsOf(count: number): readonly BarFormValues[] {
  let bars: readonly BarFormValues[] = [];
  for (let index = 0; index < count; index += 1) bars = addBar(bars);
  return bars;
}

describe('BarsEditor, empty', () => {
  it('says "Sem barras ainda" and offers "+ PV", "+ Mana" and "+ Escudo"', () => {
    render(<Harness />);

    expect(screen.getByText('Sem barras ainda')).toBeInTheDocument();
    expect(screen.getByText('Começa pelo PV ou escolhe uma das sugestões.')).toBeInTheDocument();
    for (const name of ['+ PV', '+ Mana', '+ Escudo']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(rows()).toEqual([]);
  });
});

describe('BarsEditor, adding', () => {
  it('"Nova barra" adds the PV: "No token", Brasa, "Só mestre e quem controla", max 10', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Nova barra' }));

    const pv = row(0);
    expect(within(pv).getByText('No token')).toBeInTheDocument();
    expect(within(pv).getByRole('radio', { name: 'Brasa' })).toBeChecked();
    expect(
      within(pv).getByRole('button', {
        name: 'Quem vê os números de PV: Só mestre e quem controla',
      }),
    ).toBeInTheDocument();
    expect(within(pv).getByLabelText('Máximo de PV')).toHaveValue('10');
  });

  it('"+ Mana" adds Mana in Aço for everyone; the suggestion goes and "+ Fôlego" comes', async () => {
    render(<Harness start={barsOf(1)} />);

    await userEvent.click(screen.getByRole('button', { name: '+ Mana' }));

    const mana = row(1);
    expect(within(mana).getByLabelText('Rótulo da barra 2')).toHaveValue('Mana');
    expect(within(mana).getByRole('radio', { name: 'Aço' })).toBeChecked();
    expect(
      within(mana).getByRole('button', { name: 'Quem vê os números de Mana: Todos veem' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Mana' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Fôlego' })).toBeInTheDocument();
  });

  it(`with ${MAX_BARS_PER_TOKEN} bars, "Nova barra" and the suggestions go and it reads "8 de 8"`, () => {
    render(<Harness start={barsOf(MAX_BARS_PER_TOKEN)} />);

    expect(screen.queryByRole('button', { name: 'Nova barra' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^\+ / })).not.toBeInTheDocument();
    expect(screen.getByText(`${MAX_BARS_PER_TOKEN} de ${MAX_BARS_PER_TOKEN}`)).toBeInTheDocument();
  });

  it('the count reads "2 de 8" with two bars', () => {
    render(<Harness start={barsOf(2)} />);

    expect(screen.getByText(`2 de ${MAX_BARS_PER_TOKEN}`)).toBeInTheDocument();
  });
});

describe('BarsEditor, order', () => {
  it('↑ is disabled on the first and ↓ on the last', () => {
    render(<Harness start={barsOf(2)} />);

    expect(within(row(0)).getByRole('button', { name: 'Subir PV' })).toBeDisabled();
    expect(within(row(1)).getByRole('button', { name: 'Descer Barra 2' })).toBeDisabled();
  });

  it('↓ on the PV swaps them, and "No token" moves to the new first', async () => {
    render(<Harness start={barsOf(2)} />);

    await userEvent.click(within(row(0)).getByRole('button', { name: 'Descer PV' }));

    expect(screen.getByLabelText('Ordem')).toHaveTextContent('Barra 2,PV');
    expect(within(row(0)).getByText('No token')).toBeInTheDocument();
    expect(within(row(1)).queryByText('No token')).not.toBeInTheDocument();
  });

  it('"Remover PV" takes the row away', async () => {
    render(<Harness start={barsOf(2)} />);

    await userEvent.click(within(row(0)).getByRole('button', { name: 'Remover PV' }));

    expect(screen.getByLabelText('Ordem')).toHaveTextContent('Barra 2');
    expect(rows()).toHaveLength(1);
  });
});

describe('BarsEditor, look of a bar', () => {
  it('offers the five colors by name; picking Musgo checks it', async () => {
    render(<Harness start={barsOf(1)} />);
    const colors = within(within(row(0)).getByRole('radiogroup', { name: 'Cor de PV' }))
      .getAllByRole('radio')
      .map((swatch) => swatch.getAttribute('aria-label'));

    await userEvent.click(within(row(0)).getByRole('radio', { name: 'Musgo' }));

    expect(colors).toEqual(['Ouro', 'Aço', 'Brasa', 'Musgo', 'Cinza']);
    expect(within(row(0)).getByRole('radio', { name: 'Musgo' })).toBeChecked();
  });

  it('"Quem vê os números de PV" toggles to "Todos veem"', async () => {
    render(<Harness start={barsOf(1)} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Quem vê os números de PV: Só mestre e quem controla' }),
    );

    expect(
      screen.getByRole('button', { name: 'Quem vê os números de PV: Todos veem' }),
    ).toBeInTheDocument();
  });

  it('"Como PV aparece" toggles to percent, and the sample follows the max typed', async () => {
    render(<Harness start={barsOf(1)} />);
    const max = within(row(0)).getByLabelText('Máximo de PV');
    await userEvent.clear(max);
    await userEvent.type(max, '45');
    expect(within(row(0)).getByText('45 / 45')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Como PV aparece: Valor inteiro' }));

    expect(screen.getByRole('button', { name: 'Como PV aparece: Percentual' })).toBeInTheDocument();
    expect(within(row(0)).getByText('100%')).toBeInTheDocument();
  });

  it('the max takes only digits, and a max that cannot be read shows no sample', async () => {
    render(<Harness start={barsOf(1)} />);
    const max = within(row(0)).getByLabelText('Máximo de PV');

    await userEvent.clear(max);
    await userEvent.type(max, '4a');

    expect(max).toHaveValue('4');
    await userEvent.clear(max);
    expect(within(row(0)).queryByText(/ \/ /)).not.toBeInTheDocument();
  });
});

describe('BarsEditor, errors', () => {
  it('a max of "0" says "De 1 a 99 999." on its field', () => {
    render(<Harness start={barsOf(1)} errors={{ 0: { max: 'De 1 a 99 999.' } }} />);

    const max = within(row(0)).getByLabelText('Máximo de PV');
    expect(max).toHaveAttribute('aria-invalid', 'true');
    expect(max).toHaveAccessibleDescription('De 1 a 99 999.');
  });

  it('an empty label says "Dê um nome à barra." on its field', () => {
    render(<Harness start={barsOf(1)} errors={{ 0: { label: 'Dê um nome à barra.' } }} />);

    expect(within(row(0)).getByLabelText('Rótulo da barra 1')).toHaveAccessibleDescription(
      'Dê um nome à barra.',
    );
  });
});
