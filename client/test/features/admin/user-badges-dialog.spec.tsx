import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, TEST_NOW, type TestDependencies } from '../../support/app-dependencies';
import { ROOT_ADMIN } from '../../support/auth-api-fake';
import { FOUNDER_BADGE, NARRATOR_BADGE, VETERAN_BADGE } from '../../support/badges-admin-api-fake';
import { bia } from '../../support/user-admin-api-fake';

const BIA = bia(TEST_NOW);

describe('granting badges from the account menu', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ROOT_ADMIN);
  });

  async function openUsers(): Promise<void> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: ['/admin/users'] });
    render(<RouterProvider router={router} />);
    await screen.findByRole('table', { name: 'Usuários' });
  }

  async function openBadgesOf(person: string, handle: string): Promise<HTMLElement> {
    await userEvent.click(screen.getByRole('button', { name: `Ações de ${person}` }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Insígnias…' }));
    return screen.findByRole('dialog', { name: `Insígnias de ${handle}` });
  }

  it('one box per catalog badge, with image and name, the held ones marked', async () => {
    deps.badgesAdminApi.put(VETERAN_BADGE, NARRATOR_BADGE);
    deps.badgesAdminApi.grants.set(BIA.id, [NARRATOR_BADGE.id]);
    await openUsers();
    const dialog = await openBadgesOf('Bia', '@biaflor');
    expect(await within(dialog).findByRole('checkbox', { name: 'Veterano' })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Narrador' })).toBeChecked();
    const images = within(dialog).getAllByRole('presentation');
    expect(images.map((image) => image.getAttribute('src'))).toEqual([
      `/api/badge-images/${VETERAN_BADGE.imageId}`,
      `/api/badge-images/${NARRATOR_BADGE.imageId}`,
    ]);
    expect(deps.badgesAdminApi.answers.callsOf('grantsOf')).toEqual([BIA.id]);
  });

  it('marking one and "Salvar" sends the whole set and closes with the notice', async () => {
    deps.badgesAdminApi.put(VETERAN_BADGE, NARRATOR_BADGE);
    deps.badgesAdminApi.grants.set(BIA.id, [NARRATOR_BADGE.id]);
    await openUsers();
    const dialog = await openBadgesOf('Bia', '@biaflor');
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: 'Veterano' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Insígnias de @biaflor salvas.')).toHaveAttribute(
      'role',
      'status',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(deps.badgesAdminApi.answers.callsOf('grant')).toEqual([
      { userId: BIA.id, badgeIds: [NARRATOR_BADGE.id, VETERAN_BADGE.id] },
    ]);
  });

  it('unmarking every badge sends an empty set', async () => {
    deps.badgesAdminApi.put(VETERAN_BADGE);
    deps.badgesAdminApi.grants.set(BIA.id, [VETERAN_BADGE.id]);
    await openUsers();
    const dialog = await openBadgesOf('Bia', '@biaflor');
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: 'Veterano' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Insígnias de @biaflor salvas.');
    expect(deps.badgesAdminApi.answers.callsOf('grant')).toEqual([
      { userId: BIA.id, badgeIds: [] },
    ]);
  });

  it('"Salvar" stays off until something changes', async () => {
    deps.badgesAdminApi.put(VETERAN_BADGE);
    await openUsers();
    const dialog = await openBadgesOf('Bia', '@biaflor');
    const veteran = await within(dialog).findByRole('checkbox', { name: 'Veterano' });
    expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await userEvent.click(veteran);
    expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeEnabled();
    await userEvent.click(veteran);
    expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('a badge without image is off with "Sem imagem"', async () => {
    deps.badgesAdminApi.put(VETERAN_BADGE, FOUNDER_BADGE);
    await openUsers();
    const dialog = await openBadgesOf('Bia', '@biaflor');
    const founder = await within(dialog).findByRole('checkbox', { name: 'Fundador' });
    expect(founder).toBeDisabled();
    expect(founder.closest('li')).toHaveTextContent('Sem imagem');
    expect(within(dialog).getByRole('checkbox', { name: 'Veterano' })).toBeEnabled();
  });

  it('an empty catalog points to "Insígnias", without boxes nor "Salvar"', async () => {
    await openUsers();
    const dialog = await openBadgesOf('Bia', '@biaflor');
    expect(await within(dialog).findByRole('link', { name: 'Insígnias' })).toHaveAttribute(
      'href',
      '/admin/badges',
    );
    expect(dialog).toHaveTextContent('Crie uma insígnia em Insígnias primeiro.');
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
  });

  it('the admin\'s own row offers only "Insígnias…" and granting oneself works', async () => {
    deps.badgesAdminApi.put(VETERAN_BADGE);
    await openUsers();
    await userEvent.click(screen.getByRole('button', { name: 'Ações de Lucas' }));
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual(['Insígnias…']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Insígnias…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Insígnias de @lucas' });
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: 'Veterano' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Insígnias de @lucas salvas.');
    expect(deps.badgesAdminApi.answers.callsOf('grant')).toEqual([
      { userId: ROOT_ADMIN.id, badgeIds: [VETERAN_BADGE.id] },
    ]);
  });

  it.each(['badge_without_image', 'not_found'] as const)(
    'a %s on save warns and the dialog reads the catalog again',
    async (kind) => {
      deps.badgesAdminApi.put(VETERAN_BADGE);
      deps.badgesAdminApi.answers.answer('grant', { ok: false, failure: { kind } });
      await openUsers();
      const dialog = await openBadgesOf('Bia', '@biaflor');
      await userEvent.click(await within(dialog).findByRole('checkbox', { name: 'Veterano' }));
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
      expect(
        await within(dialog).findByText(/O catálogo mudou enquanto você marcava/),
      ).toBeVisible();
      await waitFor(() => expect(deps.badgesAdminApi.answers.callsOf('catalog')).toHaveLength(2));
      expect(await within(dialog).findByRole('checkbox', { name: 'Veterano' })).not.toBeChecked();
      expect(screen.getByRole('dialog', { name: 'Insígnias de @biaflor' })).toBeInTheDocument();
    },
  );

  it('a failed load says so and "Tentar de novo" reads again', async () => {
    deps.badgesAdminApi.put(VETERAN_BADGE);
    deps.badgesAdminApi.answers.answer('catalog', { ok: false, failure: { kind: 'offline' } });
    await openUsers();
    const dialog = await openBadgesOf('Bia', '@biaflor');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Não deu para carregar as insígnias.',
    );
    deps.badgesAdminApi.answers.clear('catalog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tentar de novo' }));
    expect(await within(dialog).findByRole('checkbox', { name: 'Veterano' })).toBeInTheDocument();
  });

  it('a lost admin role on save leaves for "Sem acesso"', async () => {
    deps.badgesAdminApi.put(VETERAN_BADGE);
    deps.badgesAdminApi.answers.answer('grant', { ok: false, failure: { kind: 'forbidden' } });
    await openUsers();
    const dialog = await openBadgesOf('Bia', '@biaflor');
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: 'Veterano' }));
    deps.userAdminApi.answers.answer('directory', { ok: false, failure: { kind: 'forbidden' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('heading', { name: 'Sem acesso' })).toBeInTheDocument();
  });
});
