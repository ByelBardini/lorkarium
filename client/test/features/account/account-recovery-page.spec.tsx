import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';

const LINK = '/account/recover#token=rec-1';
const INVALID = 'Esse link venceu ou já foi usado.';

describe('account recovery page (/account/recover)', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
  });

  function renderAt(path: string): ReturnType<typeof createMemoryRouter> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    return router;
  }

  async function typeAndRecover(password: string): Promise<void> {
    await userEvent.type(await screen.findByLabelText('Senha nova'), password);
    await userEvent.click(screen.getByRole('button', { name: 'Recuperar conta' }));
  }

  it('reads the token from the fragment, checks it and takes it off the address', async () => {
    const router = renderAt(LINK);
    expect(await screen.findByRole('heading', { name: 'Recuperar sua conta' })).toBeInTheDocument();
    expect(deps.accountSecurityApi.answers.callsOf('checkRecovery')).toEqual(['rec-1']);
    await waitFor(() => expect(router.state.location.hash).toBe(''));
    expect(document.title).toBe('Lorkarium · Recuperar conta');
  });

  it('says "Conferindo o link…" while the check is on its way', async () => {
    deps.accountSecurityApi.answers.hold('checkRecovery');
    renderAt(LINK);
    expect(await screen.findByText('Conferindo o link…')).toHaveAttribute('role', 'status');
  });

  it('a cancel link names the pending address and says every device leaves', async () => {
    deps.accountSecurityApi.answers.answer('checkRecovery', {
      ok: true,
      value: { kind: 'cancel-email-change', email: 'b*****@x.com' },
    });
    renderAt(LINK);
    expect(
      await screen.findByRole('heading', { name: 'Cancelar a troca de e-mail' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A troca de e-mail para b\*\*\*\*\*@x\.com é cancelada\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/Todos os aparelhos saem da conta/)).toBeInTheDocument();
  });

  it('a revert link names the address that comes back', async () => {
    deps.accountSecurityApi.answers.answer('checkRecovery', {
      ok: true,
      value: { kind: 'revert-email-change', email: 'l****@x.com' },
    });
    renderAt(LINK);
    expect(
      await screen.findByRole('heading', { name: 'Voltar o e-mail da conta para l****@x.com' }),
    ).toBeInTheDocument();
  });

  it('a password of 7 shows the minimum under the field, without asking the server', async () => {
    renderAt(LINK);
    await typeAndRecover('1234567');
    const field = screen.getByLabelText('Senha nova');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('A senha nova precisa de pelo menos 8 caracteres.');
    expect(field).toHaveFocus();
    expect(deps.accountSecurityApi.answers.callsOf('recover')).toEqual([]);
  });

  it('a signed-in visitor recovers: the session goes anonymous and "Entrar" is offered', async () => {
    deps.authApi.answerMeWith(ANA);
    renderAt(LINK);
    await typeAndRecover('senha-nova-1');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Todos os aparelhos saíram da conta. Entre com a senha nova.',
    );
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login');
    expect(deps.accountSecurityApi.answers.callsOf('recover')).toEqual([
      { token: 'rec-1', newPassword: 'senha-nova-1' },
    ]);
    expect(deps.sessionStore.getState().session.status).toBe('anonymous');
  });

  it('a link refused at the check shows the dead-link sentence without a form', async () => {
    deps.accountSecurityApi.answers.answer('checkRecovery', {
      ok: false,
      failure: { kind: 'recovery_token_invalid' },
    });
    renderAt(LINK);
    expect(await screen.findByRole('heading', { name: INVALID })).toBeInTheDocument();
    expect(screen.queryByLabelText('Senha nova')).toBeNull();
  });

  it('without a token the dead-link sentence shows and nothing is checked', async () => {
    renderAt('/account/recover');
    expect(await screen.findByRole('heading', { name: INVALID })).toBeInTheDocument();
    expect(deps.accountSecurityApi.answers.callsOf('checkRecovery')).toEqual([]);
  });

  it('a link that died before the click turns into the dead-link sentence', async () => {
    deps.accountSecurityApi.answers.answer('recover', {
      ok: false,
      failure: { kind: 'recovery_token_invalid' },
    });
    renderAt(LINK);
    await typeAndRecover('senha-nova-1');
    expect(await screen.findByRole('heading', { name: INVALID })).toBeInTheDocument();
  });

  it.each([
    [
      { kind: 'email_taken' },
      'O e-mail antigo já está em outra conta. Fale com quem administra o Lorkarium.',
    ],
    [{ kind: 'rate_limited', retryAfterSeconds: 30 }, 'Muitas tentativas. Tente de novo em 30 s.'],
  ] as const)('a %o refusal shows "%s" and keeps the form', async (failure, message) => {
    deps.accountSecurityApi.answers.answer('recover', { ok: false, failure });
    renderAt(LINK);
    await typeAndRecover('senha-nova-1');
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Senha nova')).toBeInTheDocument();
  });
});
