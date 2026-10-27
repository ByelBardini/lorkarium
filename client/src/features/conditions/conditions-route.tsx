import { useMemo } from 'react';
import { Navigate, useRouteLoaderData, type RouteObject } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import type { AppDependencies } from '@/app/router';
import { RoomCoverPage } from '@/components/room-cover-page';
import type { CampaignLoaderData } from '@/features/campaigns/campaign-loader-data';
import { UNEXPECTED_MESSAGE } from '@/features/campaigns/campaign-messages';
import { TABLE_ROUTE_ID } from '@/features/library/library-route';
import type { AssetsApi } from '@/services/assets-api';
import type { TableBoardCommands } from '@/services/table-board-commands';
import { useOpenTables, type OpenTablesStore } from '@/stores/open-tables-store';
import type { ConditionCatalogLink } from './condition-catalog-link';
import { ConditionCatalogPage } from './condition-catalog-page';

/** The full pattern of the conditions page, which the play room matches to step aside. */
export const CONDITIONS_PATH = '/campaigns/:campaignId/table/conditions';

const PAGE_TITLE = 'Condições da mesa';

/** "Condições da mesa", a child of the play room at `/campaigns/:campaignId/table/conditions`,
 *  under the room's loader: the room stays mounted under the page, so the table stays open and
 *  the list's commands go over its live session. A player who lands here goes back to the room
 *  (the server refuses their commands anyway). No loader nor action: the list is the open
 *  table's, and every change is a Socket.IO command.
 *
 *  Example: `{ id: TABLE_ROUTE_ID, children: [index, libraryRoute(deps), conditionsRoute(deps)] }` */
export function conditionsRoute(deps: AppDependencies): RouteObject {
  return {
    path: 'conditions',
    handle: { place: 'Condições da mesa' },
    Component: conditionsScreen(deps),
    ErrorBoundary: conditionsErrorScreen(),
  };
}

function conditionsScreen({
  openTables,
  boardCommands,
  assets,
}: AppDependencies): () => React.JSX.Element | null {
  return function ConditionsScreen(): React.JSX.Element | null {
    const data = useRouteLoaderData<CampaignLoaderData>(TABLE_ROUTE_ID);
    const link = useConditionCatalogLink(
      { openTables, commands: boardCommands, assets },
      data?.campaign.id,
    );
    if (!data) return null;
    const { campaign } = data;
    if (campaign.myRole !== 'master') {
      return <Navigate replace to={`/campaigns/${encodeURIComponent(campaign.id)}/table`} />;
    }
    return (
      <RoomCoverPage campaignId={campaign.id} campaignName={campaign.name} title={PAGE_TITLE}>
        <ConditionCatalogPage key={campaign.id} link={link} />
      </RoomCoverPage>
    );
  };
}

// The room under the page holds the table open: its cast carries the list of conditions, live,
// and the list's commands go to the table's version (the cast), not to a grid.
type CatalogSources = Readonly<{
  openTables: StoreApi<OpenTablesStore>;
  commands: TableBoardCommands;
  assets: AssetsApi;
}>;

function useConditionCatalogLink(
  { openTables, commands, assets }: CatalogSources,
  campaignId: string | undefined,
): ConditionCatalogLink | null {
  const table = useOpenTables(
    openTables,
    (state) => state.tables.find((open) => open.campaignId === campaignId) ?? null,
  );
  const cast = table?.cast ?? null;
  const castSceneId = table?.castSceneId ?? null;
  return useMemo(() => {
    if (!campaignId || !cast || !castSceneId) return null;
    return { scope: { campaignId, sceneId: castSceneId }, cast, commands, assets };
  }, [campaignId, cast, castSceneId, commands, assets]);
}

// Still over the room, so the table stays open: the failure says so inside the page's frame.
function conditionsErrorScreen(): () => React.JSX.Element | null {
  return function ConditionsErrorScreen(): React.JSX.Element | null {
    const data = useRouteLoaderData<CampaignLoaderData>(TABLE_ROUTE_ID);
    if (!data) return null;
    return (
      <RoomCoverPage
        campaignId={data.campaign.id}
        campaignName={data.campaign.name}
        title={PAGE_TITLE}
      >
        <p role="alert" className="px-4 pt-6 text-sm text-destructive-text sm:px-8">
          {UNEXPECTED_MESSAGE}
        </p>
      </RoomCoverPage>
    );
  };
}
