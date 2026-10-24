import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { memberColorCss } from '@/lib/member-color';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { detailOf, QUELM, VHARN } from '../../support/campaigns-api-fake';

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

  it('shows role, meta, visibility with password and the description', async () => {
    const dialog = await openDetailOf(VHARN, { hasPassword: true });
    expect(dialog).toHaveTextContent('Você mestra');
    expect(dialog).toHaveTextContent('D&D 5e · Recrutando · 3 participantes');
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

    const [master, player] = within(within(dialog).getByRole('list')).getAllByRole('listitem');
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
