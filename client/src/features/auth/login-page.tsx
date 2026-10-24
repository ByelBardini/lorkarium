import type { AuthUserDto } from '@lorkarium/contracts';
import type { AuthApi } from '@/services/auth-api';
import { AuthFrame } from './auth-frame';
import { DeveloperCredit } from './developer-credit';
import { LoginForm } from './login-form';

export type LoginPageProps = Readonly<{
  authApi: AuthApi;
  onAuthenticated: (user: AuthUserDto) => void;
}>;

/** The sign-in screen: illustrated panel on large screens, the form always in the first fold.
 *
 *  Example: `<LoginPage authApi={authApi} onAuthenticated={goToNext} />` */
export function LoginPage({ authApi, onAuthenticated }: LoginPageProps): React.JSX.Element {
  return (
    <AuthFrame
      pageTitle="Lorkarium · Entrar"
      heading="Bem-vindo de volta"
      lead="Entre para continuar sua aventura."
      footer={<DeveloperCredit />}
    >
      <LoginForm authApi={authApi} onAuthenticated={onAuthenticated} />
    </AuthFrame>
  );
}
