import { passwordResetRequestDto, type SignUpSettingsDto } from '@lorkarium/contracts';
import { useLocation } from 'react-router';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { AuthFrame } from '@/features/auth/auth-frame';
import type { SignUpResult } from '@/services/sign-up-api';
import { PublicRequestForm } from './public-request-form';
import { signUpFailureMessage } from './sign-up-messages';

const IDENTIFIER_FIELD = {
  label: 'E-mail ou @',
  type: 'text',
  autoComplete: 'username',
  placeholder: 'voce@exemplo.com ou @usuario',
} as const;

const EMPTY_IDENTIFIER = 'Informe seu e-mail ou @.';
const INVALID_IDENTIFIER = 'Informe um e-mail, como voce@exemplo.com, ou seu @, como @bia.';

// The login hands over what was typed by navigation state: an address never goes in the URL.
const handedOverDto = z.object({ identifier: z.string() });

export type ForgotPasswordPageProps = Readonly<{ settings: SignUpResult<SignUpSettingsDto> }>;

/** "Esqueci minha senha" (`/forgot-password`): the e-mail or @ and the anti-bot challenge; a link
 *  of 1 hour goes to the account's e-mail. The answer is the same for any value.
 *
 *  Example: `<ForgotPasswordPage settings={useLoaderData()} />` */
export function ForgotPasswordPage({ settings }: ForgotPasswordPageProps): React.JSX.Element {
  const handedOver = handedOverDto.safeParse(useLocation().state);
  return (
    <AuthFrame
      pageTitle="Lorkarium · Esqueci minha senha"
      heading="Esqueci minha senha"
      lead="Diga seu e-mail ou seu @: mandamos um link para você criar uma senha nova."
    >
      {settings.ok ? (
        <PublicRequestForm
          siteKey={settings.value.humanCheckSiteKey}
          field={IDENTIFIER_FIELD}
          initialValue={handedOver.success ? handedOver.data.identifier : ''}
          parse={parseIdentifier}
          intentOf={(identifier, humanCheckToken) => ({
            intent: 'request-reset',
            identifier,
            humanCheckToken,
          })}
          submitLabel="Mandar link"
          sent={() => <SentNotice />}
        />
      ) : (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {signUpFailureMessage(settings.failure)}
        </Alert>
      )}
    </AuthFrame>
  );
}

function parseIdentifier(value: string): Readonly<{ value: string } | { problem: string }> {
  if (value.trim() === '') return { problem: EMPTY_IDENTIFIER };
  const parsed = passwordResetRequestDto.shape.identifier.safeParse(value);
  return parsed.success ? { value: parsed.data } : { problem: INVALID_IDENTIFIER };
}

function SentNotice(): React.JSX.Element {
  return (
    <p role="status" className="text-[15px] text-muted-foreground">
      Se existir uma conta com esse e-mail ou @, mandamos um link. Ele vale 1 hora.
    </p>
  );
}
