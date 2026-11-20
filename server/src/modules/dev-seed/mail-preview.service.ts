import type { MailerPort } from '../account-security/mailer.port';
import type { ClockPort } from '../auth/clock.port';
import { MailPreviewFailedError, MailPreviewRefusedError } from './dev-seed.error';
import { mailSamples } from '../account-security/mail-samples.mapper';

/** Where the sample links go: the app (`APP_PUBLIC_URL`) and the landing (`SITE_PUBLIC_URL`). */
export type MailPreviewUrls = Readonly<{ publicUrl: string; siteUrl: string }>;

/** `pnpm mail:preview`: one sample of every system e-mail to an inbox (the dev Mailpit), to look
 *  at them all without walking each flow. Never in production.
 *
 *  Example: `await new MailPreviewService(mailer, clock).send(env.nodeEnv, 'preview@lorkarium.dev', { publicUrl, siteUrl })` */
export class MailPreviewService {
  constructor(
    private readonly mailer: MailerPort,
    private readonly clock: ClockPort,
  ) {}

  /** Sends the catalog in order; returns how many left. */
  async send(nodeEnv: string, to: string, urls: MailPreviewUrls): Promise<number> {
    if (nodeEnv === 'production') throw new MailPreviewRefusedError(nodeEnv);
    const catalog = mailSamples(to, urls.publicUrl, this.clock.now(), urls.siteUrl);
    for (const { message } of catalog) {
      try {
        await this.mailer.send(message);
      } catch (error) {
        throw new MailPreviewFailedError(message.subject, error);
      }
    }
    return catalog.length;
  }
}
