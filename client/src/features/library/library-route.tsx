import type { CampaignLibraryDto } from '@lorkarium/contracts';
import { useState } from 'react';
import {
  useLoaderData,
  useNavigate,
  useRouteLoaderData,
  type LoaderFunction,
  type RouteObject,
} from 'react-router';
import type { AppDependencies } from '@/app/router';
import type { CampaignLoaderData } from '@/features/campaigns/campaign-loader-data';
import type { LibraryResult } from '@/services/library-api';
import { libraryAction } from './library-action';
import { LibraryDialog } from './library-dialog';
import { useLibraryTable } from './use-library-table';

/** The id of the play room route, whose loader has the campaign the library belongs to. */
export const TABLE_ROUTE_ID = 'campaign-table';

export type LibraryLoaderData = Readonly<{ library: Promise<LibraryResult<CampaignLibraryDto>> }>;

/** The library at `/campaigns/:campaignId/table/library`, a child of the play room: the room
 *  stays mounted under the modal, the link is shareable and "back" closes it.
 *
 *  Example: `{ id: TABLE_ROUTE_ID, path: 'campaigns/:campaignId/table', children: [libraryRoute(deps)] }` */
export function libraryRoute(deps: AppDependencies): RouteObject {
  return {
    path: 'library',
    loader: libraryLoader(deps),
    action: libraryAction(deps),
    Component: libraryScreen(deps),
  };
}

// Not awaited: the modal opens at once over the room and shows the list when it comes.
function libraryLoader({ libraryApi }: AppDependencies): LoaderFunction {
  return ({ params }): LibraryLoaderData => ({ library: libraryApi.list(params.campaignId ?? '') });
}

function libraryScreen(deps: AppDependencies): () => React.JSX.Element | null {
  return function LibraryScreen(): React.JSX.Element | null {
    const { library } = useLoaderData<LibraryLoaderData>();
    const tableData = useRouteLoaderData<CampaignLoaderData>(TABLE_ROUTE_ID);
    const navigate = useNavigate();
    const [now] = useState(deps.now);
    const campaignId = tableData?.campaign.id ?? '';
    const tableView = useLibraryTable(deps.openTables, campaignId);
    if (!tableData) return null;
    return (
      <LibraryDialog
        campaign={tableData.campaign}
        library={library}
        tableView={tableView}
        sessionStore={deps.sessionStore}
        now={now}
        assets={deps.assets}
        api={deps.libraryApi}
        presentations={deps.imagePresentationApi}
        onClose={() => void navigate(`/campaigns/${encodeURIComponent(campaignId)}/table`)}
      />
    );
  };
}
