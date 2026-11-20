import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';

const LINK = '/sign-up/confirm#token=abc';
const DEAD = 'Esse link venceu ou já foi usado.';
const TERMS_BOX =
  'Tenho 18 anos ou mais e li e aceito os Termos de uso, a Política de privacidade e a Política de uso';

describe('the sign-up link (/sign-up/confirm)', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.accountLinksApi.answers.answer('inspectInvitation', {
      ok: true,
      value: { email: 'ana@exemplo.com', suggestedUsername: 'ana', origin: 'self' },
    });
  });

  function renderAt(path: string): ReturnType<typeof createMemoryRouter> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    return router;
  }

  it('shows the invitation form titled for the sign-up, for the address of the link', async () => {
    const router = renderAt(LINK);
    expect(await screen.findByRole('heading', { name: 'Crie sua conta' })).toBeInTheDocument();
    expect(await screen.findByText('Cadastro de ana@exemplo.com')).toBeInTheDocument();
    expect(screen.getByLabelText('Seu @')).toHaveValue('ana');
    expect(deps.accountLinksApi.answers.callsOf('inspectInvitation')).toEqual(['abc']);
    await waitFor(() => expect(router.state.location.hash).toBe(''));
  });

  it('the @, the password and the box create the account signed in and go home', async () => {
    const router = renderAt(LINK);
    await userEvent.type(
      await screen.findByLabelText('Senha', { selector: 'input' }),
      'senha-1-boa',
    );
    await userEvent.type(
      screen.getByLabelText('Repita a senha', { selector: 'input' }),
      'senha-1-boa',
    );
    await userEvent.click(screen.getByRole('checkbox', { name: TERMS_BOX }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar minha conta' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(deps.accountLinksApi.answers.callsOf('acceptInvitation')).toEqual([
      {
        token: 'abc',
        username: 'ana',
        password: 'senha-1-boa',
        persistent: false,
        acceptedTerms: true,
      },
    ]);
  });

  it('a dead link says so and offers to ask for another one at /sign-up', async () => {
    deps.accountLinksApi.answers.answer('inspectInvitation', {
      ok: false,
      failure: { kind: 'link_invalid' },
    });
    const router = renderAt(LINK);
    expect(await screen.findByText(DEAD)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Pedir outro' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-up'));
  });

  it('without a token in the link it is dead, and nothing is inspected', async () => {
    renderAt('/sign-up/confirm');
    expect(await screen.findByText(DEAD)).toBeInTheDocument();
    expect(deps.accountLinksApi.answers.callsOf('inspectInvitation')).toEqual([]);
  });

  it('signed in already asks to leave first', async () => {
    deps.authApi.answerMeWith({ ...ANA, username: 'caio' });
    renderAt(LINK);
    expect(
      await screen.findByText(
        'Você já está conectado como @caio. Para criar outra conta, saia primeiro.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Seu @')).not.toBeInTheDocument();
  });
});
