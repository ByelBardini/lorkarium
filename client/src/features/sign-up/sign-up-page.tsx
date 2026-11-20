import { signUpRequestDto, type SignUpSettingsDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { Alert } from '@/components/ui/alert';
import { SignedOutFirst } from '@/features/account-links/signed-out-first';
import { AuthFrame } from '@/features/auth/auth-frame';
import type { SignUpResult } from '@/services/sign-up-api';
import type { SessionStore } from '@/stores/session-store';
import { PublicRequestForm } from './public-request-form';
import {
  EMAIL_PROBLEM,
  SIGN_UP_CLOSED,
  signedInToSignUp,
  signUpFailureMessage,
} from './sign-up-messages';

export type SignUpPageProps = Readonly<{
  settings: SignUpResult<SignUpSettingsDto>;
  sessionStore: StoreApi<SessionStore>;
  /** Signs the current account out ("Sair e continuar"). */
  signOut: () => Promise<void>;
}>;

/** The public sign-up (`/sign-up`): the e-mail and the anti-bot challenge; the link to choose the
 *  @ and the password arrives by e-mail. The answer is the same for any address.
 *
 *  Example: `<SignUpPage settings={useLoaderData()} sessionStore={sessionStore} signOut={signOut} />` */
export function SignUpPage({
  settings,
  sessionStore,
  signOut,
}: SignUpPageProps): React.JSX.Element {
  return (
    <AuthFrame
      pageTitle="Lorkarium · Criar conta"
      heading="Crie sua conta"
      lead="Comece pelo seu e-mail: mandamos um link para você escolher seu @ e sua senha."
    >
      {!settings.ok ? (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {signUpFailureMessage(settings.failure)}
        </Alert>
      ) : !settings.value.registrationOpen ? (
        <ClosedNotice />
      ) : (
        <SignedOutFirst sessionStore={sessionStore} signOut={signOut} notice={signedInToSignUp}>
          <SignUpForm siteKey={settings.value.humanCheckSiteKey} />
        </SignedOutFirst>
      )}
    </AuthFrame>
  );
}

const EMAIL_FIELD = {
  label: 'E-mail',
  type: 'email',
  autoComplete: 'email',
  placeholder: 'voce@exemplo.com',
} as const;

function SignUpForm({ siteKey }: Readonly<{ siteKey: string | null }>): React.JSX.Element {
  return (
    <PublicRequestForm
      siteKey={siteKey}
      field={EMAIL_FIELD}
      parse={parseEmail}
      intentOf={(email, humanCheckToken) => ({ intent: 'sign-up', email, humanCheckToken })}
      submitLabel="Criar conta"
      sent={(email) => <SentNotice email={email} />}
    />
  );
}

function parseEmail(value: string): Readonly<{ value: string } | { problem: string }> {
  const parsed = signUpRequestDto.shape.email.safeParse(value);
  return parsed.success ? { value: parsed.data } : { problem: EMAIL_PROBLEM };
}

function SentNotice({ email }: Readonly<{ email: string }>): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="font-display text-2xl font-semibold">Confira seu e-mail</h2>
      <p role="status" className="text-[15px] text-muted-foreground">
        Mandamos um e-mail para {email}. O link dele vale 24 horas.
      </p>
    </section>
  );
}

function ClosedNotice(): React.JSX.Element {
  return <p className="text-[15px] text-muted-foreground">{SIGN_UP_CLOSED}</p>;
}
