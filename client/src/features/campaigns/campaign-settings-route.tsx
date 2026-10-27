import type { StoreApi } from 'zustand/vanilla';
import { Navigate, useRouteError, useRouteLoaderData, type RouteObject } from 'react-router';
import type { AppDependencies } from '@/app/router';
import { SignedOutRedirect } from '@/components/signed-out-redirect';
import { TABLE_ROUTE_ID } from '@/features/library/library-route';
import type { SessionStore } from '@/stores/session-store';
import type { CampaignLoaderData } from './campaign-loader-data';
import { UNEXPECTED_MESSAGE } from './campaign-messages';
import { CampaignSettingsSignedOutError, campaignSettingsAction } from './campaign-settings-action';
import { CampaignSettingsForm } from './campaign-settings-form';
import { CampaignSettingsPage } from './campaign-settings-page';

/** The full pattern of the settings page, which the play room matches to step aside. */
export const CAMPAIGN_SETTINGS_PATH = '/campaigns/:campaignId/table/settings';

/** "Configurações da mesa", a child of the play room at `/campaigns/:campaignId/table/settings`,
 *  under the room's loader: the room stays mounted under the page, so the table stays open (the
 *  server refuses the settings of a table its master does not have open). A player who lands
 *  here goes back to the room (the server refuses their commands anyway). Its action takes
 *  `update`, `regenerate-code` and `delete`.
 *
 *  Example: `{ id: TABLE_ROUTE_ID, children: [index, libraryRoute(deps), campaignSettingsRoute(deps)] }` */
export function campaignSettingsRoute(deps: AppDependencies): RouteObject {
  return {
    path: 'settings',
    handle: { place: 'Configurações da mesa' },
    action: campaignSettingsAction(deps),
    Component: settingsScreen(deps),
    ErrorBoundary: settingsErrorScreen(deps.sessionStore),
  };
}

function settingsScreen({ assets, clipboard }: AppDependencies): () => React.JSX.Element | null {
  return function SettingsScreen(): React.JSX.Element | null {
    const data = useRouteLoaderData<CampaignLoaderData>(TABLE_ROUTE_ID);
    if (!data) return null;
    const { campaign } = data;
    if (campaign.myRole !== 'master') {
      return <Navigate replace to={`/campaigns/${encodeURIComponent(campaign.id)}/table`} />;
    }
    return (
      <CampaignSettingsPage campaign={campaign}>
        <CampaignSettingsForm
          key={campaign.id}
          campaign={campaign}
          assets={assets}
          clipboard={clipboard}
        />
      </CampaignSettingsPage>
    );
  };
}

// Still over the room: a fallen session goes to the login; anything else says so in the page.
function settingsErrorScreen(sessionStore: StoreApi<SessionStore>): () => React.JSX.Element | null {
  return function SettingsErrorScreen(): React.JSX.Element | null {
    const error = useRouteError();
    const data = useRouteLoaderData<CampaignLoaderData>(TABLE_ROUTE_ID);
    if (error instanceof CampaignSettingsSignedOutError) {
      return <SignedOutRedirect sessionStore={sessionStore} />;
    }
    if (!data) return null;
    return (
      <CampaignSettingsPage campaign={data.campaign}>
        <p role="alert" className="text-sm text-destructive-text">
          {UNEXPECTED_MESSAGE}
        </p>
      </CampaignSettingsPage>
    );
  };
}
