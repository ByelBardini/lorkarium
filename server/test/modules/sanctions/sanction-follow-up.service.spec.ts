import { beforeEach, describe, expect, it } from 'vitest';
import { SanctionFollowUpService } from '../../../src/modules/sanctions/sanction-follow-up.service';
import { SanctionNoticeService } from '../../../src/modules/sanctions/sanction-notice.service';
import { userPo } from '../../support/auth-factories';
import { ClockFake, DataCipherFake } from '../../support/auth-fakes';
import { HousekeepingFailureLogFake } from '../../support/housekeeping-fakes';
import { accountSanctionPo } from '../../support/sanctions-factories';
import {
  AccountDeletionFake,
  AccountSanctionsDaoFake,
  NoticesJournalFake,
} from '../../support/sanctions-fakes';
import { UserAdminDaoFake } from '../../support/user-admin-fakes';

const NOW = new Date('2026-12-05T12:00:00Z');
const CAIO_ID = 'ca100000-0000-4000-8000-000000000002';
const BIA_ID = 'b1a00000-0000-4000-8000-000000000003';
const PAST_DUE = new Date('2026-12-04T12:00:00Z');
const HARASSMENT = { rule: 'harassment', statement: 'Ameaçou um jogador real.' } as const;

describe('SanctionFollowUpService', () => {
  let journal: string[];
  let sanctions: AccountSanctionsDaoFake;
  let notices: NoticesJournalFake;
  let deletion: AccountDeletionFake;
  let log: HousekeepingFailureLogFake;
  let followUp: SanctionFollowUpService;

  beforeEach(() => {
    journal = [];
    sanctions = new AccountSanctionsDaoFake();
    notices = new NoticesJournalFake(journal);
    deletion = new AccountDeletionFake(journal);
    log = new HousekeepingFailureLogFake();
    const clock = new ClockFake(NOW);
    const accounts = new UserAdminDaoFake([
      userPo({ id: CAIO_ID, email: 'caio@mesa.com' }),
      userPo({ id: BIA_ID, email: 'bia@mesa.com' }),
    ]);
    const notice = new SanctionNoticeService({
      ...{ notices, sanctions, cipher: new DataCipherFake(), clock, replyTo: null },
      ...{ appPublicUrl: 'https://mesa.example.com', sitePublicUrl: 'https://site.example.com' },
    });
    followUp = new SanctionFollowUpService({ sanctions, accounts, notice, deletion, clock, log });
  });

  async function ban(overrides: Parameters<typeof accountSanctionPo>[0] = {}): Promise<string> {
    const row = accountSanctionPo({ kind: 'ban', ...HARASSMENT, deletionDueAt: PAST_DUE });
    return (await sanctions.insert({ ...row, ...overrides })).id;
  }

  it('a ban past its appeal window deletes the account, keeping the e-mail out', async () => {
    await ban();

    await followUp.sweep();

    expect(journal).toEqual([`delete ${CAIO_ID} banned 2026-12-05T12:00:00.000Z shared no`]);
  });

  it('a ban for the minimum age deletes without keeping the e-mail out', async () => {
    await ban({ rule: 'minimum_age' });

    await followUp.sweep();

    expect(journal).toEqual([`delete ${CAIO_ID} banned no shared no`]);
  });

  it('a ban that takes the shared tables passes it to the deletion', async () => {
    await ban({ deleteSharedCampaigns: true });

    await followUp.sweep();

    expect(journal).toEqual([`delete ${CAIO_ID} banned 2026-12-05T12:00:00.000Z shared yes`]);
  });

  it('waits while the window is open, while an appeal waits for its decision, or after a revert', async () => {
    await ban({ deletionDueAt: new Date('2026-12-06T12:00:00Z') });
    await ban({ userId: BIA_ID, appealReceivedAt: PAST_DUE });
    await ban({ deletionDueAt: null, appealReceivedAt: PAST_DUE, appealOutcome: 'reverted' });

    await followUp.sweep();

    expect(journal).toEqual([]);
  });

  it('an upheld appeal lets the deletion go', async () => {
    await ban({ appealReceivedAt: PAST_DUE, appealOutcome: 'upheld' });

    await followUp.sweep();

    expect(journal).toEqual([`delete ${CAIO_ID} banned 2026-12-05T12:00:00.000Z shared no`]);
  });

  it('a ban whose e-mail never left sends it first, then deletes: nobody goes untold', async () => {
    await ban({ notifiedAt: null });

    await followUp.sweep();

    expect(journal).toEqual([
      'mail Sua conta no Lorkarium será excluída',
      `delete ${CAIO_ID} banned 2026-12-05T12:00:00.000Z shared no`,
    ]);
  });

  it('a ban whose e-mail fails again is not deleted', async () => {
    await ban({ notifiedAt: null });
    notices.failing = true;

    await followUp.sweep();

    expect(journal).toEqual(['mail failed Sua conta no Lorkarium será excluída']);
  });

  it('a missed e-mail of another measure goes again and is recorded', async () => {
    await sanctions.insert(accountSanctionPo({ userId: BIA_ID, notifiedAt: null }));

    await followUp.sweep();

    expect(journal).toEqual(['mail Um aviso sobre a sua conta no Lorkarium']);
    expect(sanctions.rows[0]?.notifiedAt).toEqual(NOW);
  });

  it('a deletion that fails is logged and the next due ban still goes', async () => {
    await ban();
    await ban({ userId: BIA_ID });
    deletion.failFor = CAIO_ID;

    await followUp.sweep();

    expect(journal).toEqual([`delete ${BIA_ID} banned 2026-12-05T12:00:00.000Z shared no`]);
    expect(log.errors.map((entry) => entry.message)).toEqual([
      'could not delete the account of a due ban; retrying in an hour',
    ]);
  });
});
