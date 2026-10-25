import type { AuthUserDto } from '@lorkarium/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { LoginForm } from '@/features/auth/login-form';
import type { AuthFailure } from '@/services/auth-api';
import { ANA, AuthApiFake } from '../../support/auth-api-fake';

const IDENTIFIER_LABEL = 'E-mail ou usuário';

describe('LoginForm', () => {
  let api: AuthApiFake;
  let authenticated: AuthUserDto[];

  function renderForm(rememberByDefault: boolean): void {
    render(
      <LoginForm
        authApi={api}
        onAuthenticated={(user) => authenticated.push(user)}
        rememberByDefault={rememberByDefault}
      />,
    );
  }

  beforeEach(() => {
    api = new AuthApiFake();
    authenticated = [];
    renderForm(false);
  });

  async function fillAndSubmit(
    identifier = 'ana@mesa.com',
    password = 'segredo-da-ana',
  ): Promise<void> {
    await userEvent.type(screen.getByLabelText(IDENTIFIER_LABEL), identifier);
    await userEvent.type(screen.getByLabelText('Senha'), password);
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  }

  async function failWith(failure: AuthFailure): Promise<void> {
    api.answerLoginWith({ ok: false, failure });
    await fillAndSubmit();
  }

  it('submitting empty marks both fields invalid, describes the errors and focuses the e-mail or @', async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    const identifier = screen.getByLabelText(IDENTIFIER_LABEL);
    const password = screen.getByLabelText('Senha');
    expect(identifier).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(identifier).toHaveAccessibleDescription('Informe seu e-mail ou usuário.');
    expect(password).toHaveAccessibleDescription('Informe sua senha.');
    expect(identifier).toHaveFocus();
  });

  it('submitting empty never calls the API', async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(api.loginCalls).toEqual([]);
  });

  it('a malformed e-mail is described as invalid', async () => {
    await fillAndSubmit('ana@', 'segredo');
    expect(screen.getByLabelText(IDENTIFIER_LABEL)).toHaveAccessibleDescription(
      'Informe um e-mail, como voce@exemplo.com, ou seu usuário, como @bia.',
    );
    expect(api.loginCalls).toEqual([]);
  });

  it('the field is plain text, so the @ alone is accepted by the browser too', () => {
    expect(screen.getByLabelText(IDENTIFIER_LABEL)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(IDENTIFIER_LABEL)).toHaveAttribute('autocomplete', 'username');
  });

  it('submits the normalized e-mail with rememberMe as the checkbox says', async () => {
    await userEvent.click(screen.getByRole('checkbox', { name: 'Manter conectado' }));
    await fillAndSubmit(' Ana@Mesa.com ', 'segredo-da-ana');
    expect(api.loginCalls).toEqual([
      { identifier: 'ana@mesa.com', password: 'segredo-da-ana', rememberMe: true },
    ]);
  });

  it('submits the @ typed with "@" and capitals as the bare @', async () => {
    await fillAndSubmit('@Ana', 'segredo-da-ana');
    expect(api.loginCalls).toEqual([
      { identifier: 'ana', password: 'segredo-da-ana', rememberMe: false },
    ]);
  });

  it('"Manter conectado" starts unchecked in the browser', () => {
    expect(screen.getByRole('checkbox', { name: 'Manter conectado' })).not.toBeChecked();
  });

  it('"Manter conectado" starts checked when remembered by default (the desktop app)', async () => {
    cleanup();
    renderForm(true);
    expect(screen.getByRole('checkbox', { name: 'Manter conectado' })).toBeChecked();
    await fillAndSubmit();
    expect(api.loginCalls[0]).toMatchObject({ rememberMe: true });
  });

  it('while sending, the button is disabled reading "Entrando…" and a second click does not resend', async () => {
    const answer = api.holdLogin();
    await fillAndSubmit();
    const button = screen.getByRole('button', { name: /Entrando/ });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(api.loginCalls).toHaveLength(1);
    answer({ ok: true, value: ANA });
  });

  it('a success hands the user to onAuthenticated', async () => {
    await fillAndSubmit();
    expect(authenticated).toEqual([ANA]);
  });

  it('wrong credentials show the alert, keep the e-mail, clear the password and focus it', async () => {
    await failWith({ kind: 'invalid_credentials' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'E-mail, usuário ou senha incorretos.',
    );
    expect(screen.getByLabelText(IDENTIFIER_LABEL)).toHaveValue('ana@mesa.com');
    expect(screen.getByLabelText('Senha')).toHaveValue('');
    expect(screen.getByLabelText('Senha')).toHaveFocus();
  });

  it('a suspended account says so, keeps the e-mail and clears the password', async () => {
    await failWith({ kind: 'account_suspended' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta conta está suspensa. Fale com quem administra o Lorkarium.',
    );
    expect(screen.getByLabelText(IDENTIFIER_LABEL)).toHaveValue('ana@mesa.com');
    expect(screen.getByLabelText('Senha')).toHaveValue('');
  });

  it.each([
    [{ kind: 'rate_limited', retryAfterSeconds: 42 }, 'Muitas tentativas. Tente de novo em 42 s.'],
    [{ kind: 'offline' }, 'Sem conexão com o servidor. Confira sua internet e tente de novo.'],
    [{ kind: 'unexpected' }, 'Algo deu errado do nosso lado. Tente de novo em instantes.'],
  ] as const)('the failure %o shows "%s"', async (failure, message) => {
    await failWith(failure);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('no failure ever calls onAuthenticated', async () => {
    await failWith({ kind: 'invalid_credentials' });
    await screen.findByRole('alert');
    expect(authenticated).toEqual([]);
  });

  describe('second step (2FA)', () => {
    async function reachTwoFactor(identifier = 'ana@mesa.com'): Promise<void> {
      api.answerLoginWith({ ok: false, failure: { kind: 'two_factor_required' } });
      await fillAndSubmit(identifier);
      await screen.findByRole('form', { name: 'Verificação em duas etapas' });
    }

    async function sendCode(code: string): Promise<void> {
      await userEvent.type(screen.getByLabelText(/Código/), code);
      await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    }

    it('a right password on an account with 2FA shows the code step focused, with the e-mail and "Voltar"', async () => {
      await reachTwoFactor();
      expect(screen.getByLabelText('Código do app autenticador')).toHaveFocus();
      expect(screen.getByText('ana@mesa.com')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
      expect(authenticated).toEqual([]);
    });

    it('entering by the @ names the account with its "@"', async () => {
      await reachTwoFactor('Ana');
      expect(screen.getByText('@ana')).toBeInTheDocument();
    });

    it('the right app code sends { code } and hands the user to onAuthenticated', async () => {
      await reachTwoFactor();
      await sendCode('123 456');
      expect(api.twoFactorCalls).toEqual([{ code: '123456' }]);
      expect(authenticated).toEqual([ANA]);
    });

    it('a wrong code is cleared and focused with "Código incorreto."', async () => {
      await reachTwoFactor();
      api.answerTwoFactorWith({ ok: false, failure: { kind: 'two_factor_code_invalid' } });
      await sendCode('111111');
      const field = await screen.findByLabelText('Código do app autenticador');
      expect(field).toHaveValue('');
      expect(field).toHaveFocus();
      expect(field).toHaveAccessibleDescription('Código incorreto.');
    });

    it('a code out of the format is refused before sending', async () => {
      await reachTwoFactor();
      await sendCode('12ab');
      expect(screen.getByLabelText('Código do app autenticador')).toHaveAccessibleDescription(
        'O código tem 6 números.',
      );
      expect(api.twoFactorCalls).toEqual([]);
    });

    it('"Usar um código de recuperação" swaps the field, and a right recovery code signs in', async () => {
      await reachTwoFactor();
      await userEvent.click(screen.getByRole('button', { name: 'Usar um código de recuperação' }));
      await sendCode('K7M2P9QRST');
      expect(api.twoFactorCalls).toEqual([{ recoveryCode: 'k7m2p-9qrst' }]);
      expect(authenticated).toEqual([ANA]);
    });

    it('an expired challenge goes back to the first step with the notice and the password cleared', async () => {
      await reachTwoFactor();
      api.answerTwoFactorWith({ ok: false, failure: { kind: 'two_factor_challenge_expired' } });
      await sendCode('123456');
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'O tempo para o código acabou. Entre de novo.',
      );
      expect(screen.getByLabelText(IDENTIFIER_LABEL)).toHaveValue('ana@mesa.com');
      expect(screen.getByLabelText('Senha')).toHaveValue('');
    });

    it('"Voltar" shows the e-mail and password again, without a notice', async () => {
      await reachTwoFactor();
      await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
      expect(screen.getByLabelText(IDENTIFIER_LABEL)).toHaveValue('ana@mesa.com');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('rate_limited shows "Muitas tentativas. Tente de novo em N s."', async () => {
      await reachTwoFactor();
      api.answerTwoFactorWith({
        ok: false,
        failure: { kind: 'rate_limited', retryAfterSeconds: 30 },
      });
      await sendCode('123456');
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Muitas tentativas. Tente de novo em 30 s.',
      );
    });
  });
});
