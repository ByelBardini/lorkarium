import type { SignUpSettingsDto } from '@lorkarium/contracts';
import { useLoaderData, type RouteObject } from 'react-router';
import type { AppDependencies } from '@/app/router';
import { accountLinksAction } from '@/features/account-links/account-links-action';
import { signOutOfTab } from '@/features/account-links/account-link-routes';
import type { SignUpResult } from '@/services/sign-up-api';
import { signUpAction, signUpSettingsLoader } from './sign-up-action';
import { SignUpConfirmPage } from './sign-up-confirm-page';
import { SignUpPage } from './sign-up-page';

type RouteParts = Pick<RouteObject, 'action' | 'loader' | 'Component'>;

/** The public sign-up (`/sign-up`), outside the shell and open to anyone.
 *
 *  Example: `anyonePage(deps, 'sign-up', 'Criar conta', signUpRoute(deps))` */
export function signUpRoute(deps: AppDependencies): RouteParts {
  const { sessionStore } = deps;
  const signOut = signOutOfTab(deps);
  return {
    loader: signUpSettingsLoader(deps),
    action: signUpAction(deps),
    Component: function SignUpRoute(): React.JSX.Element {
      const settings = useLoaderData<SignUpResult<SignUpSettingsDto>>();
      return <SignUpPage settings={settings} sessionStore={sessionStore} signOut={signOut} />;
    },
  };
}

/** The page of the sign-up link (`/sign-up/confirm#token=…`), outside the shell, open to anyone;
 *  the invitation's requests (`inspect`, `accept`), which take either origin.
 *
 *  Example: `anyonePage(deps, 'sign-up/confirm', 'Criar conta', signUpConfirmRoute(deps))` */
export function signUpConfirmRoute(deps: AppDependencies): RouteParts {
  const { sessionStore } = deps;
  const signOut = signOutOfTab(deps);
  return {
    action: accountLinksAction(deps),
    Component: function SignUpConfirmRoute(): React.JSX.Element {
      return <SignUpConfirmPage sessionStore={sessionStore} signOut={signOut} />;
    },
  };
}
