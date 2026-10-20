import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { TokenBasicsTab } from '@/features/tokens/token-basics-tab';
import {
  emptyTokenForm,
  tokenFormOf,
  type TokenFormValues,
  type TokenPlayer,
} from '@/features/tokens/token-form-state';
import { BIA_AT_TABLE, CAIO_AT_TABLE, lyra } from '../../support/table-session-fixtures';

const METERS = { cellDistance: 1.5, cellUnit: 'm' };
const PLAYERS: readonly TokenPlayer[] = [BIA_AT_TABLE, CAIO_AT_TABLE].map(({ userId, name }) => ({
  userId,
  name,
}));

function Harness({ initial }: Readonly<{ initial?: TokenFormValues }>) {
  const [form, setForm] = useState(initial ?? emptyTokenForm(METERS));
  return (
    <>
      <TokenBasicsTab form={form} errors={{}} players={PLAYERS} onChange={setForm} />
      <output aria-label="Tamanho escolhido">{`${form.width} × ${form.height}`}</output>
      <output aria-label="Quem controla agora">{form.controllerIds.join(',')}</output>
    </>
  );
}

describe('TokenBasicsTab, the initials', () => {
  it('follow the name and read "auto" while they do', async () => {
    render(<Harness />);

    await userEvent.type(screen.getByLabelText('Nome'), 'Ogro das Cinzas');

    expect(screen.getByLabelText('Iniciais')).toHaveValue('OC');
    expect(screen.getByText('auto')).toBeInTheDocument();
  });

  it('typed by hand offer "Voltar às iniciais automáticas", which puts the name\'s back', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText('Nome'), 'Ogro das Cinzas');
    await userEvent.clear(screen.getByLabelText('Iniciais'));
    await userEvent.type(screen.getByLabelText('Iniciais'), 'og');
    expect(screen.queryByText('auto')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Voltar às iniciais automáticas' }));

    expect(screen.getByLabelText('Iniciais')).toHaveValue('OC');
    expect(screen.getByText('auto')).toBeInTheDocument();
  });
});

describe('TokenBasicsTab, the side', () => {
  it('is a radiogroup "Lado" of Aliado, Inimigo and Neutro; choosing Inimigo checks it', async () => {
    render(<Harness />);
    const side = screen.getByRole('radiogroup', { name: 'Lado' });

    await userEvent.click(screen.getByRole('radio', { name: 'Inimigo' }));

    expect(side).toContainElement(screen.getByRole('radio', { name: 'Aliado' }));
    expect(screen.getByRole('radio', { name: 'Neutro' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Inimigo' })).toHaveAttribute('aria-checked', 'true');
  });

  it('the three sides share the whole line', () => {
    render(<Harness />);

    for (const name of ['Aliado', 'Inimigo', 'Neutro']) {
      expect(screen.getByRole('radio', { name })).toHaveClass('flex-1');
    }
  });
});

describe('TokenBasicsTab, the size', () => {
  it('a new token starts at "Médio", 1 × 1', () => {
    render(<Harness />);

    expect(screen.getByRole('group', { name: 'Tamanho' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Médio/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('choosing "Grande" makes the form 2 × 2', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: /^Grande/ }));

    expect(screen.getByLabelText('Tamanho escolhido')).toHaveTextContent('2 × 2');
  });
});

describe('TokenBasicsTab, who controls', () => {
  it("a new token has nobody pressed: the master's", () => {
    render(<Harness />);

    expect(screen.getByRole('button', { name: 'Bia' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Quem controla agora')).toBeEmptyDOMElement();
  });

  it('pressing Bia puts her among who controls', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Bia' }));

    expect(screen.getByLabelText('Quem controla agora')).toHaveTextContent(BIA_AT_TABLE.userId);
  });

  it('editing Lyra of Bia opens with Bia pressed', () => {
    render(<Harness initial={tokenFormOf(lyra(), METERS)} />);

    expect(screen.getByRole('button', { name: 'Bia' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Caio' })).toHaveAttribute('aria-pressed', 'false');
  });
});
