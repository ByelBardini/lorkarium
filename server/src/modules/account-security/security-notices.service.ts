import type { MailMessage, MailerPort } from './mailer.port';

/** Told when a security notice could not leave (the change itself is already saved). */
export type MailFailureReport = (error: unknown, subject: string) => void;

/** Best-effort "if this was not you" notices: a mail server down must not undo nor fail a change
 *  that is already persisted, so the failure is reported (logged) instead of thrown.
 *
 *  Example: `await notices.send(passwordChangedMail(email, now))` */
export class SecurityNoticesService {
  constructor(
    private readonly mailer: MailerPort,
    private readonly reportFailure: MailFailureReport,
  ) {}

  async send(message: MailMessage): Promise<void> {
    try {
      await this.mailer.send(message);
    } catch (error) {
      this.reportFailure(error, message.subject);
    }
  }
}
