import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';

describe('home route', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
  });

  function renderAt(path: string): ReturnType<typeof createMemoryRouter> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    return router;
  }

  it('lists the campaigns the API answers', async () => {
    renderAt('/');
    expect(await screen.findByRole('link', { name: /Os Sinos de Vharn/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Contrato no Pântano/ })).toBeInTheDocument();
  });

  it('a session that expired goes back to the login with next', async () => {
    deps.campaignsApi.answer('list', { ok: false, failure: { kind: 'unauthenticated' } });
    const router = renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?next=%2F');
  });

  it('offline shows the message and "Tentar de novo", and the retry shows the list', async () => {
    deps.campaignsApi.answer('list', { ok: false, failure: { kind: 'offline' } });
    renderAt('/');
    expect(await screen.findByText(/Sem conexão com o servidor/)).toBeInTheDocument();
    deps.campaignsApi.answer('list', { ok: true, value: [VHARN] });
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('link', { name: /Os Sinos de Vharn/ })).toBeInTheDocument();
  });

  it('a broken answer shows that the campaigns could not be loaded', async () => {
    deps.campaignsApi.answer('list', { ok: false, failure: { kind: 'unexpected' } });
    renderAt('/');
    expect(await screen.findByText('Não deu para carregar suas mesas.')).toBeInTheDocument();
  });

  it('the shell stays around the error, so the user can still navigate', async () => {
    deps.campaignsApi.answer('list', { ok: false, failure: { kind: 'unexpected' } });
    renderAt('/');
    await screen.findByText('Não deu para carregar suas mesas.');
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
  });
});
