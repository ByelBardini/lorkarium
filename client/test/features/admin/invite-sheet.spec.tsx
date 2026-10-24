import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ROOT_ADMIN } from '../../support/auth-api-fake';
import { marinaInvited } from '../../support/user-admin-api-fake';

describe('inviting and the invitations of the list', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ROOT_ADMIN);
  });

  async function openSheet(): Promise<HTMLElement> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: ['/admin/users'] });
    render(<RouterProvider router={router} />);
    await screen.findByRole('table', { name: 'Usuários' });
    await userEvent.click(screen.getByRole('button', { name: 'Convidar' }));
    return screen.findByRole('dialog', { name: 'Convidar pessoa' });
  }

  async function invite(email: string): Promise<void> {
    await userEvent.type(screen.getByLabelText('E-mail'), email);
    await userEvent.click(screen.getByRole('button', { name: 'Convidar' }));
  }

  it('"Convidar" opens the sheet with the e-mail focused and "Usuário" checked', async () => {
    const sheet = await openSheet();
    expect(within(sheet).getByLabelText('E-mail')).toHaveFocus();
    expect(within(sheet).getByRole('radio', { name: 'Usuário' })).toBeChecked();
    expect(within(sheet).getByRole('radio', { name: 'Admin' })).not.toBeChecked();
  });

  it('an invalid e-mail stays in the field, focused, without a request', async () => {
    await openSheet();
    await invite('marina');
    const field = screen.getByLabelText('E-mail');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('Informe um e-mail válido, como voce@exemplo.com.');
    expect(field).toHaveFocus();
    expect(deps.userAdminApi.answers.callsOf('invite')).toEqual([]);
  });

  it('an address already in the list says whose, without a request', async () => {
    await openSheet();
    await invite('pedro@exemplo.com');
    expect(screen.getByLabelText('E-mail')).toHaveAccessibleDescription(
      'Esse e-mail já é de @pedrinho (suspenso).',
    );
    expect(deps.userAdminApi.answers.callsOf('invite')).toEqual([]);
  });

  it('sending shows "Convidando…" and then the link to copy, once', async () => {
    const release = deps.userAdminApi.answers.hold('invite');
    await openSheet();
    await invite('nova@exemplo.com');
    const busy = screen.getByRole('button', { name: 'Convidando…' });
    expect(busy).toBeDisabled();
    expect(busy.closest('form')).toHaveAttribute('aria-busy', 'true');
    deps.userAdminApi.answers.clear('invite');
    release(await deps.userAdminApi.invite({ email: 'nova@exemplo.com', role: 'user' }));
    expect(await screen.findByRole('heading', { name: 'Convite enviado' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Link do convite' })).toHaveValue(
      'https://mesa.example.com/invite#token=tok-1',
    );
    expect(screen.getByText(/O link vale 7 dias e só funciona uma vez\./)).toBeInTheDocument();
  });

  it('"Copiar link" copies it and says "Link copiado."', async () => {
    await openSheet();
    await invite('nova@exemplo.com');
    await userEvent.click(await screen.findByRole('button', { name: 'Copiar link' }));
    expect(deps.clipboard.copied).toEqual(['https://mesa.example.com/invite#token=tok-1']);
    expect(screen.getByText('Link copiado.')).toHaveAttribute('role', 'status');
  });

  it('"Convidar outra pessoa" brings the empty form back; "Fechar" shows the invitation first', async () => {
    await openSheet();
    await invite('nova@exemplo.com');
    await userEvent.click(await screen.findByRole('button', { name: 'Convidar outra pessoa' }));
    expect(screen.getByLabelText('E-mail')).toHaveValue('');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const [, first] = screen.getAllByRole('row');
    expect(first).toHaveTextContent(/nova@exemplo\.com.*convite agora/);
  });

  it('already_invited offers "Reenviar convite"', async () => {
    const pending = marinaInvited(new Date()).id;
    deps.userAdminApi.answers.answer('invite', {
      ok: false,
      failure: { kind: 'already_invited', invitationId: pending },
    });
    await openSheet();
    await invite('marina2@exemplo.com');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe um convite para esse e-mail.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reenviar convite' }));
    expect(await screen.findByRole('heading', { name: 'Convite reenviado' })).toBeInTheDocument();
    expect(deps.userAdminApi.answers.callsOf('resendInvitation')).toEqual([pending]);
  });

  it.each([
    [{ kind: 'rate_limited', retryAfterSeconds: 30 }, 'Muitas tentativas. Tente de novo em 30 s.'],
    [{ kind: 'offline' }, 'Sem conexão com o servidor. Confira sua internet e tente de novo.'],
  ] as const)('%o shows "%s" and keeps the form', async (failure, message) => {
    deps.userAdminApi.answers.answer('invite', { ok: false, failure });
    await openSheet();
    await invite('nova@exemplo.com');
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('E-mail')).toHaveValue('nova@exemplo.com');
  });

  describe('row menu of an invitation', () => {
    async function openMenu(email: string): Promise<void> {
      const router = createMemoryRouter(buildRoutes(deps), { initialEntries: ['/admin/users'] });
      render(<RouterProvider router={router} />);
      await screen.findByRole('table', { name: 'Usuários' });
      await userEvent.click(screen.getByRole('button', { name: `Ações do convite para ${email}` }));
    }

    it('"Reenviar convite" shows the new link to copy', async () => {
      await openMenu('marina@exemplo.com');
      await userEvent.click(screen.getByRole('menuitem', { name: 'Reenviar convite' }));
      expect(await screen.findByRole('textbox', { name: 'Link do convite' })).toHaveValue(
        'https://mesa.example.com/invite#token=tok-1',
      );
    });

    it('"Cancelar convite" takes the row away and says so', async () => {
      await openMenu('marina@exemplo.com');
      await userEvent.click(screen.getByRole('menuitem', { name: 'Cancelar convite' }));
      expect(await screen.findByText('Convite para marina@exemplo.com cancelado.')).toHaveAttribute(
        'role',
        'status',
      );
      expect(screen.queryByText('marina@exemplo.com')).toBeNull();
    });

    it('an expired invitation can be resent too', async () => {
      await openMenu('joao@exemplo.com');
      expect(screen.getByRole('menuitem', { name: 'Reenviar convite' })).toBeInTheDocument();
    });
  });
});
