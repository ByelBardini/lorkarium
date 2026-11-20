import { Link } from 'react-router';
import type { AuthUserDto } from '@lorkarium/contracts';
import type { AuthApi } from '@/services/auth-api';
import { AuthFrame } from './auth-frame';
import { DeveloperCredit } from './developer-credit';
import { LoginForm } from './login-form';

export type LoginPageProps = Readonly<{
  authApi: AuthApi;
  onAuthenticated: (user: AuthUserDto) => void;
  /** Whether "Manter conectado" starts checked (the desktop app). */
  rememberByDefault: boolean;
  /** Whether the public sign-up is open: then "Criar conta" shows under the form. */
  registrationOpen: boolean;
}>;

/** The sign-in screen: illustrated panel on large screens, the form always in the first fold.
 *
 *  Example: `<LoginPage authApi={authApi} onAuthenticated={goToNext} rememberByDefault={false} registrationOpen />` */
export function LoginPage({
  authApi,
  onAuthenticated,
  rememberByDefault,
  registrationOpen,
}: LoginPageProps): React.JSX.Element {
  return (
    <AuthFrame
      pageTitle="Lorkarium · Entrar"
      heading="Bem-vindo de volta"
      lead="Entre para continuar sua aventura."
      footer={<DeveloperCredit />}
    >
      <LoginForm
        authApi={authApi}
        onAuthenticated={onAuthenticated}
        rememberByDefault={rememberByDefault}
      />
      {registrationOpen && (
        <p className="text-center text-sm text-muted-foreground">
          Ainda não tem conta?{' '}
          <Link
            to="/sign-up"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Criar conta
          </Link>
        </p>
      )}
    </AuthFrame>
  );
}
