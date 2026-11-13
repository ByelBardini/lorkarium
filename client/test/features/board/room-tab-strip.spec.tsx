import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { VHARN } from '../../support/campaigns-api-fake';
import { masterLibrary } from '../../support/library-fixtures';
import { openRoom } from '../../support/library-harness';

const TABLE_PATH = `/campaigns/${VHARN.id}/table`;

describe('the strip of tabs of the room', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.libraryApi.answer('list', { ok: true, value: masterLibrary() });
  });

  const strip = (): HTMLElement => screen.getByRole('region', { name: 'Abas da sala' });
  const libraryButton = (): HTMLElement =>
    within(strip()).getByRole('button', { name: 'Biblioteca' });

  it('"Biblioteca" opens the library and is pressed; again it goes back to the room', async () => {
    const { router } = await openRoom(deps);
    expect(libraryButton()).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(libraryButton());
    await screen.findByRole('tree', { name: 'Itens e pastas' });
    expect(router.state.location.pathname).toBe(`${TABLE_PATH}/library`);
    expect(screen.getByRole('button', { name: 'Biblioteca', hidden: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Biblioteca', hidden: true }));
    await waitFor(() => expect(router.state.location.pathname).toBe(TABLE_PATH));
  });

  it('says its key, Shift+B, which opens the library from the board', async () => {
    const { router } = await openRoom(deps);
    expect(libraryButton()).toHaveAttribute('aria-keyshortcuts', 'Shift+B');
    fireEvent.keyDown(document.body, { key: 'B', shiftKey: true });
    await waitFor(() => expect(router.state.location.pathname).toBe(`${TABLE_PATH}/library`));
  });

  it('has no "+" of its own: grids open from the library', async () => {
    await openRoom(deps);
    expect(within(strip()).queryByRole('button', { name: 'Abrir um grid' })).toBeNull();
  });

  it('the tabs of the open grids live in the strip', async () => {
    await openRoom(deps);
    expect(within(strip()).getByRole('tablist', { name: 'Grids abertos' })).toBeInTheDocument();
  });
});
