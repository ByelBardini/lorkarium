import nodemailer, { type Transporter } from 'nodemailer';
import type { MailMessage, MailerPort } from '../../modules/account-security/mailer.port';

/** A delivery the SMTP server refused or never took; names the host, never the URL (it carries the
 *  password). */
export class MailDeliveryError extends Error {
  constructor(
    readonly host: string,
    cause: unknown,
  ) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`could not deliver e-mail through SMTP host ${host}: ${reason}`, { cause });
    this.name = 'MailDeliveryError';
  }
}

/** E-mail over SMTP (`nodemailer`): Mailpit in dev, the provider's relay in production.
 *
 *  Example: `new SmtpMailer('smtp://localhost:1025', 'Lorkarium <no-reply@lorkarium.dev>')` */
export class SmtpMailer implements MailerPort {
  private readonly transport: Transporter;
  private readonly host: string;

  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(url);
    this.host = new URL(url).host;
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transport.sendMail({ from: this.from, ...message });
    } catch (error) {
      throw new MailDeliveryError(this.host, error);
    }
  }

  close(): void {
    this.transport.close();
  }
}
