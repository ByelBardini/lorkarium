import type { MailSampleDto } from '@lorkarium/contracts';
import { mailSamples } from '../account-security/mail-samples.mapper';
import type { MailerPort } from '../account-security/mailer.port';
import type { ClockPort } from '../auth/clock.port';
import { MailDeliveryFailedError, MailSampleNotFoundError } from './user-admin.error';

export type MailSamplesDeps = Readonly<{
  /** The app's mailer itself, not the best-effort notices: the admin wants to see a failure. */
  mailer: MailerPort;
  appPublicUrl: string;
  /** The landing: where the measures' rule links go. */
  sitePublicUrl: string;
  /** The "Quando" of the notices is the moment of the send. */
  clock: ClockPort;
}>;

// Only to read the subjects: no sample says the address it goes to.
const LISTING_ADDRESS = 'amostra@lorkarium.dev';

/** The backoffice's mail test: every system e-mail with sample data, sent one at a time to an
 *  address the admin types, through the real mailer (SMTP in production).
 *
 *  Example: `await mailTest.send('invitation', 'eu@exemplo.com') // { subject: 'Seu convite para o Lorkarium', to }` */
export class MailSamplesService {
  constructor(private readonly deps: MailSamplesDeps) {}

  list(): MailSampleDto[] {
    return this.catalogFor(LISTING_ADDRESS).map(({ id, name, message }) => ({
      id,
      name,
      subject: message.subject,
    }));
  }

  async send(sampleId: string, to: string): Promise<Readonly<{ subject: string; to: string }>> {
    const sample = this.catalogFor(to).find((each) => each.id === sampleId);
    if (!sample) throw new MailSampleNotFoundError(sampleId);
    try {
      await this.deps.mailer.send(sample.message);
    } catch (error) {
      throw new MailDeliveryFailedError(sample.message.subject, error);
    }
    return { subject: sample.message.subject, to };
  }

  private catalogFor(to: string): ReturnType<typeof mailSamples> {
    const { appPublicUrl, sitePublicUrl, clock } = this.deps;
    return mailSamples(to, appPublicUrl, clock.now(), sitePublicUrl);
  }
}
