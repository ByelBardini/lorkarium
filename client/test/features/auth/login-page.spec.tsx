import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';

describe('the login page (/login)', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(null);
  });

  function renderLogin(): ReturnType<typeof createMemoryRouter> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: ['/login'] });
    render(<RouterProvider router={router} />);
    return router;
  }

  it('with registration open "Criar conta" leads to /sign-up', async () => {
    const router = renderLogin();
    await userEvent.click(await screen.findByRole('link', { name: 'Criar conta' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-up'));
  });

  it('with registration closed there is no "Criar conta"', async () => {
    deps.signUpApi.answers.answer('settings', {
      ok: true,
      value: { registrationOpen: false, humanCheckSiteKey: null },
    });
    renderLogin();
    await screen.findByRole('button', { name: 'Entrar' });
    expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument();
  });

  it('settings that do not arrive leave the login without "Criar conta"', async () => {
    deps.signUpApi.answers.answer('settings', { ok: false, failure: { kind: 'offline' } });
    renderLogin();
    await screen.findByRole('button', { name: 'Entrar' });
    expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument();
  });
});
