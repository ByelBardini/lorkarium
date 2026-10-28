import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { LYRA_ID, vharnBoard, vharnState } from '../../support/table-session-fixtures';
import { shapeshiftingLyra } from '../../support/token-form-fixtures';

describe('play room: token forms', () => {
  let deps: TestDependencies;

  beforeEach(async () => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
    const router = createMemoryRouter(buildRoutes(deps), {
      initialEntries: [`/campaigns/${VHARN.id}/table`],
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1 });
    deps.tableSessionApi.emit(
      { kind: 'state', state: vharnState() },
      { kind: 'status', status: 'live' },
      { kind: 'board', state: vharnBoard({ tokens: [shapeshiftingLyra()] }) },
    );
    await act(() => Promise.resolve());
  });

  it('"Trocar forma ▸ Editar formas…" opens "Editar token" of Lyra on the Formas tab', async () => {
    deps.boardRenderers
      .latest()
      .emit({ kind: 'tokenMenuRequested', tokenId: LYRA_ID, x: 200, y: 120 });
    const menu = await screen.findByRole('menu', { name: 'Ações de Lyra' });
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Trocar forma' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar formas…' }));

    const dialog = await screen.findByRole('dialog', { name: 'Editar token' });
    expect(within(dialog).getByRole('tab', { name: /^Formas/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('"Editar token" from elsewhere still opens on the Básico tab', async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Novo token' }));

    const dialog = await screen.findByRole('dialog', { name: 'Novo token' });
    expect(within(dialog).getByRole('tab', { name: 'Básico' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
