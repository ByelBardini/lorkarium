import type { MailMessage, MailerPort } from '../../modules/account-security/mailer.port';

/** The slice of the pino logger the log mailer writes to. */
export type MailLog = Readonly<{ info: (fields: object, message: string) => void }>;

/** Writes each e-mail to the log instead of sending it: dev and e2e without an SMTP server. The
 *  schema refuses it in production (the body may carry a link token).
 *
 *  Example: `new LogMailer(app.log, 'Lorkarium <no-reply@lorkarium.dev>')` */
export class LogMailer implements MailerPort {
  constructor(
    private readonly log: MailLog,
    private readonly from: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const { to, subject, text } = message;
    this.log.info({ mail: { from: this.from, to, subject, text } }, 'e-mail written to the log');
  }
}
