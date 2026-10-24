import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA, ROOT_ADMIN } from '../../support/auth-api-fake';
import { lucasAdmin } from '../../support/user-admin-api-fake';

describe('backoffice users (/admin/users)', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ROOT_ADMIN);
  });

  function renderAt(path: string): ReturnType<typeof createMemoryRouter> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    return router;
  }

  async function table(): Promise<HTMLElement> {
    return screen.findByRole('table', { name: 'Usuários' });
  }

  function rowOf(text: string | RegExp): HTMLElement {
    const cell = screen.getByText(text);
    const row = cell.closest('tr');
    if (!row) throw new Error(`no row holds ${String(text)}`);
    return row;
  }

  describe('frame', () => {
    it('/admin lands on /admin/users with the side, the way back and who is signed in', async () => {
      const router = renderAt('/admin');
      await table();
      expect(router.state.location.pathname).toBe('/admin/users');
      const nav = screen.getByRole('navigation', { name: 'Backoffice' });
      expect(within(nav).getByRole('link', { name: 'Usuários' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(screen.getByRole('link', { name: 'Voltar para o app' })).toHaveAttribute('href', '/');
      expect(screen.getAllByText(ROOT_ADMIN.name).length).toBeGreaterThan(0);
      await waitFor(() => expect(document.title).toBe('Lorkarium · Usuários'));
    });

    it('a player at /admin is sent home (the guard)', async () => {
      deps.authApi.answerMeWith(ANA);
      const router = renderAt('/admin/users');
      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    });
  });

  describe('the table', () => {
    it('one row per account and invitation, with role, status, tables and last access', async () => {
      renderAt('/admin/users');
      await table();
      expect(rowOf('@biaflor')).toHaveTextContent(/bia@exemplo\.com.*Usuário.*Ativo.*2.*há 3 h/);
      expect(rowOf('@pedrinho')).toHaveTextContent(/Suspenso.*nunca entrou/);
      expect(rowOf('marina@exemplo.com')).toHaveTextContent(/Convidado.*convite há 2 dias/);
      expect(rowOf('joao@exemplo.com')).toHaveTextContent(
        /Admin.*Convite vencido.*venceu há 1 dia/,
      );
    });

    it('the own row says "você" and has no actions', async () => {
      renderAt('/admin/users');
      await table();
      const own = rowOf('@lucas');
      expect(own).toHaveTextContent('você');
      expect(within(own).queryByRole('button')).toBeNull();
      expect(screen.getByRole('button', { name: 'Ações de Bia' })).toBeInTheDocument();
    });

    it('the foot counts the rows', async () => {
      renderAt('/admin/users');
      await table();
      expect(screen.getByText('5 usuários')).toBeInTheDocument();
    });
  });

  describe('search and filters', () => {
    it('typing "bia" keeps only Bia and writes ?q=bia', async () => {
      const router = renderAt('/admin/users');
      await table();
      await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar usuário' }), 'bia');
      expect(within(await table()).getAllByRole('row')).toHaveLength(2);
      expect(router.state.location.search).toBe('?q=bia');
      expect(screen.getByText('1 de 5 usuários')).toBeInTheDocument();
    });

    it('?status=suspended shows only Pedro, with "Suspensos 1" pressed', async () => {
      renderAt('/admin/users?status=suspended');
      await table();
      expect(screen.getByRole('button', { name: 'Suspensos 1' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByText('@pedrinho')).toBeInTheDocument();
      expect(screen.queryByText('@biaflor')).toBeNull();
    });

    it('the role "Admin" leaves the admins: "2 de 5 usuários"', async () => {
      renderAt('/admin/users');
      await table();
      await userEvent.click(screen.getByRole('radio', { name: 'Admin' }));
      // The role lives in the URL: the footer follows the navigation.
      expect(await screen.findByText('2 de 5 usuários')).toBeInTheDocument();
    });

    it('a filter with no row says so, and "Limpar filtros" brings everything back', async () => {
      const router = renderAt('/admin/users?q=ninguem');
      expect(await screen.findByText('Ninguém com esse filtro.')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
      expect(await screen.findByText('5 usuários')).toBeInTheDocument();
      expect(router.state.location.search).toBe('');
    });

    it('only the admin in the list invites to start', async () => {
      deps.userAdminApi.users = [lucasAdmin(new Date())];
      deps.userAdminApi.invitations = [];
      renderAt('/admin/users');
      expect(
        await screen.findByText('Só você por aqui. Convide alguém para começar.'),
      ).toBeInTheDocument();
    });
  });

  describe('load failures', () => {
    it('offline says "Sem conexão" and "Tentar de novo" loads again', async () => {
      deps.userAdminApi.answers.answer('directory', { ok: false, failure: { kind: 'offline' } });
      renderAt('/admin/users');
      expect(await screen.findByRole('heading', { name: 'Sem conexão' })).toBeInTheDocument();
      deps.userAdminApi.answers.clear('directory');
      await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
      expect(await table()).toBeInTheDocument();
    });

    it('a fallen session goes to the login with next=/admin/users', async () => {
      deps.userAdminApi.answers.answer('directory', {
        ok: false,
        failure: { kind: 'unauthenticated' },
      });
      const router = renderAt('/admin/users');
      await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
      expect(router.state.location.search).toBe('?next=%2Fadmin%2Fusers');
    });

    it('a role taken away says "Você não tem mais acesso ao backoffice."', async () => {
      deps.userAdminApi.answers.answer('directory', { ok: false, failure: { kind: 'forbidden' } });
      renderAt('/admin/users');
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Você não tem mais acesso ao backoffice.',
      );
      const main = screen.getByRole('main');
      expect(within(main).getByRole('link', { name: 'Voltar para o app' })).toHaveAttribute(
        'href',
        '/',
      );
      expect(deps.sessionStore.getState().session).toMatchObject({ user: { role: 'user' } });
    });
  });
});
