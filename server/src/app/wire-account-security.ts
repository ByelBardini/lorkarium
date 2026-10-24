import type { FastifyInstance } from 'fastify';
import type { MailerConfig } from '../config/env';
import { LogMailer } from '../infrastructure/mailer/log-mailer';
import { SmtpMailer } from '../infrastructure/mailer/smtp-mailer';
import { QrCodeImage } from '../infrastructure/qr-code/qrcode-image';
import { CryptoRecoveryCode } from '../infrastructure/recovery-code/crypto-recovery-code';
import {
  createAccountSecurityModule,
  type AccountSecurityModuleOptions,
} from '../modules/account-security/account-security.plugin';
import type { MailerPort } from '../modules/account-security/mailer.port';

/** What `buildApp` already has for the account's security module; the mailer, the QR and the
 *  recovery codes are made here. */
export type AccountSecurityWiring = Omit<
  AccountSecurityModuleOptions,
  'mailer' | 'reportMailFailure' | 'qr' | 'codes'
> &
  Readonly<{
    mailerConfig: MailerConfig;
    /** Integration specs hand a fake to read what was sent (like the clock). */
    mailer?: MailerPort | undefined;
  }>;

/** Registers the account's security routes (password, sessions, e-mail, 2FA) under `prefix`.
 *
 *  Example: `await wireAccountSecurity(app, { ...shared, mailerConfig: env.mailer }, '/api')` */
export async function wireAccountSecurity(
  app: FastifyInstance,
  wiring: AccountSecurityWiring,
  prefix: string,
): Promise<void> {
  const { mailerConfig, mailer, ...shared } = wiring;
  const module = createAccountSecurityModule({
    ...shared,
    mailer: mailer ?? mailerOf(app, mailerConfig),
    reportMailFailure: (error, subject) => {
      app.log.warn({ err: error, subject }, 'a security notice e-mail was not delivered');
    },
    qr: new QrCodeImage(),
    codes: new CryptoRecoveryCode(),
  });
  await app.register(module.plugin, { prefix });
}

function mailerOf(app: FastifyInstance, config: MailerConfig): MailerPort {
  if (config.kind === 'log') return new LogMailer(app.log, config.from);
  const smtp = new SmtpMailer(config.url, config.from);
  app.addHook('onClose', async () => smtp.close());
  return smtp;
}
