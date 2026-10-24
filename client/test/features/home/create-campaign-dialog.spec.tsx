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
  let router: ReturnType<typeof createMemoryRouter>;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
  });

  async function openDialog(): Promise<HTMLElement> {
    router = createMemoryRouter(buildRoutes(deps), { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Nova mesa' }));
    return screen.findByRole('dialog', { name: 'Nova mesa' });
  }

  async function typeName(dialog: HTMLElement, name = 'Mesa Nova'): Promise<void> {
    await userEvent.type(within(dialog).getByLabelText('Nome da mesa'), name);
  }

  async function submit(dialog: HTMLElement): Promise<void> {
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar mesa' }));
  }

  async function createWithPassword(dialog: HTMLElement, password: string): Promise<void> {
    await typeName(dialog);
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Pedir senha para entrar' }));
    await userEvent.type(within(dialog).getByLabelText('Senha da mesa'), password);
    await submit(dialog);
  }

  function preview(dialog: HTMLElement): HTMLElement {
    return within(dialog).getByRole('region', { name: 'Assim ela aparece no hub' });
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
    await typeName(dialog, 'a'.repeat(81));
    await submit(dialog);
    expect(
      within(dialog).getByText('O nome pode ter no máximo 80 caracteres.'),
    ).toBeInTheDocument();
  });

  it('the preview shows the waiting text, then follows the name and the system as typed', async () => {
    const dialog = await openDialog();
    expect(preview(dialog)).toHaveTextContent('Sua mesa nova');
    expect(preview(dialog)).toHaveTextContent('Sistema a definir · privada');
    await typeName(dialog, 'Os Sinos');
    await userEvent.type(within(dialog).getByLabelText('Sistema (opcional)'), 'GURPS');
    expect(preview(dialog)).toHaveTextContent('Os Sinos');
    expect(preview(dialog)).not.toHaveTextContent('Sua mesa nova');
    expect(preview(dialog)).toHaveTextContent('GURPS · privada');
  });

  it('a system suggestion fills the field and, clicked again, clears it', async () => {
    const dialog = await openDialog();
    const suggestion = within(dialog).getByRole('button', { name: 'Tormenta20' });
    const system = within(dialog).getByLabelText('Sistema (opcional)');
    await userEvent.click(suggestion);
    expect(system).toHaveValue('Tormenta20');
    expect(suggestion).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(suggestion);
    expect(system).toHaveValue('');
    expect(suggestion).toHaveAttribute('aria-pressed', 'false');
  });

  it('the status starts at "Em construção" and the chosen one shows in the preview', async () => {
    const dialog = await openDialog();
    expect(within(dialog).getByRole('radio', { name: 'Em construção' })).toBeChecked();
    expect(within(dialog).getByText('O mestre ainda está preparando a mesa.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Recrutando' }));
    expect(within(dialog).getByText('A mesa procura jogadores.')).toBeInTheDocument();
    expect(preview(dialog)).toHaveTextContent('Recrutando');
  });

  it('"Privada" comes checked and the password field only shows with the switch on', async () => {
    const dialog = await openDialog();
    expect(within(dialog).getByRole('radio', { name: 'Privada' })).toBeChecked();
    expect(within(dialog).queryByLabelText('Senha da mesa')).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Pedir senha para entrar' }));
    expect(within(dialog).getByLabelText('Senha da mesa')).toHaveFocus();
    expect(preview(dialog)).toHaveTextContent('privada · com senha');
  });

  it.each([
    ['too short', 'abc'],
    ['empty', ''],
  ])('with the switch on, a %s password blocks with the focus on it', async (_case, password) => {
    const dialog = await openDialog();
    await typeName(dialog);
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Pedir senha para entrar' }));
    if (password) await userEvent.type(within(dialog).getByLabelText('Senha da mesa'), password);
    await submit(dialog);
    expect(
      within(dialog).getByText('A senha precisa de pelo menos 4 caracteres.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Senha da mesa')).toHaveFocus();
    expect(deps.campaignsApi.callsOf('create')).toEqual([]);
  });

  it('turning the switch off drops the typed password from the body', async () => {
    const dialog = await openDialog();
    await typeName(dialog);
    const toggle = within(dialog).getByRole('switch', { name: 'Pedir senha para entrar' });
    await userEvent.click(toggle);
    await userEvent.type(within(dialog).getByLabelText('Senha da mesa'), 'sino');
    await userEvent.click(toggle);
    await submit(dialog);
    await within(dialog).findByText('Mesa criada');
    expect(deps.campaignsApi.callsOf('create')).toEqual([
      expect.not.objectContaining({ password: expect.anything() }),
    ]);
  });

  it('sends the DTO-normalized body with the status and the drawn cover chosen', async () => {
    const dialog = await openDialog();
    await typeName(dialog, '  Mesa Nova ');
    await userEvent.type(within(dialog).getByLabelText('Sistema (opcional)'), 'Tormenta20');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Em andamento' }));
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Pública' }));
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Costa' }));
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Brasa' }));
    await submit(dialog);
    await within(dialog).findByText('Mesa criada');
    expect(deps.campaignsApi.callsOf('create')).toEqual([
      {
        name: 'Mesa Nova',
        system: 'Tormenta20',
        status: 'ongoing',
        description: null,
        visibility: 'public',
        cover: { kind: 'drawn', drawing: 1, tone: 3 },
      },
    ]);
  });

  it('untouched, the body goes with "building" and the first drawn cover', async () => {
    const dialog = await openDialog();
    await typeName(dialog);
    await submit(dialog);
    await within(dialog).findByText('Mesa criada');
    expect(deps.campaignsApi.callsOf('create')).toEqual([
      expect.objectContaining({
        status: 'building',
        visibility: 'private',
        cover: { kind: 'drawn', drawing: 0, tone: 1 },
      }),
    ]);
  });

  it('while sending, the button is disabled reading "Criando…" and the form is busy', async () => {
    deps.campaignsApi.hold('create');
    const dialog = await openDialog();
    await typeName(dialog);
    await submit(dialog);
    const button = await within(dialog).findByRole('button', { name: 'Criando…' });
    expect(button).toBeDisabled();
    expect(within(dialog).getByRole('form', { name: 'Nova mesa' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it.each([
    ['invalid', 'Confira os campos e tente de novo.'],
    ['unexpected', 'Algo deu errado do nosso lado. Tente de novo em instantes.'],
    ['offline', 'Sem conexão com o servidor. Confira sua internet e tente de novo.'],
  ] as const)('a %s refusal shows "%s" in an alert', async (kind, message) => {
    deps.campaignsApi.answer('create', { ok: false, failure: { kind } });
    const dialog = await openDialog();
    await typeName(dialog);
    await submit(dialog);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
  });

  it('success shows "Mesa criada" with the code, the three next steps and no password', async () => {
    deps.campaignsApi.answer('create', { ok: true, value: detailOf(NEW_CAMPAIGN) });
    const dialog = await openDialog();
    await typeName(dialog);
    await submit(dialog);
    expect(await within(dialog).findByText('Mesa criada')).toBeInTheDocument();
    expect(within(dialog).getByText('VHRN-7K2Q')).toBeInTheDocument();
    const steps = within(dialog).getByRole('region', { name: 'Próximos passos' });
    expect(within(steps).getAllByRole('listitem')).toHaveLength(3);
    expect(within(dialog).queryByText(/Senha:/)).not.toBeInTheDocument();
  });

  it('success shows the password typed, once, next to the code', async () => {
    const dialog = await openDialog();
    await createWithPassword(dialog, 'sino');
    await within(dialog).findByText('Mesa criada');
    expect(within(dialog).getByText(/Senha:/)).toHaveTextContent('Senha: sino');
  });

  it('"Copiar código" copies the formatted code and announces "Copiado"', async () => {
    const dialog = await openDialog();
    await typeName(dialog);
    await submit(dialog);
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Copiar código' }));
    expect(deps.clipboard.copied).toEqual(['VHRN-7K2Q']);
    expect(within(dialog).getByRole('status')).toHaveTextContent('Copiado');
  });

  it('"Criar outra" goes back to an empty form', async () => {
    const dialog = await openDialog();
    await createWithPassword(dialog, 'sino');
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Criar outra' }));
    expect(within(dialog).getByRole('form', { name: 'Nova mesa' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Nome da mesa')).toHaveValue('');
    expect(within(dialog).queryByLabelText('Senha da mesa')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Em construção' })).toBeChecked();
  });

  it('"Entrar na mesa" records the entry and goes to the table of the new campaign', async () => {
    deps.campaignsApi.answer('create', { ok: true, value: detailOf(NEW_CAMPAIGN) });
    const dialog = await openDialog();
    await typeName(dialog);
    await submit(dialog);
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Entrar na mesa' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/campaigns/${NEW_CAMPAIGN.id}/table`),
    );
    expect(deps.campaignsApi.callsOf('enter')).toEqual([NEW_CAMPAIGN.id]);
  });

  it('"Fechar" closes the dialog and the new campaign is in the reloaded list', async () => {
    deps.campaignsApi.answer('create', { ok: true, value: detailOf(NEW_CAMPAIGN) });
    const dialog = await openDialog();
    deps.campaignsApi.answer('list', { ok: true, value: [NEW_CAMPAIGN, VHARN] });
    await typeName(dialog);
    await submit(dialog);
    // Regression (2026-10-15, CI): the form step's X is also named "Fechar"; on a slow answer the
    // query found it, the step swapped and the click hit a detached node. Wait for the created step.
    await within(dialog).findByText('Mesa criada');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('link', { name: /Mesa Nova/ })).toBeInTheDocument();
  });

  it('Esc closes the dialog without creating anything', async () => {
    const dialog = await openDialog();
    await typeName(dialog);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deps.campaignsApi.callsOf('create')).toEqual([]);
  });
});
