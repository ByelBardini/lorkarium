import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLibraryToggle, type LibraryToggle } from '@/features/board/use-library-toggle';
import { VHARN } from '../../support/campaigns-api-fake';

const ROOM = `/campaigns/${VHARN.id}/table`;

function routerAt(path: string, seen: { toggle: LibraryToggle | null }) {
  function Probe(): null {
    seen.toggle = useLibraryToggle(VHARN.id);
    return null;
  }
  const routes: RouteObject[] = [{ path: '*', element: <Probe /> }];
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('useLibraryToggle', () => {
  it('in the room it is closed, and toggle goes to the library', () => {
    const seen: { toggle: LibraryToggle | null } = { toggle: null };
    const router = routerAt(ROOM, seen);
    expect(seen.toggle?.open).toBe(false);
    act(() => seen.toggle?.toggle());
    expect(router.state.location.pathname).toBe(`${ROOM}/library`);
    expect(seen.toggle?.open).toBe(true);
  });

  it('in the library toggle goes back to the room', () => {
    const seen: { toggle: LibraryToggle | null } = { toggle: null };
    const router = routerAt(`${ROOM}/library`, seen);
    act(() => seen.toggle?.toggle());
    expect(router.state.location.pathname).toBe(ROOM);
  });
});
