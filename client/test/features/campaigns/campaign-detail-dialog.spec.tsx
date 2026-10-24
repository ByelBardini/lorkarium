import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { memberColorCss } from '@/lib/member-color';
import { TEST_NOW, testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { detailOf, QUELM, VHARN } from '../../support/campaigns-api-fake';

const DAY_MS = 24 * 60 * 60 * 1000;

type DetailMembers = ReturnType<typeof detailOf>['members'];

// Marks who is online by name, the rest offline.
function membersOnline(campaign: typeof VHARN, ...names: string[]): DetailMembers {
  return detailOf(campaign).members.map((member) => ({
    ...member,
    online: names.includes(member.name),
  }));
}

describe('campaign detail dialog', () => {
  let deps: TestDependencies;
  let router: ReturnType<typeof createMemoryRouter>;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
  });

  function renderAt(path: string): void {
    router = createMemoryRouter(buildRoutes(deps), { initialEntries: [path] });
    render(<RouterProvider router={router} />);
  }

  async function openDetailOf(
    campaign: typeof VHARN,
    overrides: Parameters<typeof detailOf>[1] = {},
  ): Promise<HTMLElement> {
    deps.campaignsApi.answer('detail', { ok: true, value: detailOf(campaign, overrides) });
    renderAt(`/campaigns/${campaign.id}`);
    return screen.findByRole('dialog', { name: campaign.name });
  }

  function factsOf(dialog: HTMLElement): HTMLElement {
    const facts = within(dialog).getByText('Sistema').closest('dl');
    if (!facts) throw new Error('the facts of the campaign did not render');
    return facts;
  }

  it('shows role, meta, visibility with password and the description', async () => {
    const dialog = await openDetailOf(VHARN, { hasPassword: true });
    expect(dialog).toHaveTextContent('Você mestra');
    expect(dialog).toHaveTextContent('D&D 5e · 3 participantes');
    expect(dialog).toHaveTextContent('Privada · com senha');
    expect(dialog).toHaveTextContent('Um sino toca sozinho na torre de Vharn.');
    expect(deps.campaignsApi.callsOf('detail')).toEqual([VHARN.id]);
  });

  it('a player reads "Você joga" and a public campaign without password reads "Pública"', async () => {
    const dialog = await openDetailOf(QUELM);
    expect(dialog).toHaveTextContent('Você joga');
    expect(dialog).toHaveTextContent('Pública');
    expect(dialog).not.toHaveTextContent('com senha');
  });

  it('lists the participants with the master first', async () => {
    const dialog = await openDetailOf(QUELM);
    const list = within(dialog).getByRole('list', { name: 'Participantes (4)' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Bia');
    expect(items[0]).toHaveTextContent('Mestre');
    expect(items).toHaveLength(4);
  });

  it('each participant shows the avatar: the photo when there is one, else initials in the color', async () => {
    const avatarId = '3c1b2a09-8f7e-4d6c-9b5a-4e3d2c1b0a99';
    const [bia, ana, ...others] = detailOf(QUELM).members;
    if (!bia || !ana) throw new Error('QUELM has no members');
    const dialog = await openDetailOf(QUELM, {
      members: [bia, { ...ana, avatarId, color: 'rose' }, ...others],
    });

    const list = within(dialog).getByRole('list', { name: 'Participantes (4)' });
    const [master, player] = within(list).getAllByRole('listitem');
    if (!master || !player) throw new Error('the participants did not render');
    expect(within(player).getByTestId('avatar-photo')).toHaveAttribute(
      'src',
      `/api/avatars/${avatarId}`,
    );
    const initials = within(master).getByTestId('avatar-initials');
    expect(initials).toHaveTextContent('BI');
    expect(initials).toHaveStyle({ backgroundColor: memberColorCss(bia.color) });
  });

  it('the master sees the code with "Copiar código"', async () => {
    const dialog = await openDetailOf(VHARN);
    expect(within(dialog).getByText('VHRN-7K2Q')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Copiar código' }));
    expect(deps.clipboard.copied).toEqual(['VHRN-7K2Q']);
  });

  it('a player does not see the code', async () => {
    const dialog = await openDetailOf(QUELM);
    expect(within(dialog).queryByText('Código da mesa')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Copiar código' })).not.toBeInTheDocument();
  });

  it('"Entrar na mesa" records the entry and goes to the table', async () => {
    const dialog = await openDetailOf(VHARN);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Entrar na mesa' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/campaigns/${VHARN.id}/table`),
    );
    expect(deps.campaignsApi.callsOf('enter')).toEqual([VHARN.id]);
  });

  it('"Entrar na mesa" in the "Continuar" band does the same', async () => {
    renderAt('/');
    const band = await screen.findByRole('region', { name: 'Continuar' });
    await userEvent.click(within(band).getByRole('button', { name: 'Entrar na mesa' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/campaigns/${VHARN.id}/table`),
    );
    expect(deps.campaignsApi.callsOf('enter')).toEqual([VHARN.id]);
  });

  it('a failed entry stays in the dialog with the reason', async () => {
    deps.campaignsApi.answer('enter', { ok: false, failure: { kind: 'offline' } });
    const dialog = await openDetailOf(VHARN);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Entrar na mesa' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Sem conexão com o servidor',
    );
  });

  it('"Fechar" goes back to / keeping what was typed in the search', async () => {
    renderAt('/');
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Buscar mesa' }), 'vharn');
    await userEvent.click(screen.getByRole('link', { name: /Os Sinos de Vharn/ }));
    const dialog = await screen.findByRole('dialog', { name: VHARN.name });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('searchbox', { name: 'Buscar mesa' })).toHaveValue('vharn');
  });

  it('Esc closes the dialog back to /', async () => {
    await openDetailOf(VHARN);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  describe('no settings in the modal', () => {
    it('the master sees only the overview: no section tabs, no settings form', async () => {
      const dialog = await openDetailOf(VHARN);
      expect(within(dialog).queryByRole('navigation')).not.toBeInTheDocument();
      expect(within(dialog).queryByRole('link', { name: /Configurações/ })).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole('form', { name: 'Configurações da mesa' }),
      ).not.toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Entrar na mesa' })).toBeInTheDocument();
    });

    it('the old /campaigns/:id/settings link is no route any more: it goes to /', async () => {
      deps.campaignsApi.answer('detail', { ok: true, value: detailOf(VHARN) });
      renderAt(`/campaigns/${VHARN.id}/settings`);
      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
      expect(screen.queryByRole('form', { name: 'Configurações da mesa' })).not.toBeInTheDocument();
    });

    it('"Fechar detalhes" (the X) closes back to /', async () => {
      const dialog = await openDetailOf(VHARN);
      await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar detalhes' }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    });
  });

  describe('header', () => {
    it('shows the status badge', async () => {
      const dialog = await openDetailOf(VHARN);
      expect(dialog).toHaveTextContent('Recrutando');
    });

    it('with the master online: "Mestre online · N de M online agora"', async () => {
      const dialog = await openDetailOf(VHARN, { members: membersOnline(VHARN, 'Ana', 'Caio') });
      expect(dialog).toHaveTextContent('Mestre online · 2 de 3 online agora');
    });

    it('with only players online, the count without "Mestre online"', async () => {
      const dialog = await openDetailOf(VHARN, { members: membersOnline(VHARN, 'Caio') });
      expect(dialog).toHaveTextContent('1 de 3 online agora');
      expect(dialog).not.toHaveTextContent('Mestre online');
    });

    it('nobody online says nothing about it', async () => {
      const dialog = await openDetailOf(VHARN);
      expect(dialog).not.toHaveTextContent('online agora');
      expect(dialog).not.toHaveTextContent('Mestre online');
    });
  });

  describe('overview', () => {
    it('a participant online reads "online agora" in their row', async () => {
      const dialog = await openDetailOf(VHARN, { members: membersOnline(VHARN, 'Caio') });
      const list = within(dialog).getByRole('list', { name: 'Participantes (3)' });
      const items = within(list).getAllByRole('listitem');
      const caio = items.find((item) => item.textContent?.includes('Caio'));
      const ana = items.find((item) => item.textContent?.includes('Ana'));
      expect(caio).toHaveTextContent('online agora');
      expect(ana).not.toHaveTextContent('online agora');
    });

    it('shows system, master, last access and creation date', async () => {
      const lastAccessAt = new Date(TEST_NOW.getTime() - 2 * DAY_MS).toISOString();
      const facts = factsOf(await openDetailOf(QUELM, { lastAccessAt }));
      expect(facts).toHaveTextContent('SistemaTormenta20');
      expect(facts).toHaveTextContent('MestreBia');
      expect(facts).toHaveTextContent('Último acessoHá 2 dias');
      expect(facts).toHaveTextContent(/Criada em\d{1,2} de setembro de 2026/);
    });

    it('no last access reads "Ninguém entrou ainda"', async () => {
      const facts = factsOf(await openDetailOf(QUELM, { lastAccessAt: null }));
      expect(facts).toHaveTextContent('Último acessoNinguém entrou ainda');
    });

    it('shows the description, the warnings and the tags', async () => {
      const dialog = await openDetailOf(VHARN);
      expect(within(dialog).getByRole('heading', { name: 'Sobre a mesa' })).toBeInTheDocument();
      const warnings = within(dialog).getByRole('list', { name: 'Avisos de conteúdo' });
      expect(
        within(warnings)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Terror']);
      const tags = within(dialog).getByRole('list', { name: 'Tags' });
      expect(
        within(tags)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Investigação', 'Masmorra']);
    });

    it('without description, warnings or tags those blocks are left out', async () => {
      const dialog = await openDetailOf(QUELM);
      expect(
        within(dialog).queryByRole('heading', { name: 'Sobre a mesa' }),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole('list', { name: 'Avisos de conteúdo' }),
      ).not.toBeInTheDocument();
      expect(within(dialog).queryByRole('list', { name: 'Tags' })).not.toBeInTheDocument();
    });
  });

  it('a campaign the user is not in says so inside the dialog', async () => {
    deps.campaignsApi.answer('detail', { ok: false, failure: { kind: 'not_found' } });
    renderAt(`/campaigns/${QUELM.id}`);
    const dialog = await screen.findByRole('dialog', { name: 'Mesa não encontrada' });
    expect(dialog).toHaveTextContent('Essa mesa não existe ou você não participa dela.');
  });

  it('a session that expired goes back to the login', async () => {
    deps.campaignsApi.answer('detail', { ok: false, failure: { kind: 'unauthenticated' } });
    renderAt(`/campaigns/${QUELM.id}`);
    expect(await screen.findByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
  });
});
