import type { PublicCampaignDto } from '@lorkarium/contracts';
import type { LoaderFunction, RouteObject } from 'react-router';
import type { AppDependencies } from '@/app/router';
import { valueOrThrow } from '@/app/shell/api-loader';
import { campaignDetailRoute } from '@/features/campaigns/campaign-routes';
import { exploreAction } from './explore-action';
import { ExploreErrorScreen, ExploreRoute } from './explore-page';

/** The rail's link to "Explorar mesas". */
export const EXPLORE_PATH = '/campaigns/public';

export type ExploreLoaderData = Readonly<{
  campaigns: PublicCampaignDto[];
  readerIsAdmin: boolean;
}>;

/** "Explorar mesas" under the shell: every public campaign, and "Entrar" without the code.
 *
 *  Example: `{ id: 'shell', children: [...homeRoutes(deps), exploreRoute(deps)] }` */
export function exploreRoute(deps: AppDependencies): RouteObject {
  return {
    path: EXPLORE_PATH.slice(1),
    loader: exploreLoader(deps),
    action: exploreAction(deps),
    Component: ExploreRoute,
    ErrorBoundary: ExploreErrorScreen,
    // A campaign the reader is in opens its full detail over the list, not over the home.
    children: [campaignDetailRoute(deps, { path: ':campaignId', closeTo: EXPLORE_PATH })],
  };
}

function exploreLoader({ campaignsApi, sessionStore }: AppDependencies): LoaderFunction {
  return async ({ request }): Promise<ExploreLoaderData> => {
    const campaigns = valueOrThrow(await campaignsApi.listPublic(), request, sessionStore);
    const { session } = sessionStore.getState();
    const readerIsAdmin = session.status === 'authenticated' && session.user.role === 'admin';
    return { campaigns, readerIsAdmin };
  };
}
