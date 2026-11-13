import type { CampaignRoleDto, PlanLimits, SessionStateDto } from '@lorkarium/contracts';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { buildRoutes } from '@/app/router';
import { LIBRARY_DRAWER_WIDE_WIDTH } from '@/lib/library-drawer-width';
import type { OpenTable } from '@/stores/open-tables-store';
import type { TestDependencies } from './app-dependencies';
import { ANA } from './auth-api-fake';
import { detailOf, VHARN } from './campaigns-api-fake';
import { vharnBoard, vharnState } from './table-session-fixtures';

export type LibraryRoom = Readonly<{
  router: ReturnType<typeof createMemoryRouter>;
  table: OpenTable;
}>;

export type LibraryRoomOptions = Readonly<{
  role?: CampaignRoleDto;
  state?: SessionStateDto;
  /** The table's plan limits (its owner's); Amigo do Dono's by default. */
  limits?: PlanLimits;
  /** The library drawer width; wide by default, where the tree and the panel sit side by side. */
  libraryWidth?: number;
}>;

/** VHARN's play room, live on the group grid, as the master (or a player with `role`).
 *
 *  Example: `const { table } = await openRoom(deps, { role: 'player' })` */
export async function openRoom(
  deps: TestDependencies,
  {
    role = 'master',
    state = vharnState(),
    limits = VHARN.limits,
    libraryWidth = LIBRARY_DRAWER_WIDE_WIDTH,
  }: LibraryRoomOptions = {},
): Promise<LibraryRoom> {
  deps.roomLayout.getState().setLibraryWidth(libraryWidth);
  deps.authApi.answerMeWith(ANA);
  const joinCode = role === 'master' ? 'VHRN7K2Q' : null;
  deps.campaignsApi.answer('detail', {
    ok: true,
    value: detailOf(VHARN, { myRole: role, joinCode, limits }),
  });
  const router = createMemoryRouter(buildRoutes(deps), {
    initialEntries: [`/campaigns/${VHARN.id}/table`],
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { level: 1 });
  deps.tableSessionApi.emit(
    { kind: 'state', state },
    { kind: 'status', status: 'live' },
    { kind: 'board', state: vharnBoard() },
  );
  await act(() => Promise.resolve());
  const [table] = deps.openTables.getState().tables;
  if (!table) throw new Error('VHARN did not open');
  return { router, table };
}

/** The room with the library open by its "Biblioteca" button, once the list has come.
 *
 *  Example: `const { table } = await openLibrary(deps); screen.getByRole('tree')` */
export async function openLibrary(
  deps: TestDependencies,
  options: LibraryRoomOptions = {},
): Promise<LibraryRoom> {
  const room = await openRoom(deps, options);
  await userEvent.click(screen.getByRole('button', { name: 'Biblioteca' }));
  await screen.findByRole('tree', { name: 'Itens e pastas' });
  return room;
}
