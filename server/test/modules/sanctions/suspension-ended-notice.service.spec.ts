import { describe, expect, it } from 'vitest';
import { SecurityNoticesService } from '../../../src/modules/account-security/security-notices.service';
import { SuspensionEndedNoticeService } from '../../../src/modules/sanctions/suspension-ended-notice.service';
import { MailerFake } from '../../support/account-security-fakes';
import { userPo } from '../../support/auth-factories';
import { DataCipherFake } from '../../support/auth-fakes';

describe('SuspensionEndedNoticeService', () => {
  it('a lifted account gets "Seu acesso ao Lorkarium voltou" at its opened e-mail', async () => {
    const mailer = new MailerFake();
    const notices = new SecurityNoticesService(mailer, () => undefined);
    const service = new SuspensionEndedNoticeService({
      notices,
      cipher: new DataCipherFake(),
      appPublicUrl: 'https://mesa.example.com',
    });

    await service.suspensionEnded(userPo({ email: 'caio@mesa.com', username: 'caio' }));

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({
      to: 'caio@mesa.com',
      subject: 'Seu acesso ao Lorkarium voltou',
    });
    expect(mailer.sent[0]?.text).toContain('@caio');
  });
});
