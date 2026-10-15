import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';

const NEW_CAMPAIGN = { ...VHARN, id: '0f1e2d3c-4b5a-4968-8776-655443322110', name: 'Mesa Nova' };

describe('CreateCampaignDialog', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
  });

  async function openDialog(): Promise<HTMLElement> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Nova mesa' }));
    return screen.findByRole('dialog', { name: 'Nova mesa' });
  }

  async function submit(dialog: HTMLElement): Promise<void> {
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar mesa' }));
  }

  it('an empty name is refused with a message, aria-invalid and focus on the field', async () => {
    const dialog = await openDialog();
    await submit(dialog);
    const name = within(dialog).getByLabelText('Nome da mesa');
    expect(within(dialog).getByText('Informe o nome da mesa.')).toBeInTheDocument();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveFocus();
    expect(deps.campaignsApi.callsOf('create')).toEqual([]);
  });

  it('a name of 81 characters is refused citing the limit of 80', async () => {
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText('Nome da mesa'), 'a'.repeat(81));
    await submit(dialog);
    expect(
      within(dialog).getByText('O nome pode ter no máximo 80 caracteres.'),
    ).toBeInTheDocument();
  });

  it('"Privada" comes checked and the password is optional with show/hide', async () => {
    const dialog = await openDialog();
    expect(within(dialog).getByRole('radio', { name: /Privada/ })).toBeChecked();
    expect(within(dialog).getByLabelText('Senha (opcional)')).toHaveAttribute('type', 'password');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mostrar senha' }));
    expect(within(dialog).getByLabelText('Senha (opcional)')).toHaveAttribute('type', 'text');
  });

  it('while sending, the button is disabled reading "Criando…" and the form is busy', async () => {
    deps.campaignsApi.hold('create');
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText('Nome da mesa'), 'Mesa Nova');
    await submit(dialog);
    const button = await within(dialog).findByRole('button', { name: 'Criando…' });
    expect(button).toBeDisabled();
    expect(within(dialog).getByRole('form', { name: 'Nova mesa' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('sends the DTO-normalized body', async () => {
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText('Nome da mesa'), '  Mesa Nova ');
    await userEvent.type(within(dialog).getByLabelText('Sistema (opcional)'), 'Tormenta20');
    await userEvent.click(within(dialog).getByRole('radio', { name: /Pública/ }));
    await submit(dialog);
    await within(dialog).findByText('Mesa criada');
    expect(deps.campaignsApi.callsOf('create')).toEqual([
      {
        name: 'Mesa Nova',
        system: 'Tormenta20',
        status: null,
        description: null,
        visibility: 'public',
      },
    ]);
  });

  it.each([
    ['invalid', 'Confira os campos e tente de novo.'],
    ['unexpected', 'Algo deu errado do nosso lado. Tente de novo em instantes.'],
    ['offline', 'Sem conexão com o servidor. Confira sua internet e tente de novo.'],
  ] as const)('a %s refusal shows "%s" in an alert', async (kind, message) => {
    deps.campaignsApi.answer('create', { ok: false, failure: { kind } });
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText('Nome da mesa'), 'Mesa Nova');
    await submit(dialog);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
  });

  it('success shows "Mesa criada" with the code formatted', async () => {
    deps.campaignsApi.answer('create', { ok: true, value: detailOf(NEW_CAMPAIGN) });
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText('Nome da mesa'), 'Mesa Nova');
    await submit(dialog);
    expect(await within(dialog).findByText('Mesa criada')).toBeInTheDocument();
    expect(within(dialog).getByText('VHRN-7K2Q')).toBeInTheDocument();
  });

  it('"Copiar código" copies the formatted code and announces "Copiado"', async () => {
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText('Nome da mesa'), 'Mesa Nova');
    await submit(dialog);
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Copiar código' }));
    expect(deps.clipboard.copied).toEqual(['VHRN-7K2Q']);
    expect(within(dialog).getByRole('status')).toHaveTextContent('Copiado');
  });

  it('"Fechar" closes the dialog and the new campaign is in the reloaded list', async () => {
    deps.campaignsApi.answer('create', { ok: true, value: detailOf(NEW_CAMPAIGN) });
    const dialog = await openDialog();
    deps.campaignsApi.answer('list', { ok: true, value: [NEW_CAMPAIGN, VHARN] });
    await userEvent.type(within(dialog).getByLabelText('Nome da mesa'), 'Mesa Nova');
    await submit(dialog);
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Fechar' }));
    // Radix unmounts the dialog a tick after close; asserting at once was flaky (2026-10-15).
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('link', { name: /Mesa Nova/ })).toBeInTheDocument();
  });
});
