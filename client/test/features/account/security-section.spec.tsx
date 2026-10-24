import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { ANA_SECURITY } from '../../support/account-security-api-fake';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('security section (/account)', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
  });

  async function openAccount(): Promise<void> {
    render(
      <RouterProvider
        router={createMemoryRouter(buildRoutes(deps), { initialEntries: ['/account'] })}
      />,
    );
    await screen.findByRole('heading', { name: 'Conta e segurança' });
  }

  function section(): HTMLElement {
    return screen.getByRole('region', { name: 'Conta e segurança' });
  }

  function statusLine(): HTMLElement {
    const lines = within(section()).getAllByRole('status');
    const line = lines[0];
    if (!line) throw new Error('the security section has no status line');
    return line;
  }

  describe('e-mail', () => {
    it('shows the current address', async () => {
      await openAccount();
      expect(within(section()).getByText(ANA.email)).toBeInTheDocument();
      expect(within(section()).queryByRole('button', { name: 'Cancelar troca' })).toBeNull();
    });

    it('a pending change says where it waits and offers "Cancelar troca"', async () => {
      deps.accountSecurityApi.currentSecurity = { ...ANA_SECURITY, pendingEmail: 'b*****@x.com' };
      await openAccount();
      expect(
        within(section()).getByText('Aguardando confirmação em b*****@x.com'),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar troca' }));
      await waitFor(() =>
        expect(within(section()).queryByText(/Aguardando confirmação/)).not.toBeInTheDocument(),
      );
      expect(statusLine()).toHaveTextContent('Troca de e-mail cancelada.');
    });

    it('"Trocar e-mail" with an address in use says so under the new e-mail', async () => {
      deps.accountSecurityApi.answers.answer('requestEmailChange', {
        ok: false,
        failure: { kind: 'email_taken' },
      });
      await openAccount();
      await userEvent.click(screen.getByRole('button', { name: 'Trocar e-mail' }));
      const dialog = await screen.findByRole('dialog', { name: 'Trocar e-mail' });
      await userEvent.type(within(dialog).getByLabelText('Novo e-mail'), 'bia@lorkarium.dev');
      await userEvent.type(
        within(dialog).getByLabelText('Senha atual', { exact: true }),
        'segredo',
      );
      await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar link' }));
      await waitFor(() =>
        expect(within(dialog).getByLabelText('Novo e-mail')).toHaveAccessibleDescription(
          'Esse e-mail já está em uso.',
        ),
      );
    });

    it('a sent request closes the dialog and shows the pending line', async () => {
      await openAccount();
      await userEvent.click(screen.getByRole('button', { name: 'Trocar e-mail' }));
      const dialog = await screen.findByRole('dialog', { name: 'Trocar e-mail' });
      await userEvent.type(within(dialog).getByLabelText('Novo e-mail'), ' Bia@X.com ');
      await userEvent.type(
        within(dialog).getByLabelText('Senha atual', { exact: true }),
        'segredo',
      );
      await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar link' }));
      // While it sends, the open dialog hides the rest of the page from the accessibility tree.
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Trocar e-mail' })).not.toBeInTheDocument(),
      );
      expect(
        within(section()).getByText('Aguardando confirmação em b**@x.com'),
      ).toBeInTheDocument();
      expect(deps.accountSecurityApi.answers.callsOf('requestEmailChange')).toEqual([
        { newEmail: 'bia@x.com', currentPassword: 'segredo' },
      ]);
    });

    it('a malformed address is refused before sending', async () => {
      await openAccount();
      await userEvent.click(screen.getByRole('button', { name: 'Trocar e-mail' }));
      const dialog = await screen.findByRole('dialog', { name: 'Trocar e-mail' });
      await userEvent.type(within(dialog).getByLabelText('Novo e-mail'), 'bia@');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar link' }));
      expect(within(dialog).getByLabelText('Novo e-mail')).toHaveAccessibleDescription(
        'Informe um e-mail válido, como voce@exemplo.com.',
      );
      expect(deps.accountSecurityApi.answers.callsOf('requestEmailChange')).toEqual([]);
    });
  });

  describe('senha', () => {
    async function openPasswordDialog(): Promise<HTMLElement> {
      await openAccount();
      await userEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));
      return screen.findByRole('dialog', { name: 'Trocar senha' });
    }

    async function fillPassword(
      dialog: HTMLElement,
      current: string,
      next: string,
      again = next,
    ): Promise<void> {
      await userEvent.type(within(dialog).getByLabelText('Senha atual', { exact: true }), current);
      await userEvent.type(within(dialog).getByLabelText('Senha nova', { exact: true }), next);
      await userEvent.type(
        within(dialog).getByLabelText('Repita a senha nova', { exact: true }),
        again,
      );
      await userEvent.click(within(dialog).getByRole('button', { name: 'Trocar senha' }));
    }

    it('a password never changed reads so', async () => {
      await openAccount();
      expect(
        within(section()).getByText('Ainda é a senha da criação da conta.'),
      ).toBeInTheDocument();
    });

    it('a password changed 3 months ago reads "Trocada há 3 meses"', async () => {
      const changedAt = new Date(Date.parse('2026-10-14T20:00:00') - 95 * DAY_MS).toISOString();
      deps.accountSecurityApi.currentSecurity = { ...ANA_SECURITY, passwordChangedAt: changedAt };
      await openAccount();
      expect(within(section()).getByText('Trocada há 3 meses')).toBeInTheDocument();
    });

    it('a new password of 7 characters is refused by the rule of the DTO', async () => {
      const dialog = await openPasswordDialog();
      await fillPassword(dialog, 'velha', '1234567');
      expect(
        within(dialog).getByLabelText('Senha nova', { exact: true }),
      ).toHaveAccessibleDescription('A senha nova precisa de pelo menos 8 caracteres.');
      expect(deps.accountSecurityApi.answers.callsOf('changePassword')).toEqual([]);
    });

    it('a repeat that differs says "As senhas não são iguais."', async () => {
      const dialog = await openPasswordDialog();
      await fillPassword(dialog, 'velha', 'senha-nova-1', 'senha-nova-2');
      expect(
        within(dialog).getByLabelText('Repita a senha nova', { exact: true }),
      ).toHaveAccessibleDescription('As senhas não são iguais.');
    });

    it('a wrong current password is said in its own field, cleared and focused', async () => {
      deps.accountSecurityApi.answers.answer('changePassword', {
        ok: false,
        failure: { kind: 'current_password_invalid' },
      });
      const dialog = await openPasswordDialog();
      await fillPassword(dialog, 'errada', 'senha-nova-1');
      await waitFor(() =>
        expect(
          within(dialog).getByLabelText('Senha atual', { exact: true }),
        ).toHaveAccessibleDescription('Senha atual incorreta.'),
      );
      const current = within(dialog).getByLabelText('Senha atual', { exact: true });
      expect(current).toHaveValue('');
      expect(current).toHaveFocus();
    });

    it('a change closes the dialog, announces it and reads "Trocada agora"', async () => {
      const dialog = await openPasswordDialog();
      await fillPassword(dialog, 'velha', 'senha-nova-1');
      await waitFor(() =>
        expect(statusLine()).toHaveTextContent(
          'Senha trocada. Os outros aparelhos saíram da conta.',
        ),
      );
      expect(screen.queryByRole('dialog', { name: 'Trocar senha' })).not.toBeInTheDocument();
      expect(within(section()).getByText('Trocada agora')).toBeInTheDocument();
      expect(deps.accountSecurityApi.answers.callsOf('changePassword')).toEqual([
        { currentPassword: 'velha', newPassword: 'senha-nova-1' },
      ]);
    });

    it('rate_limited is the alert of the dialog', async () => {
      deps.accountSecurityApi.answers.answer('changePassword', {
        ok: false,
        failure: { kind: 'rate_limited', retryAfterSeconds: 40 },
      });
      const dialog = await openPasswordDialog();
      await fillPassword(dialog, 'velha', 'senha-nova-1');
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Muitas tentativas. Tente de novo em 40 s.',
      );
    });
  });

  describe('sessões', () => {
    function sessionsList(): HTMLElement {
      return screen.getByRole('list', { name: 'Onde você está conectado' });
    }

    it('this device comes first with "Este aparelho" and no "Sair"; the others by last activity', async () => {
      await openAccount();
      const rows = within(sessionsList()).getAllByRole('listitem');
      expect(rows.map((row) => row.textContent)).toEqual([
        expect.stringContaining('Chrome no Windows'),
        expect.stringContaining('Safari no iOS'),
        expect.stringContaining('Firefox no Linux'),
      ]);
      expect(rows[0]).toHaveTextContent('Este aparelho');
      expect(within(rows[0] as HTMLElement).queryByRole('button')).toBeNull();
      expect(rows[1]).toHaveTextContent('ativo há 5 h');
      expect(rows[2]).toHaveTextContent('ativo há 2 dias');
    });

    it('"Sair" on one takes it off the list and says "Sessão encerrada."', async () => {
      await openAccount();
      await userEvent.click(screen.getByRole('button', { name: 'Sair de Firefox no Linux' }));
      await waitFor(() =>
        expect(within(sessionsList()).queryByText('Firefox no Linux')).toBeNull(),
      );
      expect(statusLine()).toHaveTextContent('Sessão encerrada.');
    });

    it('"Sair de todos os outros" asks first, then only this device stays', async () => {
      await openAccount();
      await userEvent.click(screen.getByRole('button', { name: 'Sair de todos os outros' }));
      const confirm = await screen.findByRole('alertdialog', {
        name: 'Sair de todos os outros aparelhos?',
      });
      await userEvent.click(
        within(confirm).getByRole('button', { name: 'Sair de todos os outros' }),
      );
      await waitFor(() => expect(within(sessionsList()).getAllByRole('listitem')).toHaveLength(1));
      expect(statusLine()).toHaveTextContent('Os outros aparelhos saíram da conta.');
      expect(screen.queryByRole('button', { name: 'Sair de todos os outros' })).toBeNull();
    });

    it('with only this device there is no "Sair de todos os outros"', async () => {
      deps.accountSecurityApi.currentSessions = deps.accountSecurityApi.currentSessions.filter(
        (session) => session.current,
      );
      await openAccount();
      expect(screen.queryByRole('button', { name: 'Sair de todos os outros' })).toBeNull();
    });

    it('offline shows the alert and keeps the list as it was', async () => {
      deps.accountSecurityApi.answers.answer('revokeSession', {
        ok: false,
        failure: { kind: 'offline' },
      });
      await openAccount();
      await userEvent.click(screen.getByRole('button', { name: 'Sair de Safari no iOS' }));
      expect(await within(section()).findByRole('alert')).toHaveTextContent(
        /Sem conexão com o servidor/,
      );
      expect(within(sessionsList()).getAllByRole('listitem')).toHaveLength(3);
    });
  });
});
