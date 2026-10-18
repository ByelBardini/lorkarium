import {
  redirect,
  useLoaderData,
  useNavigate,
  type ActionFunction,
  type LoaderFunction,
  type RouteObject,
} from 'react-router';
import type { AppDependencies } from '@/app/router';
import { redirectIfSignedOut, valueOrThrow } from '@/app/shell/api-loader';
import { COMPACT_RAIL_HANDLE } from '@/app/shell/rail-handle';
import { CampaignDetailDialog, CampaignDetailErrorRoute } from './campaign-detail-dialog';
import { PlayRoomPage } from '@/features/board/play-room-page';
import { CampaignTableErrorPage } from './campaign-table-page';
import type { CampaignLoaderData } from './campaign-loader-data';
import type { EnterCampaignResult } from './enter-campaign-button';

/** The detail modal, a child of the home at `/campaigns/:campaignId`: a shareable link, and
 *  "back" closes it. Its action is "Entrar na mesa".
 *
 *  Example: `{ id: 'home', path: '/', children: [index, campaignDetailRoute(deps)] }` */
export function campaignDetailRoute(deps: AppDependencies): RouteObject {
  return {
    path: 'campaigns/:campaignId',
    loader: campaignLoader(deps),
    action: enterCampaignAction(deps),
    Component: detailRoute(deps),
    ErrorBoundary: CampaignDetailErrorRoute,
  };
}

/** The play room at `/campaigns/:campaignId/table`, with the rail compact around it.
 *
 *  Example: `{ id: 'shell', children: [...homeRoutes(deps), campaignTableRoute(deps)] }` */
export function campaignTableRoute(deps: AppDependencies): RouteObject {
  return {
    path: 'campaigns/:campaignId/table',
    handle: COMPACT_RAIL_HANDLE,
    loader: campaignLoader(deps),
    Component: tableRoute(deps),
    ErrorBoundary: CampaignTableErrorPage,
  };
}

function campaignLoader({ campaignsApi, sessionStore }: AppDependencies): LoaderFunction {
  return async ({ request, params }): Promise<CampaignLoaderData> => {
    const result = await campaignsApi.detail(params.campaignId ?? '');
    return { campaign: valueOrThrow(result, request, sessionStore) };
  };
}

function enterCampaignAction({ campaignsApi, sessionStore }: AppDependencies): ActionFunction {
  return async ({ request, params }): Promise<EnterCampaignResult | Response> => {
    const campaignId = params.campaignId ?? '';
    const result = await campaignsApi.enter(campaignId);
    if (result.ok) return redirect(`/campaigns/${campaignId}/table`);
    redirectIfSignedOut(result.failure, request, sessionStore);
    return { failure: result.failure.kind };
  };
}

function detailRoute({ clipboard }: AppDependencies): () => React.JSX.Element {
  return function DetailRoute(): React.JSX.Element {
    const { campaign } = useLoaderData<CampaignLoaderData>();
    const navigate = useNavigate();
    return (
      <CampaignDetailDialog
        campaign={campaign}
        clipboard={clipboard}
        onClose={() => void navigate('/')}
      />
    );
  };
}

function tableRoute({
  openTables,
  roomLayout,
  drawingStyle,
  effectAreaStyle,
  clipboard,
  createBoardRenderer,
  boardCommands,
  assets,
}: AppDependencies): () => React.JSX.Element {
  return function TableRoute(): React.JSX.Element {
    const { campaign } = useLoaderData<CampaignLoaderData>();
    // Another table is another screen: its own pending presence, not the previous one's.
    return (
      <PlayRoomPage
        key={campaign.id}
        campaign={campaign}
        openTables={openTables}
        roomLayout={roomLayout}
        drawingStyle={drawingStyle}
        effectAreaStyle={effectAreaStyle}
        clipboard={clipboard}
        createBoardRenderer={createBoardRenderer}
        boardCommands={boardCommands}
        assets={assets}
      />
    );
  };
}
