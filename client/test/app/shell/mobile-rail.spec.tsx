import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { MobileRail } from '@/app/shell/mobile-rail';
import { ANA } from '../../support/auth-api-fake';

describe('MobileRail', () => {
  function renderDrawer(): void {
    render(
      <MemoryRouter>
        <MobileRail user={ANA} onSignOut={async () => undefined} />
      </MemoryRouter>,
    );
  }

  it('"Abrir menu" opens a dialog with the "Mesas" link', async () => {
    renderDrawer();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByRole('link', { name: 'Mesas' })).toBeInTheDocument();
  });

  it('choosing the link closes the drawer', async () => {
    renderDrawer();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('link', { name: 'Mesas' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
