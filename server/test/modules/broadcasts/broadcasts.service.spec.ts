import type { MailBroadcastContentDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { BroadcastsService } from '../../../src/modules/broadcasts/broadcasts.service';
import { MailerFake } from '../../support/account-security-fakes';
import { userPo } from '../../support/auth-factories';
import { ClockFake, DataCipherFake } from '../../support/auth-fakes';
import {
  AccountRowsFake,
  BroadcastAudienceFake,
  ConfirmationRunnerFake,
  MailBroadcastsDaoFake,
  TwoFactorStateFake,
} from '../../support/broadcasts-fakes';

const NOW = new Date('2026-11-19T12:00:00Z');
const ADMIN = userPo({
  id: 'admin-1',
  name: 'Fernanda',
  email: 'fernanda@mesa.com',
  role: 'admin',
});
const NOTICE: MailBroadcastContentDto = {
  segment: 'paid',
  subject: 'Os preços mudam em 30 dias',
  title: 'Novos preços',
  paragraphs: ['A partir de janeiro o Narrador custa R$ 19,90.'],
};

function codeOf(error: unknown): string | undefined {
  return (error as { code?: string }).code;
}

describe('BroadcastsService', () => {
  let broadcasts: MailBroadcastsDaoFake;
  let audience: BroadcastAudienceFake;
  let twoFactor: TwoFactorStateFake;
  let mailer: MailerFake;
  let service: BroadcastsService;

  beforeEach(() => {
    broadcasts = new MailBroadcastsDaoFake(NOW);
    audience = new BroadcastAudienceFake({ all: 1300, paid: 120, plan: 40 });
    twoFactor = new TwoFactorStateFake();
    mailer = new MailerFake();
    service = new BroadcastsService({
      ...{ broadcasts, audience, twoFactor, mailer },
      confirmation: new ConfirmationRunnerFake(broadcasts, audience).run,
      accounts: new AccountRowsFake([ADMIN]),
      cipher: new DataCipherFake(),
      clock: new ClockFake(NOW),
      appPublicUrl: 'https://app.lorkarium.com.br',
      replyTo: 'contato@lorkarium.com.br',
    });
  });

  async function testedDraft(): Promise<string> {
    const { broadcast } = await service.create(ADMIN.id, NOTICE);
    await service.test(ADMIN.id, broadcast.id);
    return broadcast.id;
  }

  it('the preview greets the admin and counts the segment', async () => {
    const preview = await service.preview(ADMIN.id, { ...NOTICE, segment: { plan: 'lenda' } });
    expect(preview.audience).toBe(40);
    expect(preview.html).toContain('Oi, Fernanda!');
  });

  it('a draft keeps who wrote it and has no button when none was given', async () => {
    const draft = await service.create(ADMIN.id, NOTICE);
    expect(draft).toMatchObject({ audience: 120, broadcast: { button: null, total: null } });
    expect(broadcasts.rows[0]?.createdBy).toBe('admin-1');
  });

  it('a test goes only to the admin, with the reply-to, and stamps the draft tested now', async () => {
    const { broadcast } = await service.create(ADMIN.id, NOTICE);
    const tested = await service.test(ADMIN.id, broadcast.id);
    expect(mailer.sent.map(({ to, replyTo }) => ({ to, replyTo }))).toEqual([
      { to: 'fernanda@mesa.com', replyTo: 'contato@lorkarium.com.br' },
    ]);
    expect(tested.broadcast.testedAt).toBe(NOW.toISOString());
  });

  it('a test the SMTP refuses is MAIL_DELIVERY_FAILED and the draft stays untested', async () => {
    const { broadcast } = await service.create(ADMIN.id, NOTICE);
    mailer.failWith = new Error('connection refused');
    const error = await service.test(ADMIN.id, broadcast.id).catch((caught: unknown) => caught);
    expect(codeOf(error)).toBe('MAIL_DELIVERY_FAILED');
    expect(broadcasts.rows[0]?.testedAt).toBeNull();
  });

  it('confirming with the right total freezes the segment and keeps the total', async () => {
    const id = await testedDraft();
    twoFactor.on.add(ADMIN.id);
    const { broadcast } = await service.confirm(ADMIN.id, id, 120);
    expect(broadcast).toMatchObject({ total: 120, confirmedAt: NOW.toISOString() });
    expect(audience.frozen).toEqual([{ broadcastId: id, segment: 'paid' }]);
  });

  it('a wrong total is CONFIRMATION_MISMATCH and the frozen audience is undone', async () => {
    const id = await testedDraft();
    twoFactor.on.add(ADMIN.id);
    const error = await service.confirm(ADMIN.id, id, 121).catch((caught: unknown) => caught);
    expect(codeOf(error)).toBe('CONFIRMATION_MISMATCH');
    expect([audience.frozen, broadcasts.rows[0]?.confirmedAt]).toEqual([[], null]);
  });

  it('without 2FA the confirmation is TWO_FACTOR_REQUIRED before freezing anything', async () => {
    const id = await testedDraft();
    const error = await service.confirm(ADMIN.id, id, 120).catch((caught: unknown) => caught);
    expect(codeOf(error)).toBe('TWO_FACTOR_REQUIRED');
    expect(audience.frozen).toEqual([]);
  });

  it('an unknown notice is BROADCAST_NOT_FOUND', async () => {
    const error = await service.confirm(ADMIN.id, 'b-9', 1).catch((caught: unknown) => caught);
    expect(codeOf(error)).toBe('BROADCAST_NOT_FOUND');
  });

  it('a confirmed notice is neither rewritten nor tested again (ALREADY_CONFIRMED)', async () => {
    const id = await testedDraft();
    twoFactor.on.add(ADMIN.id);
    await service.confirm(ADMIN.id, id, 120);
    const rewrite = await service.rewrite(id, NOTICE).catch((caught: unknown) => caught);
    const test = await service.test(ADMIN.id, id).catch((caught: unknown) => caught);
    expect([codeOf(rewrite), codeOf(test)]).toEqual(['ALREADY_CONFIRMED', 'ALREADY_CONFIRMED']);
    expect(mailer.sent).toHaveLength(1);
  });

  it('rewriting a draft forgets its test', async () => {
    const id = await testedDraft();
    const { broadcast } = await service.rewrite(id, { ...NOTICE, subject: 'Outro' });
    expect(broadcast).toMatchObject({ subject: 'Outro', testedAt: null });
  });
});
