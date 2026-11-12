import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { UserMenu } from '@/app/shell/user-menu';
import { ANA, ROOT_ADMIN } from '../../support/auth-api-fake';

function renderMenu(user = ANA, onSignOut = vi.fn(async () => undefined)) {
  render(
    <MemoryRouter>
      <UserMenu user={user} expanded onSignOut={onSignOut} />
    </MemoryRouter>,
  );
  return onSignOut;
}

describe('UserMenu', () => {
  it('the trigger shows the name of the user and, open, offers "Sair"', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /Ana/ }));
    expect(await screen.findByRole('menuitem', { name: 'Sair' })).toBeInTheDocument();
  });

  it('the trigger shows the avatar of the account: the photo when there is one', () => {
    const avatarId = '3c1b2a09-8f7e-4d6c-9b5a-4e3d2c1b0a99';
    renderMenu({ ...ANA, avatarId });

    const trigger = screen.getByRole('button', { name: 'Ana' });
    expect(within(trigger).getByTestId('avatar-photo')).toHaveAttribute(
      'src',
      `/api/avatars/${avatarId}`,
    );
  });

  it('the trigger without a photo shows the initials over the color of the account', () => {
    renderMenu(ANA);

    const initials = within(screen.getByRole('button', { name: 'Ana' })).getByTestId(
      'avatar-initials',
    );
    expect(initials).toHaveTextContent('AN');
    expect(initials).toHaveStyle({ backgroundColor: '#5cc8c0' });
  });

  it('open, the menu shows the @ with the one seal glued to it, above the e-mail', async () => {
    renderMenu({ ...ANA, plan: 'lenda' });
    await userEvent.click(screen.getByRole('button', { name: /Ana/ }));

    const menu = await screen.findByRole('menu');
    const seal = within(menu).getByRole('img', { name: 'Plano Lenda' });
    expect(within(menu).getByText(`@${ANA.username}`).nextElementSibling).toBe(seal);
    expect(within(menu).queryByRole('img', { name: 'Apoiador' })).toBeNull();
  });

  it('an admin account shows the Admin seal in the menu, whatever the plan', async () => {
    renderMenu({ ...ANA, role: 'admin', plan: 'lenda' });
    await userEvent.click(screen.getByRole('button', { name: /Ana/ }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('img', { name: 'Administrador' })).toBeInTheDocument();
  });

  it('a free account shows no seal in the menu', async () => {
    renderMenu({ ...ANA, plan: 'free' });
    await userEvent.click(screen.getByRole('button', { name: /Ana/ }));

    const menu = await screen.findByRole('menu');
    expect(menu.querySelector('[data-seal]')).toBeNull();
  });

  it('"Minha conta" in the menu leads to /account', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /Ana/ }));

    expect(await screen.findByRole('menuitem', { name: 'Minha conta' })).toHaveAttribute(
      'href',
      '/account',
    );
  });

  it.each([
    ['Termos de uso', '/api/legal/terms'],
    ['Política de privacidade', '/api/legal/privacy'],
  ])('"%s" in the menu opens %s in a new tab', async (name, href) => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /Ana/ }));
    const item = await screen.findByRole('menuitem', { name });
    expect(item).toHaveAttribute('href', href);
    expect(item).toHaveAttribute('target', '_blank');
    expect(item).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('an admin sees "Backoffice" in the menu', async () => {
    renderMenu(ROOT_ADMIN);
    await userEvent.click(screen.getByRole('button', { name: /Admin/ }));
    expect(await screen.findByRole('menuitem', { name: 'Backoffice' })).toBeInTheDocument();
  });

  it('a user does not see "Backoffice"', async () => {
    renderMenu(ANA);
    await userEvent.click(screen.getByRole('button', { name: /Ana/ }));
    await screen.findByRole('menuitem', { name: 'Sair' });
    expect(screen.queryByRole('menuitem', { name: 'Backoffice' })).not.toBeInTheDocument();
  });

  it('"Sair" calls onSignOut once, and opening the menu alone does not', async () => {
    const onSignOut = renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /Ana/ }));
    expect(onSignOut).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sair' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
