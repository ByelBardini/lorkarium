import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { ANA, ROOT_ADMIN } from '../support/auth-api-fake';
import { testDependencies, type TestDependencies } from '../support/app-dependencies';
import { VHARN } from '../support/campaigns-api-fake';
import { VHARN_CAST_ID } from '../support/cast-fixtures';

describe('app router', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
  });

  function renderAt(path: string): ReturnType<typeof createMemoryRouter> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    return router;
  }

  async function signInWith(email: string): Promise<void> {
    await userEvent.type(await screen.findByLabelText('E-mail ou usuário'), email);
    await userEvent.type(screen.getByLabelText('Senha'), 'qualquer-senha');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  }

  it('a visitor opening / lands on the login form with next=/', async () => {
    const router = renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
    expect(router.state.location.pathname + router.state.location.search).toBe('/login?next=%2F');
  });

  it('an admin signing in with next=/admin reaches the backoffice', async () => {
    deps.authApi.answerLoginWith({ ok: true, value: ROOT_ADMIN });
    renderAt('/login?next=%2Fadmin');
    await signInWith(ROOT_ADMIN.email);
    expect(await screen.findByRole('heading', { name: 'Usuários' })).toBeInTheDocument();
  });

  it('a sign-in with next=//evil.com stays in the app, on the home', async () => {
    const router = renderAt('/login?next=%2F%2Fevil.com');
    await signInWith(ANA.email);
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('signed in at /, the shell shows the "Principal" nav and a heading with the name', async () => {
    deps.authApi.answerMeWith(ANA);
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('link', { name: 'Mesas' })).toBeInTheDocument();
  });

  it('"Sair" in the user menu logs out on the server and returns to the login', async () => {
    deps.authApi.answerMeWith(ANA);
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: /Ana/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sair' }));
    expect(await screen.findByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
    expect(deps.authApi.logoutCalls).toBe(1);
  });

  it('while the first "who am I" is pending, the splash shows and the form does not', async () => {
    const answerMe = deps.authApi.holdMe();
    renderAt('/login');
    expect(await screen.findByRole('status')).toHaveTextContent('Carregando');
    expect(screen.queryByLabelText('E-mail ou usuário')).not.toBeInTheDocument();
    answerMe(null);
    expect(await screen.findByLabelText('E-mail ou usuário')).toBeInTheDocument();
  });

  describe('a server that does not answer the first "who am I" (a deploy)', () => {
    it('keeps the splash saying it is reconnecting, never the login', async () => {
      deps.authApi.failMeWith({ kind: 'unexpected' });
      renderAt('/');
      expect(await screen.findByRole('status')).toHaveTextContent('Reconectando ao servidor…');
      expect(screen.queryByLabelText('E-mail ou usuário')).not.toBeInTheDocument();
      expect(deps.retryWaits.waited).toEqual([1000]);
    });

    it('opens the home of the remembered session once the server answers', async () => {
      deps.authApi.failMeWith({ kind: 'offline' }, { kind: 'unexpected' }).answerMeWith(ANA);
      const router = renderAt('/');
      await waitFor(() => expect(deps.retryWaits.waited).toEqual([1000]));
      deps.retryWaits.release();
      await waitFor(() => expect(deps.retryWaits.waited).toEqual([1000, 2000]));
      deps.retryWaits.release();
      expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/');
      expect(deps.authApi.meCalls).toBe(3);
    });

    it('lands on the login only when the server itself answers no session', async () => {
      deps.authApi.failMeWith({ kind: 'offline' });
      const router = renderAt('/');
      await waitFor(() => expect(deps.retryWaits.waited).toEqual([1000]));
      deps.retryWaits.release();
      expect(await screen.findByLabelText('E-mail ou usuário')).toBeInTheDocument();
      expect(router.state.location.pathname + router.state.location.search).toBe('/login?next=%2F');
    });
  });

  it('on the desktop shell the login comes with "Manter conectado" checked', async () => {
    deps = { ...deps, isDesktop: true };
    renderAt('/login');
    expect(await screen.findByRole('checkbox', { name: 'Manter conectado' })).toBeChecked();
  });

  it('in the browser the login comes with "Manter conectado" unchecked', async () => {
    renderAt('/login');
    expect(await screen.findByRole('checkbox', { name: 'Manter conectado' })).not.toBeChecked();
  });

  it('a user opening /admin is sent home', async () => {
    deps.authApi.answerMeWith(ANA);
    const router = renderAt('/admin');
    expect(await screen.findByRole('heading', { level: 1, name: /Ana/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('an admin opening /admin lands on the users of the backoffice', async () => {
    deps.authApi.answerMeWith(ROOT_ADMIN);
    const router = renderAt('/admin');
    expect(await screen.findByRole('heading', { name: 'Usuários' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/users');
  });

  describe('open tables of the tab', () => {
    const VHARN_TABLE = { campaignId: VHARN.id, name: VHARN.name, castSceneId: VHARN_CAST_ID };

    beforeEach(() => {
      deps.tabStorage.values.set(
        'lorkarium.openTables',
        JSON.stringify({ userId: ANA.id, tables: [VHARN_TABLE] }),
      );
    });

    it('after an F5 at /, the shell reopens the tables of the tab once, and navigating does not reopen them', async () => {
      deps.authApi.answerMeWith(ANA);
      const router = renderAt('/');
      await screen.findByRole('heading', { level: 1, name: /Ana/ });
      await router.navigate(`/campaigns/${VHARN.id}`);
      await screen.findByRole('dialog');
      expect(deps.tableSessionApi.opened).toEqual([VHARN.id]);
    });

    it('a visitor at /login reopens nothing', async () => {
      renderAt('/login');
      await screen.findByRole('heading', { name: 'Bem-vindo de volta' });
      expect(deps.tableSessionApi.opened).toEqual([]);
    });

    it('"Sair" closes every open table before logging out on the server and clears the tab list', async () => {
      deps.authApi.answerMeWith(ANA);
      renderAt('/');
      await userEvent.click(await screen.findByRole('button', { name: /Ana/ }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Sair' }));
      await screen.findByRole('heading', { name: 'Bem-vindo de volta' });
      expect(deps.journal.entries).toEqual([`close:${VHARN.id}`, 'logout']);
      expect(deps.tabStorage.values.has('lorkarium.openTables')).toBe(false);
    });

    it('a session refused at an open table while at / signs out and goes to the login with next=/', async () => {
      deps.authApi.answerMeWith(ANA);
      const router = renderAt('/');
      await screen.findByRole('heading', { level: 1, name: /Ana/ });
      deps.tableSessionApi.emitTo(VHARN.id, { kind: 'failed', failure: 'unauthenticated' });
      await waitFor(() =>
        expect(router.state.location.pathname + router.state.location.search).toBe(
          '/login?next=%2F',
        ),
      );
    });
  });

  describe('the text field menu at the root', () => {
    it('on the desktop shell a right click on the login e-mail opens the field menu', async () => {
      deps = { ...deps, isDesktop: true };
      renderAt('/login');
      fireEvent.contextMenu(await screen.findByLabelText('E-mail ou usuário'));
      expect(await screen.findByRole('menuitem', { name: /Colar/ })).toBeInTheDocument();
    });

    it('in the browser the same right click is left to the browser menu', async () => {
      renderAt('/login');
      expect(fireEvent.contextMenu(await screen.findByLabelText('E-mail ou usuário'))).toBe(true);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });
});
