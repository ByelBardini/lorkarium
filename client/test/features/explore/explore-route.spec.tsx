import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { PUBLIC_VHARN, QUELM } from '../../support/campaigns-api-fake';

const PROTECTED = {
  ...PUBLIC_VHARN,
  id: '4c5d6e7f-8a9b-4c0d-9e1f-2a3b4c5d6e7f',
  name: 'Cripta Selada',
  system: 'Tormenta20',
  hasPassword: true,
};

describe('explore route ("Explorar mesas")', () => {
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

  it('the rail has "Explorar mesas", which opens the public list', async () => {
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    await userEvent.click(within(nav).getByRole('link', { name: 'Explorar mesas' }));
    expect(await screen.findByRole('heading', { name: 'Explorar mesas' })).toBeInTheDocument();
    expect(screen.getByText('Os Sinos de Vharn')).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Explorar mesas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('"Entrar" on an open campaign joins without asking anything and opens its detail', async () => {
    const router = renderAt('/campaigns/public');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Entrar em Os Sinos de Vharn' }),
    );
    expect(deps.campaignsApi.callsOf('joinPublic')).toEqual([
      { campaignId: PUBLIC_VHARN.id, input: {} },
    ]);
    await screen.findByRole('dialog');
    expect(router.state.location.pathname).toBe(`/campaigns/${PUBLIC_VHARN.id}`);
  });

  it('a protected campaign asks the password first and sends it', async () => {
    deps.campaignsApi.answer('listPublic', { ok: true, value: [PROTECTED] });
    renderAt('/campaigns/public');
    expect(await screen.findByText('com senha')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Entrar em Cripta Selada' }));
    const dialog = await screen.findByRole('dialog', { name: 'Entrar em “Cripta Selada”' });
    expect(deps.campaignsApi.callsOf('joinPublic')).toEqual([]);
    await userEvent.type(within(dialog).getByLabelText('Senha da mesa'), 'sino');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Entrar' }));
    expect(deps.campaignsApi.callsOf('joinPublic')).toEqual([
      { campaignId: PROTECTED.id, input: { password: 'sino' } },
    ]);
  });

  it('a wrong password stays in the dialog, said under the field', async () => {
    deps.campaignsApi.answer('listPublic', { ok: true, value: [PROTECTED] });
    deps.campaignsApi.answer('joinPublic', { ok: false, failure: { kind: 'password_invalid' } });
    renderAt('/campaigns/public');
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar em Cripta Selada' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Senha da mesa'), 'errada');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Entrar' }));
    expect(await within(dialog).findByText('Senha incorreta.')).toBeInTheDocument();
  });

  it('a campaign that stopped being public says so on its row', async () => {
    deps.campaignsApi.answer('joinPublic', { ok: false, failure: { kind: 'not_found' } });
    renderAt('/campaigns/public');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Entrar em Os Sinos de Vharn' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Essa mesa não está mais aberta ao público.',
    );
  });

  it('a campaign the reader is in shows the role and "Abrir" instead of "Entrar"', async () => {
    deps.campaignsApi.answer('listPublic', {
      ok: true,
      value: [{ ...PUBLIC_VHARN, myRole: 'player' }],
    });
    renderAt('/campaigns/public');
    expect(await screen.findByRole('link', { name: 'Abrir Os Sinos de Vharn' })).toHaveAttribute(
      'href',
      `/campaigns/${PUBLIC_VHARN.id}`,
    );
    expect(screen.getByText('Jogador')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Entrar/ })).not.toBeInTheDocument();
  });

  it('the search filters by name or system, and says when nothing matches', async () => {
    deps.campaignsApi.answer('listPublic', { ok: true, value: [PUBLIC_VHARN, PROTECTED] });
    renderAt('/campaigns/public');
    const search = await screen.findByRole('searchbox', { name: 'Buscar mesa pública' });
    await userEvent.type(search, 'tormenta');
    expect(screen.getByText('Cripta Selada')).toBeInTheDocument();
    expect(screen.queryByText('Os Sinos de Vharn')).not.toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.type(search, 'dragão');
    expect(screen.getByText('Nenhuma mesa pública com “dragão”.')).toBeInTheDocument();
  });

  it('no public campaign at all says so', async () => {
    deps.campaignsApi.answer('listPublic', { ok: true, value: [] });
    renderAt('/campaigns/public');
    expect(await screen.findByText('Nenhuma mesa pública por enquanto.')).toBeInTheDocument();
  });

  it('a list that cannot load says so, inside the shell', async () => {
    deps.campaignsApi.answer('listPublic', { ok: false, failure: { kind: 'unexpected' } });
    renderAt('/campaigns/public');
    expect(await screen.findByText('Não deu para carregar as mesas públicas.')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
  });

  it('the detail route of a campaign still answers, apart from /campaigns/public', async () => {
    renderAt(`/campaigns/${QUELM.id}`);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(deps.campaignsApi.callsOf('listPublic')).toEqual([]);
  });
});
