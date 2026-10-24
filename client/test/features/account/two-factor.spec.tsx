import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import {
  ANA_SECURITY,
  NEW_RECOVERY_CODES,
  RECOVERY_CODES,
  TWO_FACTOR_SETUP,
} from '../../support/account-security-api-fake';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';

describe('2FA on the account (/account)', () => {
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

  function twoFactorLine(): HTMLElement {
    const label = screen.getByText('Verificação em duas etapas (2FA)');
    const row = label.parentElement;
    if (!row) throw new Error('the 2FA label has no row around it');
    return row;
  }

  async function startSetup(): Promise<HTMLElement> {
    await openAccount();
    await userEvent.click(screen.getByRole('button', { name: 'Ligar 2FA' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ligar 2FA' });
    await userEvent.type(within(dialog).getByLabelText('Senha atual', { exact: true }), 'segredo');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    await within(dialog).findByRole('img', { name: 'QR code para o app autenticador' });
    return dialog;
  }

  async function sendAppCode(dialog: HTMLElement, code: string): Promise<void> {
    await userEvent.type(within(dialog).getByLabelText('Código do app'), code);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ligar 2FA' }));
  }

  it('turned off reads "Desligado" with "Ligar 2FA"', async () => {
    await openAccount();
    expect(twoFactorLine()).toHaveTextContent('Desligado');
  });

  it('setup: password, then the QR and the key in groups of 4 with "Copiar chave"', async () => {
    const dialog = await startSetup();
    expect(
      within(dialog).getByRole('img', { name: 'QR code para o app autenticador' }),
    ).toHaveAttribute('src', TWO_FACTOR_SETUP.qrImage);
    expect(within(dialog).getByText('JBSW Y3DP EHPK 3PXP')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Copiar chave' }));
    expect(deps.clipboard.copied).toEqual([TWO_FACTOR_SETUP.secret]);
    expect(deps.accountSecurityApi.answers.callsOf('setupTwoFactor')).toEqual([
      { currentPassword: 'segredo' },
    ]);
  });

  it('the code field is numeric, one-time-code and focused', async () => {
    const dialog = await startSetup();
    const code = within(dialog).getByLabelText('Código do app');
    expect(code).toHaveAttribute('inputmode', 'numeric');
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(code).toHaveFocus();
  });

  it('the right code shows the 10 codes with "Copiar códigos" and "Baixar .txt"; "Guardei os códigos" closes', async () => {
    const dialog = await startSetup();
    await sendAppCode(dialog, '123456');
    const codes = await within(dialog).findByRole('list', { name: 'Códigos de recuperação' });
    expect(
      within(codes)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([...RECOVERY_CODES]);
    expect(within(dialog).getByRole('button', { name: 'Baixar .txt' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Copiar códigos' }));
    expect(deps.clipboard.copied).toEqual([RECOVERY_CODES.join('\n')]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardei os códigos' }));
    expect(screen.queryByRole('dialog', { name: 'Ligar 2FA' })).not.toBeInTheDocument();
    expect(twoFactorLine()).toHaveTextContent('Ligado · 10 códigos de recuperação');
  });

  it('a wrong code is cleared and focused with the message', async () => {
    deps.accountSecurityApi.answers.answer('enableTwoFactor', {
      ok: false,
      failure: { kind: 'two_factor_code_invalid' },
    });
    const dialog = await startSetup();
    await sendAppCode(dialog, '111111');
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Código do app')).toHaveAccessibleDescription(
        'Código incorreto. Confira o app e tente de novo.',
      ),
    );
    const code = within(dialog).getByLabelText('Código do app');
    expect(code).toHaveValue('');
    expect(code).toHaveFocus();
  });

  it('closing the dialog in the middle leaves 2FA off', async () => {
    const dialog = await startSetup();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog', { name: 'Ligar 2FA' })).not.toBeInTheDocument();
    expect(twoFactorLine()).toHaveTextContent('Desligado');
    expect(deps.accountSecurityApi.answers.callsOf('enableTwoFactor')).toEqual([]);
  });

  it('a wrong password at the start is said in its own field', async () => {
    deps.accountSecurityApi.answers.answer('setupTwoFactor', {
      ok: false,
      failure: { kind: 'current_password_invalid' },
    });
    await openAccount();
    await userEvent.click(screen.getByRole('button', { name: 'Ligar 2FA' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ligar 2FA' });
    await userEvent.type(within(dialog).getByLabelText('Senha atual', { exact: true }), 'errada');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    await waitFor(() =>
      expect(
        within(dialog).getByLabelText('Senha atual', { exact: true }),
      ).toHaveAccessibleDescription('Senha atual incorreta.'),
    );
  });

  describe('turned on', () => {
    beforeEach(() => {
      deps.accountSecurityApi.currentSecurity = {
        ...ANA_SECURITY,
        twoFactor: { enabled: true, recoveryCodesLeft: 7 },
      };
    });

    async function confirmWith(dialog: HTMLElement, submit: string): Promise<void> {
      await userEvent.type(
        within(dialog).getByLabelText('Senha atual', { exact: true }),
        'segredo',
      );
      await userEvent.type(
        within(dialog).getByLabelText('Código do app ou de recuperação'),
        '123456',
      );
      await userEvent.click(within(dialog).getByRole('button', { name: submit }));
    }

    it('reads "Ligado" with how many recovery codes are left', async () => {
      await openAccount();
      expect(twoFactorLine()).toHaveTextContent('Ligado · 7 códigos de recuperação');
    });

    it('"Desligar" with password and code turns it off', async () => {
      await openAccount();
      await userEvent.click(
        within(twoFactorLine().parentElement as HTMLElement).getByRole('button', {
          name: 'Desligar',
        }),
      );
      const dialog = await screen.findByRole('dialog', { name: 'Desligar 2FA' });
      await confirmWith(dialog, 'Desligar');
      await waitFor(() => expect(twoFactorLine()).toHaveTextContent('Desligado'));
      expect(screen.queryByRole('dialog', { name: 'Desligar 2FA' })).not.toBeInTheDocument();
      expect(deps.accountSecurityApi.answers.callsOf('disableTwoFactor')).toEqual([
        { currentPassword: 'segredo', code: '123456' },
      ]);
    });

    it('"Gerar novos códigos" shows the new ones and that the old ones stopped working', async () => {
      await openAccount();
      await userEvent.click(screen.getByRole('button', { name: 'Gerar novos códigos' }));
      const dialog = await screen.findByRole('dialog', { name: 'Gerar novos códigos' });
      await confirmWith(dialog, 'Gerar códigos');
      const codes = await within(dialog).findByRole('list', { name: 'Códigos de recuperação' });
      expect(
        within(codes)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual([...NEW_RECOVERY_CODES]);
      expect(within(dialog).getByText('Os códigos antigos não valem mais.')).toBeInTheDocument();
    });

    it('rate_limited says when to try again', async () => {
      deps.accountSecurityApi.answers.answer('disableTwoFactor', {
        ok: false,
        failure: { kind: 'rate_limited', retryAfterSeconds: 50 },
      });
      await openAccount();
      await userEvent.click(
        within(twoFactorLine().parentElement as HTMLElement).getByRole('button', {
          name: 'Desligar',
        }),
      );
      const dialog = await screen.findByRole('dialog', { name: 'Desligar 2FA' });
      await confirmWith(dialog, 'Desligar');
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Muitas tentativas. Tente de novo em 50 s.',
      );
    });
  });
});
