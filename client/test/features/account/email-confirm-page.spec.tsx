import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';

const LINK = '/account/email/confirm#token=tok-123';
const INVALID = 'Esse link venceu ou já foi usado. Peça a troca de novo em Minha conta.';

describe('e-mail confirmation page (/account/email/confirm)', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
  });

  function renderAt(path: string): ReturnType<typeof createMemoryRouter> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    return router;
  }

  it('reads the token from the fragment and takes it off the address', async () => {
    const router = renderAt(LINK);
    expect(
      await screen.findByRole('button', { name: 'Confirmar novo e-mail' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.hash).toBe(''));
    expect(router.state.location.pathname).toBe('/account/email/confirm');
  });

  it('nothing is confirmed before the click (mail scanners open links by themselves)', async () => {
    renderAt(LINK);
    await screen.findByRole('button', { name: 'Confirmar novo e-mail' });
    expect(deps.accountSecurityApi.answers.callsOf('confirmEmail')).toEqual([]);
  });

  it('anonymous: the click confirms with the token and offers "Entrar"', async () => {
    renderAt(LINK);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar novo e-mail' }));
    expect(
      await screen.findByRole('heading', { name: 'Pronto, seu e-mail foi trocado.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login');
    expect(deps.accountSecurityApi.answers.callsOf('confirmEmail')).toEqual([{ token: 'tok-123' }]);
  });

  it('signed in: the click reads the account again and offers "Voltar para as mesas"', async () => {
    deps.authApi.answerMeWith(ANA);
    renderAt(LINK);
    const changed = { ...ANA, email: 'ana@novo.com' };
    await screen.findByRole('button', { name: 'Confirmar novo e-mail' });
    deps.authApi.answerMeWith(changed);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar novo e-mail' }));
    expect(await screen.findByRole('link', { name: 'Voltar para as mesas' })).toHaveAttribute(
      'href',
      '/',
    );
    const session = deps.sessionStore.getState().session;
    expect(session.status === 'authenticated' && session.user.email).toBe('ana@novo.com');
  });

  it('a link that expired or was used says so, without the button', async () => {
    deps.accountSecurityApi.answers.answer('confirmEmail', {
      ok: false,
      failure: { kind: 'email_token_invalid' },
    });
    renderAt(LINK);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar novo e-mail' }));
    expect(await screen.findByRole('heading', { name: INVALID })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar novo e-mail' })).not.toBeInTheDocument();
  });

  it('without a token the page says the same, without the button', async () => {
    renderAt('/account/email/confirm');
    expect(await screen.findByRole('heading', { name: INVALID })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar novo e-mail' })).not.toBeInTheDocument();
  });

  it('an address taken in between is said over the button', async () => {
    deps.accountSecurityApi.answers.answer('confirmEmail', {
      ok: false,
      failure: { kind: 'email_taken' },
    });
    renderAt(LINK);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar novo e-mail' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esse e-mail já está em uso.');
  });
});
