/** One e-mail, always with a plain-text body and an HTML one. `replyTo` (the `MAIL_REPLY_TO`
 *  contact) goes only on the e-mails a person may answer: a sanction's appeal, a broadcast. */
export type MailMessage = Readonly<{
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}>;

/** Sends e-mail; the adapter fixes the sender (`MAIL_FROM`) and the transport.
 *
 *  Example: `await mailer.send(passwordChangedMail('ana@x.com', clock.now()))` */
export interface MailerPort {
  send(message: MailMessage): Promise<void>;
}
