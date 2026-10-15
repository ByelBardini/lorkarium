import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { createSessionStore } from '@/stores/session-store';
import { ANA, AuthApiFake, ROOT_ADMIN } from '../support/auth-api-fake';

describe('app router', () => {
  let api: AuthApiFake;

  beforeEach(() => {
    api = new AuthApiFake();
  });

  function renderAt(path: string): ReturnType<typeof createMemoryRouter> {
    const routes = buildRoutes({ authApi: api, sessionStore: createSessionStore() });
    const router = createMemoryRouter(routes, { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    return router;
  }

  async function signInWith(email: string): Promise<void> {
    await userEvent.type(await screen.findByLabelText('E-mail'), email);
    await userEvent.type(screen.getByLabelText('Senha'), 'qualquer-senha');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  }

  it('a visitor opening / lands on the login form with next=/', async () => {
    const router = renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
    expect(router.state.location.pathname + router.state.location.search).toBe('/login?next=%2F');
  });

  it('an admin signing in with next=/admin reaches the backoffice', async () => {
    api.answerLoginWith({ ok: true, value: ROOT_ADMIN });
    renderAt('/login?next=%2Fadmin');
    await signInWith(ROOT_ADMIN.email);
    expect(await screen.findByRole('heading', { name: 'Backoffice' })).toBeInTheDocument();
  });

  it('a sign-in with next=//evil.com stays in the app, on the home', async () => {
    const router = renderAt('/login?next=%2F%2Fevil.com');
    await signInWith(ANA.email);
    expect(await screen.findByRole('heading', { name: 'Olá, Ana' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('"Sair" on the home logs out on the server and returns to the login', async () => {
    api.answerMeWith(ANA);
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
    expect(api.logoutCalls).toBe(1);
  });

  it('while the first "who am I" is pending, the splash shows and the form does not', async () => {
    const answerMe = api.holdMe();
    renderAt('/login');
    expect(await screen.findByRole('status')).toHaveTextContent('Carregando');
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument();
    answerMe(null);
    expect(await screen.findByLabelText('E-mail')).toBeInTheDocument();
  });

  it('a user opening /admin is sent home', async () => {
    api.answerMeWith(ANA);
    const router = renderAt('/admin');
    expect(await screen.findByRole('heading', { name: 'Olá, Ana' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});
