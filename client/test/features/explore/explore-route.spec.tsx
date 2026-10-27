import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA, ROOT_ADMIN } from '../../support/auth-api-fake';
import { PUBLIC_VHARN, QUELM } from '../../support/campaigns-api-fake';

const QUELM_PUBLIC = {
  ...PUBLIC_VHARN,
  id: QUELM.id,
  name: QUELM.name,
  ownerId: QUELM.ownerId,
};

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

  async function openDetails(name: string): Promise<HTMLElement> {
    await userEvent.click(await screen.findByRole('button', { name: `Detalhes de ${name}` }));
    return screen.findByRole('dialog', { name });
  }

  it('a campaign the reader is not in offers only "Detalhes" on its row, never a direct "Entrar"', async () => {
    renderAt('/campaigns/public');
    expect(
      await screen.findByRole('button', { name: 'Detalhes de Os Sinos de Vharn' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Entrar/ })).not.toBeInTheDocument();
  });

  it('"Detalhes" shows what the list knows, without joining', async () => {
    renderAt('/campaigns/public');
    const dialog = await openDetails('Os Sinos de Vharn');
    expect(within(dialog).getByText('Pública')).toBeInTheDocument();
    expect(within(dialog).getByText(/Mestre: Bia/)).toBeInTheDocument();
    expect(within(dialog).getByText('Um sino toca sozinho na torre de Vharn.')).toBeInTheDocument();
    expect(within(dialog).getByRole('list', { name: 'Tags' })).toHaveTextContent('Masmorra');
    expect(within(dialog).getByRole('list', { name: 'Avisos de conteúdo' })).toBeInTheDocument();
    expect(deps.campaignsApi.callsOf('joinPublic')).toEqual([]);
  });

  it('"Fechar" closes the details and joins nothing', async () => {
    renderAt('/campaigns/public');
    const dialog = await openDetails('Os Sinos de Vharn');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(deps.campaignsApi.callsOf('joinPublic')).toEqual([]);
  });

  it('"Entrar" in the details of an open campaign joins without asking anything and opens its detail', async () => {
    const router = renderAt('/campaigns/public');
    const dialog = await openDetails('Os Sinos de Vharn');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Entrar' }));
    expect(deps.campaignsApi.callsOf('joinPublic')).toEqual([
      { campaignId: PUBLIC_VHARN.id, input: {} },
    ]);
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe(`/campaigns/${PUBLIC_VHARN.id}`),
    );
  });

  it('a protected campaign asks the password first and sends it', async () => {
    deps.campaignsApi.answer('listPublic', { ok: true, value: [PROTECTED] });
    renderAt('/campaigns/public');
    expect(await screen.findByText('com senha')).toBeInTheDocument();
    const details = await openDetails('Cripta Selada');
    await userEvent.click(within(details).getByRole('button', { name: 'Entrar' }));
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
    const details = await openDetails('Cripta Selada');
    await userEvent.click(within(details).getByRole('button', { name: 'Entrar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Entrar em “Cripta Selada”' });
    await userEvent.type(within(dialog).getByLabelText('Senha da mesa'), 'errada');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Entrar' }));
    expect(await within(dialog).findByText('Senha incorreta.')).toBeInTheDocument();
  });

  it('cancelling the password goes back to the details', async () => {
    deps.campaignsApi.answer('listPublic', { ok: true, value: [PROTECTED] });
    renderAt('/campaigns/public');
    const details = await openDetails('Cripta Selada');
    await userEvent.click(within(details).getByRole('button', { name: 'Entrar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Entrar em “Cripta Selada”' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByRole('dialog', { name: 'Cripta Selada' })).toBeInTheDocument();
  });

  it('a campaign that stopped being public says so in its details', async () => {
    deps.campaignsApi.answer('joinPublic', { ok: false, failure: { kind: 'not_found' } });
    renderAt('/campaigns/public');
    const dialog = await openDetails('Os Sinos de Vharn');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Entrar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Essa mesa não está mais aberta ao público.',
    );
  });

  it('a private campaign (listed for an admin) says so on its row and in its details', async () => {
    deps.campaignsApi.answer('listPublic', {
      ok: true,
      value: [{ ...PUBLIC_VHARN, visibility: 'private' }],
    });
    renderAt('/campaigns/public');
    expect(await screen.findByText('privada')).toBeInTheDocument();
    const dialog = await openDetails('Os Sinos de Vharn');
    expect(within(dialog).getByText('Privada')).toBeInTheDocument();
  });

  it('a campaign the reader is in shows the role, and its "Detalhes" opens the full detail over the list', async () => {
    deps.campaignsApi.answer('listPublic', {
      ok: true,
      value: [{ ...PUBLIC_VHARN, myRole: 'player' }],
    });
    renderAt('/campaigns/public');
    expect(await screen.findByText('Jogador')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Abrir/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Detalhes de Os Sinos de Vharn' })).toHaveAttribute(
      'href',
      `/campaigns/public/${PUBLIC_VHARN.id}`,
    );
  });

  describe('"Entrar como juggernaut" (admin)', () => {
    const PRIVATE = { ...PUBLIC_VHARN, visibility: 'private' as const };
    const OWN = { ...QUELM_PUBLIC, ownerId: ROOT_ADMIN.id, myRole: 'master' as const };
    const juggernautOf = (name: string) =>
      screen.queryByRole('button', { name: `Entrar como juggernaut em ${name}` });

    beforeEach(() => {
      deps.authApi.answerMeWith(ROOT_ADMIN);
      deps.campaignsApi.answer('listPublic', { ok: true, value: [PRIVATE, OWN] });
    });

    it('an admin sees it on a private campaign they are not in, never on their own', async () => {
      renderAt('/campaigns/public');

      expect(
        await screen.findByRole('button', { name: /^Entrar como juggernaut em Os Sinos/ }),
      ).toHaveTextContent('Entrar como juggernaut');
      expect(juggernautOf(OWN.name)).toBeNull();
    });

    it('clicking it turns the mode on and opens the detail of the campaign', async () => {
      const router = renderAt('/campaigns/public');

      await userEvent.click(await screen.findByRole('button', { name: /^Entrar como juggernaut/ }));

      expect(deps.campaignsApi.callsOf('startJuggernaut')).toEqual([PRIVATE.id]);
      await vi.waitFor(() =>
        expect(router.state.location.pathname).toBe(`/campaigns/${PRIVATE.id}`),
      );
    });

    it('a refusal (409 ALREADY_OWNER) is said in the row', async () => {
      deps.campaignsApi.answer('startJuggernaut', {
        ok: false,
        failure: { kind: 'already_owner' },
      });
      renderAt('/campaigns/public');

      await userEvent.click(await screen.findByRole('button', { name: /^Entrar como juggernaut/ }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Você já é o dono desta mesa.');
    });

    it('an account that is not admin never sees it', async () => {
      deps.authApi.answerMeWith(ANA);
      renderAt('/campaigns/public');

      expect(await screen.findByText(PRIVATE.name)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Entrar como juggernaut/ })).toBeNull();
    });
  });

  async function searchFor(text: string): Promise<void> {
    const box = await screen.findByRole('searchbox', { name: 'Buscar mesa pública' });
    await userEvent.clear(box);
    if (text) await userEvent.type(box, text);
    await userEvent.click(screen.getByRole('button', { name: 'Pesquisar' }));
  }

  async function openFilters(): Promise<void> {
    await userEvent.click(await screen.findByRole('button', { name: /^Filtros/ }));
  }

  it('the search only applies on "Pesquisar", by a piece of the name', async () => {
    deps.campaignsApi.answer('listPublic', { ok: true, value: [PUBLIC_VHARN, PROTECTED] });
    renderAt('/campaigns/public');
    await userEvent.type(await screen.findByRole('searchbox'), 'cripta');
    expect(screen.getByText('Os Sinos de Vharn')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pesquisar' }));
    expect(screen.getByText('Cripta Selada')).toBeInTheDocument();
    expect(screen.queryByText('Os Sinos de Vharn')).not.toBeInTheDocument();
    await searchFor('dragão');
    expect(screen.getByText('Nenhuma mesa pública com “dragão”.')).toBeInTheDocument();
  });

  it('the @ of the master finds their campaigns only when written in full', async () => {
    const caio = { ...PROTECTED, masterName: 'Caio', masterUsername: 'caio' };
    deps.campaignsApi.answer('listPublic', { ok: true, value: [PUBLIC_VHARN, caio] });
    renderAt('/campaigns/public');
    await searchFor('@bia');
    expect(screen.getByText('Os Sinos de Vharn')).toBeInTheDocument();
    expect(screen.queryByText('Cripta Selada')).not.toBeInTheDocument();
    await searchFor('cai');
    expect(screen.getByText('Nenhuma mesa pública com “cai”.')).toBeInTheDocument();
  });

  it('a status chosen in "Filtros" applies with the search', async () => {
    const recruiting = { ...PROTECTED, status: 'recruiting' as const };
    const vharn = { ...PUBLIC_VHARN, status: 'ongoing' as const };
    deps.campaignsApi.answer('listPublic', { ok: true, value: [vharn, recruiting] });
    renderAt('/campaigns/public');
    await openFilters();
    await userEvent.click(screen.getByRole('radio', { name: 'Recrutando' }));
    expect(screen.getByText('Os Sinos de Vharn')).toBeInTheDocument();
    await searchFor('');
    expect(screen.getByText('Cripta Selada')).toBeInTheDocument();
    expect(screen.queryByText('Os Sinos de Vharn')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Filtros/ })).toHaveTextContent('1');
  });

  it('the online filters keep the tables with the master or players there, and the card says who', async () => {
    const withMaster = { ...PUBLIC_VHARN, masterOnline: true };
    const withPlayers = { ...PROTECTED, playersOnline: 2 };
    deps.campaignsApi.answer('listPublic', { ok: true, value: [withMaster, withPlayers] });
    renderAt('/campaigns/public');
    expect(await screen.findByText('Mestre online')).toBeInTheDocument();
    expect(screen.getByText('2 jogadores online')).toBeInTheDocument();
    await openFilters();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Com mestre online' }));
    await searchFor('');
    expect(screen.queryByText('Cripta Selada')).not.toBeInTheDocument();
    await openFilters();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Com jogadores online' }));
    await searchFor('');
    expect(screen.getByText('Nenhuma mesa pública com esses filtros.')).toBeInTheDocument();
  });

  it('only an admin gets the visibility filter, which splits public from private', async () => {
    deps.authApi.answerMeWith(ROOT_ADMIN);
    const hidden = { ...PROTECTED, visibility: 'private' as const };
    deps.campaignsApi.answer('listPublic', { ok: true, value: [PUBLIC_VHARN, hidden] });
    renderAt('/campaigns/public');
    await openFilters();
    await userEvent.click(screen.getByRole('radio', { name: 'Privadas' }));
    await searchFor('');
    expect(screen.getByText('Cripta Selada')).toBeInTheDocument();
    expect(screen.queryByText('Os Sinos de Vharn')).not.toBeInTheDocument();
  });

  it('a reader who is not admin has no visibility filter', async () => {
    deps.campaignsApi.answer('listPublic', { ok: true, value: [PUBLIC_VHARN] });
    renderAt('/campaigns/public');
    await openFilters();
    expect(screen.getByRole('radio', { name: 'Recrutando' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Privadas' })).not.toBeInTheDocument();
  });

  it('more than twelve campaigns split into pages', async () => {
    const many = Array.from({ length: 13 }, (_, index) => ({
      ...PUBLIC_VHARN,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      name: `Mesa ${index + 1}`,
    }));
    deps.campaignsApi.answer('listPublic', { ok: true, value: many });
    renderAt('/campaigns/public');
    expect(await screen.findByText('Página 1 de 2')).toBeInTheDocument();
    expect(screen.queryByText('Mesa 13')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(screen.getByText('Mesa 13')).toBeInTheDocument();
    expect(screen.queryByText('Mesa 1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();
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
