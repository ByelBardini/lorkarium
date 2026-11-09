import { render } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import type { AppDependencies } from '@/app/router';
import { DocumentWorkspaceHost } from '@/features/documents/document-workspace-host';
import { mapWorkspaceKey } from '@/stores/document-workspace-store';
import { detailOf, VHARN } from './campaigns-api-fake';
import { MUNDO_ID } from './library-map-fixtures';

function MapTabTarget({ deps }: Readonly<{ deps: AppDependencies }>): React.JSX.Element {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = mapWorkspaceKey(VHARN.id);
    deps.documentWorkspace.getState().setTarget(key, target.current);
    return () => deps.documentWorkspace.getState().setTarget(key, null);
  }, [deps.documentWorkspace]);
  return <div ref={target} data-testid="room-tab" />;
}

/** Opens the map tab of VHARN on "Mundo", unless told another map.
 *
 *  Example: `openMapTab(deps, REINO_ID, 'Reino')` */
export function openMapTab(deps: AppDependencies, mapId = MUNDO_ID, mapName = 'Mundo'): void {
  deps.documentWorkspace.getState().openMap({ campaign: detailOf(VHARN), mapId, mapName });
}

/** The workspace host with a stand-in for the room's tab, with VHARN's map tab already open.
 *
 *  Example: `openMapTab(deps); renderMapTab(deps)` */
export function renderMapTab(deps: AppDependencies): void {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        Component: () => (
          <>
            <DocumentWorkspaceHost deps={deps} />
            <MapTabTarget deps={deps} />
            <Outlet />
          </>
        ),
      },
    ],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} />);
}
