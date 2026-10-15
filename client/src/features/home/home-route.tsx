import type { CampaignSummaryDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { useLoaderData, type LoaderFunction, type RouteObject } from 'react-router';
import type { AppDependencies } from '@/app/router';
import { valueOrThrow } from '@/app/shell/api-loader';
import { campaignDetailRoute } from '@/features/campaigns/campaign-routes';
import { useSession } from '@/stores/session-store';
import { homeAction } from './home-action';
import { HomeErrorScreen } from './home-error-screen';
import { HomePage } from './home-page';

export type HomeLoaderData = Readonly<{ campaigns: CampaignSummaryDto[] }>;

/** The routes under the shell that belong to the home: the list at `/` and, over it, the detail modal.
 *
 *  Example: `{ id: 'shell', children: homeRoutes(deps) }` */
export function homeRoutes(deps: AppDependencies): RouteObject[] {
  return [
    {
      id: 'home',
      path: '/',
      loader: homeLoader(deps),
      action: homeAction(deps),
      Component: homeRoute(deps),
      ErrorBoundary: HomeErrorScreen,
      children: [{ index: true, element: null }, campaignDetailRoute(deps)],
    },
  ];
}

function homeLoader({ campaignsApi, sessionStore }: AppDependencies): LoaderFunction {
  return async ({ request }): Promise<HomeLoaderData> => {
    const campaigns = valueOrThrow(await campaignsApi.list(), request, sessionStore);
    return { campaigns };
  };
}

function homeRoute(deps: AppDependencies): () => React.JSX.Element | null {
  return function HomeRoute(): React.JSX.Element | null {
    const session = useSession(deps.sessionStore);
    const { campaigns } = useLoaderData<HomeLoaderData>();
    const [greetingDraw] = useState(deps.random);
    const [now] = useState(deps.now);
    if (session.status !== 'authenticated') return null;
    return (
      <HomePage
        user={session.user}
        campaigns={campaigns}
        now={now}
        greetingDraw={greetingDraw}
        clipboard={deps.clipboard}
      />
    );
  };
}
