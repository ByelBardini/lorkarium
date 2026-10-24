/** One e-mail, always with a plain-text body and an HTML one. */
export type MailMessage = Readonly<{
  to: string;
  subject: string;
  text: string;
  html: string;
}>;

/** Sends e-mail; the adapter fixes the sender (`MAIL_FROM`) and the transport.
 *
 *  Example: `await mailer.send(passwordChangedMail('ana@x.com', clock.now()))` */
export interface MailerPort {
  send(message: MailMessage): Promise<void>;
}
