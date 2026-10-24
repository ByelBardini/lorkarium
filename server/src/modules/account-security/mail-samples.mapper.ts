import {
  accessRestoredMail,
  accessSuspendedMail,
  invitationMail,
  passwordLinkMail,
  promotedToAdminMail,
} from './admin-mail.mapper';
import type { MailMessage } from './mailer.port';
import {
  emailChangedMail,
  emailChangeRequestedMail,
  emailConfirmationMail,
  passwordChangedMail,
  twoFactorChangedMail,
  type MailOrigin,
} from './security-mail.mapper';

/** One system e-mail filled with sample data: `id` is stable (the backoffice's button), `name`
 *  is how a person calls it. */
export type MailSample = Readonly<{ id: string; name: string; message: MailMessage }>;

// The mock's people (docs/pages/mails/Emails.dc.html); the tokens are made up and lead nowhere.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

/** One sample of every system e-mail, all addressed to `to`, in the catalog order (the
 *  `pnpm mail:preview` and the backoffice's "E-mails" page). `at` is the "Quando" of the
 *  notices: the moment of the send, so the sample reads like a real one.
 *
 *  Example: `mailSamples('preview@lorkarium.dev', 'http://localhost:5173', clock.now()).length // 11` */
export function mailSamples(to: string, publicUrl: string, at: Date): readonly MailSample[] {
  return [...accountSamples(to, publicUrl, at), ...backofficeSamples(to, publicUrl)];
}

function accountSamples(to: string, publicUrl: string, at: Date): MailSample[] {
  const origin: MailOrigin = { at, userAgent: USER_AGENT };
  const lucas = { to, name: 'Lucas', username: 'lucas.rola20' };
  const recover = `${publicUrl}/account/recover#token=amostra-recuperacao`;
  const notice = { person: lucas, origin, recoveryLink: recover, publicUrl };
  const masked = { ...notice, maskedNewEmail: 'l*********@exemplo.com' };
  const twoFactor = { person: lucas, origin, publicUrl };
  const confirmLink = `${publicUrl}/account/email/confirm#token=amostra`;
  return [
    sample(
      'email-confirmation',
      'Confirmação do novo e-mail',
      emailConfirmationMail({ person: lucas, link: confirmLink, publicUrl }),
    ),
    sample('email-change-requested', 'Pedido de troca de e-mail', emailChangeRequestedMail(masked)),
    sample('email-changed', 'E-mail trocado', emailChangedMail(masked)),
    sample('password-changed', 'Senha trocada', passwordChangedMail(notice)),
    sample('two-factor-on', '2FA ligado', twoFactorChangedMail({ ...twoFactor, enabled: true })),
    sample(
      'two-factor-off',
      '2FA desligado',
      twoFactorChangedMail({ ...twoFactor, enabled: false }),
    ),
  ];
}

function backofficeSamples(to: string, publicUrl: string): MailSample[] {
  const lucas = { to, name: 'Lucas', username: 'lucas.rola20' };
  const pedro = { to, name: 'Pedro', username: 'pedrinho' };
  const inviteLink = `${publicUrl}/invite#token=amostra`;
  const resetLink = `${publicUrl}/reset-password#token=amostra`;
  return [
    sample(
      'invitation',
      'Convite',
      invitationMail({
        to,
        link: inviteLink,
        validFor: { days: 7 },
        publicUrl,
      }),
    ),
    sample(
      'password-link',
      'Link de nova senha',
      passwordLinkMail({ person: lucas, link: resetLink, validFor: { hours: 1 }, publicUrl }),
    ),
    sample(
      'access-suspended',
      'Acesso suspenso',
      accessSuspendedMail({ person: pedro, publicUrl }),
    ),
    sample('access-restored', 'Acesso reativado', accessRestoredMail({ person: pedro, publicUrl })),
    sample('promoted-to-admin', 'Agora é admin', promotedToAdminMail({ person: pedro, publicUrl })),
  ];
}

function sample(id: string, name: string, message: MailMessage): MailSample {
  return { id, name, message };
}
