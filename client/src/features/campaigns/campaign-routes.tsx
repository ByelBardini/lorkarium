import {
  Outlet,
  redirect,
  useLoaderData,
  useNavigate,
  type ActionFunction,
  type LoaderFunction,
  type RouteObject,
  type ShouldRevalidateFunction,
} from 'react-router';
import type { AppDependencies } from '@/app/router';
import { redirectIfSignedOut, valueOrThrow } from '@/app/shell/api-loader';
import { COMPACT_RAIL_HANDLE } from '@/app/shell/rail-handle';
import { CampaignDetailDialog, CampaignDetailErrorRoute } from './campaign-detail-dialog';
import { PlayRoomPage } from '@/features/board/play-room-page';
import { libraryRoute, TABLE_ROUTE_ID } from '@/features/library/library-route';
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

/** The play room at `/campaigns/:campaignId/table`, with the rail compact around it and the
 *  library (`…/table/library`) as a child modal over it.
 *
 *  Example: `{ id: 'shell', children: [...homeRoutes(deps), campaignTableRoute(deps)] }` */
export function campaignTableRoute(deps: AppDependencies): RouteObject {
  return {
    id: TABLE_ROUTE_ID,
    path: 'campaigns/:campaignId/table',
    handle: COMPACT_RAIL_HANDLE,
    loader: campaignLoader(deps),
    shouldRevalidate: keepCampaignUnderLibrary,
    Component: tableRoute(deps),
    ErrorBoundary: CampaignTableErrorPage,
    children: [{ index: true, element: null }, libraryRoute(deps)],
  };
}

// The library's actions and `library:changed` read the library again, not the campaign.
const keepCampaignUnderLibrary: ShouldRevalidateFunction = (args) => {
  const sameTable = args.currentParams.campaignId === args.nextParams.campaignId;
  if (sameTable && args.nextUrl.pathname.endsWith('/table/library')) return false;
  return args.defaultShouldRevalidate;
};

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
  wallStyle,
  lightReach,
  lightColor,
  clipboard,
  createBoardRenderer,
  boardCommands,
  assets,
  interactionClock,
}: AppDependencies): () => React.JSX.Element {
  return function TableRoute(): React.JSX.Element {
    const { campaign } = useLoaderData<CampaignLoaderData>();
    // Another table is another screen: its own pending presence, not the previous one's.
    return (
      <>
        <PlayRoomPage
          key={campaign.id}
          campaign={campaign}
          openTables={openTables}
          roomLayout={roomLayout}
          drawingStyle={drawingStyle}
          effectAreaStyle={effectAreaStyle}
          wallStyle={wallStyle}
          lightReach={lightReach}
          lightColor={lightColor}
          clipboard={clipboard}
          createBoardRenderer={createBoardRenderer}
          boardCommands={boardCommands}
          assets={assets}
          interactionClock={interactionClock}
        />
        <Outlet />
      </>
    );
  };
}
