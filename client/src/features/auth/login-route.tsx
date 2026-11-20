import type { AuthUserDto, SignUpSettingsDto } from '@lorkarium/contracts';
import { useLoaderData, useNavigate, useSearchParams, type RouteObject } from 'react-router';
import type { AppDependencies } from '@/app/router';
import { signUpSettingsLoader } from '@/features/sign-up/sign-up-action';
import { safeRedirectTarget } from '@/lib/safe-redirect';
import type { SignUpResult } from '@/services/sign-up-api';
import { LoginPage } from './login-page';

/** The login (`/login`): signs in and goes to the safe `next`; reads the sign-up settings to know
 *  whether "Criar conta" shows (settings that do not arrive hide it).
 *
 *  Example: `{ path: 'login', middleware: [guard(deps, 'public-only')], ...loginRoute(deps) }` */
export function loginRoute(deps: AppDependencies): Pick<RouteObject, 'loader' | 'Component'> {
  const { authApi, sessionStore, isDesktop } = deps;
  return {
    loader: signUpSettingsLoader(deps),
    Component: function LoginRoute(): React.JSX.Element {
      const navigate = useNavigate();
      const [searchParams] = useSearchParams();
      const settings = useLoaderData<SignUpResult<SignUpSettingsDto>>();
      const enter = (user: AuthUserDto): void => {
        sessionStore.getState().signedIn(user);
        void navigate(safeRedirectTarget(searchParams.get('next')), { replace: true });
      };
      // The desktop app runs on the person's own computer: staying signed in is the expected default.
      return (
        <LoginPage
          authApi={authApi}
          onAuthenticated={enter}
          rememberByDefault={isDesktop}
          registrationOpen={settings.ok && settings.value.registrationOpen}
        />
      );
    },
  };
}
