import type { AuthUserDto } from '@lorkarium/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { LoginForm } from '@/features/auth/login-form';
import type { AuthFailure } from '@/services/auth-api';
import { ANA, AuthApiFake } from '../../support/auth-api-fake';

describe('LoginForm', () => {
  let api: AuthApiFake;
  let authenticated: AuthUserDto[];

  beforeEach(() => {
    api = new AuthApiFake();
    authenticated = [];
    render(<LoginForm authApi={api} onAuthenticated={(user) => authenticated.push(user)} />);
  });

  async function fillAndSubmit(email = 'ana@mesa.com', password = 'segredo-da-ana'): Promise<void> {
    await userEvent.type(screen.getByLabelText('E-mail'), email);
    await userEvent.type(screen.getByLabelText('Senha'), password);
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  }

  async function failWith(failure: AuthFailure): Promise<void> {
    api.answerLoginWith({ ok: false, failure });
    await fillAndSubmit();
  }

  it('submitting empty marks both fields invalid, describes the errors and focuses the e-mail', async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    const email = screen.getByLabelText('E-mail');
    const password = screen.getByLabelText('Senha');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Informe seu e-mail.');
    expect(password).toHaveAccessibleDescription('Informe sua senha.');
    expect(email).toHaveFocus();
  });

  it('submitting empty never calls the API', async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(api.loginCalls).toEqual([]);
  });

  it('a malformed e-mail is described as invalid', async () => {
    await fillAndSubmit('ana@', 'segredo');
    expect(screen.getByLabelText('E-mail')).toHaveAccessibleDescription(
      'Informe um e-mail válido, como voce@exemplo.com.',
    );
  });

  it('submits the normalized credentials with rememberMe as the checkbox says', async () => {
    await userEvent.click(screen.getByRole('checkbox', { name: 'Manter conectado' }));
    await fillAndSubmit(' Ana@Mesa.com ', 'segredo-da-ana');
    expect(api.loginCalls).toEqual([
      { email: 'ana@mesa.com', password: 'segredo-da-ana', rememberMe: true },
    ]);
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
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@mesa.com');
    expect(screen.getByLabelText('Senha')).toHaveValue('');
    expect(screen.getByLabelText('Senha')).toHaveFocus();
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
});
