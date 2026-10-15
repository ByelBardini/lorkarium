import { render, screen } from '@testing-library/react';
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
