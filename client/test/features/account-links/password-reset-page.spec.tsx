import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';

const LINK = '/reset-password#token=abc';
const DEAD = 'Esse link venceu ou já foi usado. Peça um novo a quem administra o Lorkarium.';

describe('new password by link (/reset-password)', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
  });

  function renderAt(path: string): ReturnType<typeof createMemoryRouter> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    return router;
  }

  async function change(password: string, repeated = password): Promise<void> {
    await userEvent.type(
      await screen.findByLabelText('Senha nova', { selector: 'input' }),
      password,
    );
    await userEvent.type(
      screen.getByLabelText('Repita a senha nova', { selector: 'input' }),
      repeated,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));
  }

  it('names the account and takes the token off the URL', async () => {
    const router = renderAt(LINK);
    expect(
      await screen.findByRole('heading', { name: 'Nova senha para @biaflor' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.hash).toBe(''));
  });

  it('a short password stays in the field without a request; different ones say so', async () => {
    renderAt(LINK);
    await change('1234567');
    expect(screen.getByLabelText('Senha nova', { selector: 'input' })).toHaveAccessibleDescription(
      'A senha precisa de pelo menos 8 caracteres.',
    );
    expect(deps.accountLinksApi.answers.callsOf('completePasswordReset')).toEqual([]);
  });

  it('changed: says so and offers "Entrar" to the login', async () => {
    renderAt(LINK);
    await change('senha-nova-1');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Senha trocada. Entre com a nova senha.',
    );
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login');
    expect(deps.accountLinksApi.answers.callsOf('completePasswordReset')).toEqual([
      { token: 'abc', newPassword: 'senha-nova-1' },
    ]);
  });

  it('opened signed in: the form is the same and the session ends with the change', async () => {
    deps.authApi.answerMeWith(ANA);
    renderAt(LINK);
    await change('senha-nova-1');
    await screen.findByText('Senha trocada. Entre com a nova senha.');
    expect(deps.sessionStore.getState().session.status).toBe('anonymous');
  });

  it('a dead link, or no token, says so without a form', async () => {
    deps.accountLinksApi.answers.answer('inspectPasswordReset', {
      ok: false,
      failure: { kind: 'link_invalid' },
    });
    renderAt(LINK);
    expect(await screen.findByText(DEAD)).toBeInTheDocument();
    expect(screen.queryByLabelText('Senha nova', { selector: 'input' })).toBeNull();
  });

  it('without a token nothing is asked', async () => {
    renderAt('/reset-password');
    expect(await screen.findByText(DEAD)).toBeInTheDocument();
    expect(deps.accountLinksApi.answers.callsOf('inspectPasswordReset')).toEqual([]);
  });
});
