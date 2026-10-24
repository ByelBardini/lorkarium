import { describe, expect, it } from 'vitest';
import { MailPreviewService } from '../../../src/modules/dev-seed/mail-preview.service';
import { MailerFake } from '../../support/account-security-fakes';
import { ClockFake } from '../../support/auth-fakes';

const TO = 'preview@lorkarium.dev';
const PUBLIC_URL = 'http://localhost:5173';

describe('MailPreviewService', () => {
  it('refuses production with MAIL_PREVIEW_REFUSED citing the value, before any send', async () => {
    const mailer = new MailerFake();
    const preview = new MailPreviewService(
      mailer,
      new ClockFake(new Date('2026-10-24T16:37:00Z')),
    ).send('production', TO, PUBLIC_URL);
    await expect(preview).rejects.toMatchObject({
      code: 'MAIL_PREVIEW_REFUSED',
      message: expect.stringContaining('NODE_ENV=production'),
    });
    expect(mailer.sent).toEqual([]);
  });

  it('sends one sample per catalog item to the inbox, in the catalog order', async () => {
    const mailer = new MailerFake();
    const sent = await new MailPreviewService(
      mailer,
      new ClockFake(new Date('2026-10-24T16:37:00Z')),
    ).send('development', TO, PUBLIC_URL);
    expect(mailer.sent).toHaveLength(11);
    expect(new Set(mailer.sent.map((mail) => mail.to))).toEqual(new Set([TO]));
    expect(mailer.sent[0]?.subject).toBe('Confirme seu novo e-mail no Lorkarium');
    expect(sent).toBe(11);
  });

  it('a failure stops at the item and names its subject', async () => {
    const mailer = new MailerFake();
    mailer.failWith = new Error('connection refused');
    const preview = new MailPreviewService(
      mailer,
      new ClockFake(new Date('2026-10-24T16:37:00Z')),
    ).send('development', TO, PUBLIC_URL);
    await expect(preview).rejects.toThrow(
      /Confirme seu novo e-mail no Lorkarium.*connection refused/,
    );
    expect(mailer.sent).toEqual([]);
  });
});
