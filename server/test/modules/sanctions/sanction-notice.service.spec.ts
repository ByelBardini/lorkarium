import { beforeEach, describe, expect, it } from 'vitest';
import { SanctionNoticeService } from '../../../src/modules/sanctions/sanction-notice.service';
import { userPo } from '../../support/auth-factories';
import { ClockFake, DataCipherFake } from '../../support/auth-fakes';
import { accountSanctionPo } from '../../support/sanctions-factories';
import { AccountSanctionsDaoFake, NoticesJournalFake } from '../../support/sanctions-fakes';

const NOW = new Date('2026-11-20T15:00:00Z');
const caio = userPo({ id: 'ca100000-0000-4000-8000-000000000002', email: 'caio@mesa.com' });

describe('SanctionNoticeService', () => {
  let journal: string[];
  let notices: NoticesJournalFake;
  let sanctions: AccountSanctionsDaoFake;
  let notice: SanctionNoticeService;

  beforeEach(async () => {
    journal = [];
    notices = new NoticesJournalFake(journal);
    sanctions = new AccountSanctionsDaoFake();
    notice = new SanctionNoticeService({
      ...{ notices, sanctions, cipher: new DataCipherFake(), clock: new ClockFake(NOW) },
      ...{ appPublicUrl: 'https://mesa.example.com', sitePublicUrl: 'https://site.example.com' },
      replyTo: 'contato@site.example.com',
    });
  });

  async function storedWarning(): Promise<string> {
    const row = accountSanctionPo({ userId: caio.id, notifiedAt: null });
    return (await sanctions.insert(row)).id;
  }

  it('e-mails the measure to the account and records when it left', async () => {
    const id = await storedWarning();

    expect(await notice.notify(accountSanctionPo({ id }), caio)).toBe(true);

    expect(notices.sent).toEqual([
      expect.objectContaining({ to: 'caio@mesa.com', replyTo: 'contato@site.example.com' }),
    ]);
    expect(sanctions.rows[0]?.notifiedAt).toEqual(NOW);
  });

  it('an e-mail that fails is not recorded: the hourly sweep sends it again', async () => {
    const id = await storedWarning();
    notices.failing = true;

    expect(await notice.notify(accountSanctionPo({ id }), caio)).toBe(false);

    expect(sanctions.rows[0]?.notifiedAt).toBeNull();
  });
});
