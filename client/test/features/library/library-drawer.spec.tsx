import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ROOM_LIBRARY_WIDTH_STORAGE_KEY } from '@/stores/room-layout-store';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { VHARN } from '../../support/campaigns-api-fake';
import { openLibrary } from '../../support/library-harness';
import { openLibraryFilters, openTreeMenu, treeItem } from '../../support/library-tree';

const ROOM_PATH = `/campaigns/${VHARN.id}/table`;

describe('the library drawer', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
  });

  function drawer(): HTMLElement {
    return screen.getByRole('complementary', { name: 'Biblioteca' });
  }

  function ruler(): HTMLElement {
    return screen.getByRole('button', { name: 'Régua (R)' });
  }

  function widthHandle(): HTMLElement {
    return within(drawer()).getByRole('separator', { name: 'Largura da biblioteca' });
  }

  it('opens beside the board as a landmark, not a modal: the room is not hidden', async () => {
    await openLibrary(deps);
    expect(drawer()).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Biblioteca' })).toBeNull();
    expect(screen.getByRole('application')).toBeInTheDocument();
    expect(screen.getByRole('application').closest('[aria-hidden="true"], [inert]')).toBeNull();
  });

  it('a press on the board reaches it (focus and room keys) and closes the library', async () => {
    const { router } = await openLibrary(deps);
    await userEvent.click(screen.getByRole('application'));
    expect(screen.getByRole('application')).toHaveFocus();
    await waitFor(() => expect(router.state.location.pathname).toBe(ROOM_PATH));
    await userEvent.keyboard('r');
    expect(ruler()).toHaveAttribute('aria-pressed', 'true');
  });

  it('a press inside the drawer, or in a popover opened from it, keeps it open', async () => {
    const { router } = await openLibrary(deps);
    await userEvent.click(treeItem('Ato 1'));
    const filters = await openLibraryFilters();
    await userEvent.click(within(filters).getByRole('radio', { name: 'Grids' }));
    expect(router.state.location.pathname).toBe(`${ROOM_PATH}/library`);
  });

  it('the "Biblioteca" of the tabs strip toggles it once: the press is not an outside one', async () => {
    const { router } = await openLibrary(deps);
    await userEvent.click(screen.getByRole('button', { name: 'Biblioteca' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(ROOM_PATH));
    await userEvent.click(screen.getByRole('button', { name: 'Biblioteca' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`${ROOM_PATH}/library`));
  });

  it('a room key pressed inside the library stays there: R on a tree item does not pick the ruler', async () => {
    await openLibrary(deps);
    treeItem('Ato 1').focus();
    await userEvent.keyboard('r');
    expect(ruler()).toHaveAttribute('aria-pressed', 'false');
  });

  it('Shift+B inside the library closes it', async () => {
    const { router } = await openLibrary(deps);
    treeItem('Ato 1').focus();
    await userEvent.keyboard('{Shift>}B{/Shift}');
    await waitFor(() => expect(router.state.location.pathname).toBe(ROOM_PATH));
  });

  it('Esc in the search box closes the library', async () => {
    const { router } = await openLibrary(deps);
    await userEvent.click(within(drawer()).getByRole('searchbox', { name: 'Buscar item' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(router.state.location.pathname).toBe(ROOM_PATH));
  });

  it('Esc on a tree item closes the library', async () => {
    const { router } = await openLibrary(deps);
    treeItem('Ato 1').focus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(router.state.location.pathname).toBe(ROOM_PATH));
  });

  it('Esc in the rename field only gives the draft up', async () => {
    const { router } = await openLibrary(deps);
    const menu = await openTreeMenu(treeItem('Ato 1'));
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Renomear' }));
    const field = await screen.findByRole('textbox', { name: 'Nome da pasta' });
    await userEvent.type(field, ' 2{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Nome da pasta' })).toBeNull();
    expect(router.state.location.pathname).toBe(`${ROOM_PATH}/library`);
  });

  it('Esc in the filters popover closes only the popover', async () => {
    const { router } = await openLibrary(deps);
    await openLibraryFilters();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.pathname).toBe(`${ROOM_PATH}/library`);
  });

  it('has no close button of its own: Esc, Shift+B and "Biblioteca" close it', async () => {
    await openLibrary(deps);
    expect(within(drawer()).queryByRole('button', { name: 'Fechar biblioteca' })).toBeNull();
  });

  it('the arrow keys on the edge widen the drawer and the width is remembered', async () => {
    await openLibrary(deps, { libraryWidth: 420 });
    widthHandle().focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(widthHandle()).toHaveAttribute('aria-valuenow', '452');
    expect(deps.roomLayoutStorage.values.get(ROOM_LIBRARY_WIDTH_STORAGE_KEY)).toBe('452');
    await userEvent.keyboard('{ArrowLeft}');
    expect(deps.roomLayoutStorage.values.get(ROOM_LIBRARY_WIDTH_STORAGE_KEY)).toBe('436');
  });

  it('dragging the edge sets the width where the pointer lets go, at least 320 px', async () => {
    await openLibrary(deps, { libraryWidth: 420 });
    fireEvent.pointerDown(widthHandle(), { clientX: 420, pointerId: 1 });
    fireEvent.pointerMove(widthHandle(), { clientX: 600, pointerId: 1 });
    expect(widthHandle()).toHaveAttribute('aria-valuenow', '600');
    fireEvent.pointerUp(widthHandle(), { clientX: 600, pointerId: 1 });
    expect(deps.roomLayoutStorage.values.get(ROOM_LIBRARY_WIDTH_STORAGE_KEY)).toBe('600');
    fireEvent.pointerDown(widthHandle(), { clientX: 600, pointerId: 1 });
    fireEvent.pointerUp(widthHandle(), { clientX: 100, pointerId: 1 });
    expect(deps.roomLayoutStorage.values.get(ROOM_LIBRARY_WIDTH_STORAGE_KEY)).toBe('320');
  });

  it('a pointer moving over the edge without a press changes nothing', async () => {
    await openLibrary(deps, { libraryWidth: 420 });
    fireEvent.pointerMove(widthHandle(), { clientX: 700, pointerId: 1 });
    expect(widthHandle()).toHaveAttribute('aria-valuenow', '420');
    expect(deps.roomLayoutStorage.values.get(ROOM_LIBRARY_WIDTH_STORAGE_KEY)).toBe('420');
  });
});
