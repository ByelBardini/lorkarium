import { useState } from 'react';
import {
  Outlet,
  redirect,
  useLoaderData,
  useMatch,
  useNavigate,
  type ActionFunction,
  type LoaderFunction,
  type RouteObject,
  type ShouldRevalidateFunction,
} from 'react-router';
import type { AppDependencies } from '@/app/router';
import { redirectIfSignedOut, valueOrThrow } from '@/app/shell/api-loader';
import { COMPACT_RAIL_HANDLE } from '@/app/shell/rail-handle';
import { cn } from '@/lib/utils';
import { CampaignDetailDialog, CampaignDetailErrorRoute } from './campaign-detail-dialog';
import { PlayRoomPage } from '@/features/board/play-room-page';
import { libraryRoute, TABLE_ROUTE_ID } from '@/features/library/library-route';
import { CampaignOverview } from './campaign-overview';
import { CAMPAIGN_SETTINGS_PATH, campaignSettingsRoute } from './campaign-settings-route';
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

/** The play room at `/campaigns/:campaignId/table`, with the rail compact around it, the
 *  library (`…/table/library`) as a child modal over it and the settings (`…/table/settings`,
 *  master only) as a child page covering it: the room stays mounted, so the table stays open.
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
    children: [{ index: true, element: null }, libraryRoute(deps), campaignSettingsRoute(deps)],
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

function detailRoute({ clipboard, now }: AppDependencies): () => React.JSX.Element {
  return function DetailRoute(): React.JSX.Element {
    const { campaign } = useLoaderData<CampaignLoaderData>();
    const navigate = useNavigate();
    // Fixed once per visit, so "Último acesso" does not move while the modal is open.
    const [visitNow] = useState(now);
    const close = (): void => void navigate('/');
    return (
      <CampaignDetailDialog campaign={campaign} onClose={close}>
        <CampaignOverview
          campaign={campaign}
          clipboard={clipboard}
          now={visitNow}
          onClose={close}
        />
      </CampaignDetailDialog>
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
  pings,
  sessionStore,
  assets,
  interactionClock,
}: AppDependencies): () => React.JSX.Element {
  return function TableRoute(): React.JSX.Element {
    const { campaign } = useLoaderData<CampaignLoaderData>();
    // The settings page covers the room instead of replacing it: the board and the live session
    // stay up underneath (the master stays online). `invisible`, not `hidden`: the board keeps its
    // size (the renderer measures it), while nothing in it is seen, read or focused.
    const covered = useMatch(CAMPAIGN_SETTINGS_PATH) !== null;
    // Another table is another screen: its own pending presence, not the previous one's.
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className={cn('flex min-h-0 flex-1 flex-col', covered && 'invisible')}>
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
            pings={pings}
            sessionStore={sessionStore}
            assets={assets}
            interactionClock={interactionClock}
          />
        </div>
        <Outlet />
      </div>
    );
  };
}
