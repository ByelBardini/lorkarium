import type { FastifyInstance } from 'fastify';
import type { MailerConfig } from '../config/env';
import { LogMailer } from '../infrastructure/mailer/log-mailer';
import { SmtpMailer } from '../infrastructure/mailer/smtp-mailer';
import { QrCodeImage } from '../infrastructure/qr-code/qrcode-image';
import { CryptoRecoveryCode } from '../infrastructure/recovery-code/crypto-recovery-code';
import {
  createAccountSecurityModule,
  type AccountSecurityModule,
  type AccountSecurityModuleOptions,
} from '../modules/account-security/account-security.plugin';
import type { MailerPort } from '../modules/account-security/mailer.port';

/** What `buildApp` already has for the account's security module; the mailer, the QR and the
 *  recovery codes are made here. */
export type AccountSecurityWiring = Omit<
  AccountSecurityModuleOptions,
  'reportMailFailure' | 'qr' | 'codes'
>;

/** Registers the account's security routes (password, sessions, e-mail, 2FA, recovery) under
 *  `prefix`; returns the module for the ones that send notices too (the backoffice).
 *
 *  Example: `const security = await wireAccountSecurity(app, { ...shared, mailer }, '/api')` */
export async function wireAccountSecurity(
  app: FastifyInstance,
  wiring: AccountSecurityWiring,
  prefix: string,
): Promise<AccountSecurityModule> {
  const module = createAccountSecurityModule({
    ...wiring,
    reportMailFailure: (error, subject) => {
      app.log.warn({ err: error, subject }, 'a notice e-mail was not delivered');
    },
    qr: new QrCodeImage(),
    codes: new CryptoRecoveryCode(),
  });
  await app.register(module.plugin, { prefix });
  return module;
}

/** The mailer of `config`: SMTP (closed with the app) or the log.
 *
 *  Example: `const mailer = deps.mailer ?? mailerOf(app, env.mailer)` */
export function mailerOf(app: FastifyInstance, config: MailerConfig): MailerPort {
  if (config.kind === 'log') return new LogMailer(app.log, config.from);
  const smtp = new SmtpMailer(config.url, config.from);
  app.addHook('onClose', async () => smtp.close());
  return smtp;
}
