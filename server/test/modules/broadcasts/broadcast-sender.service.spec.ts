import { beforeEach, describe, expect, it } from 'vitest';
import {
  BROADCAST_BATCH_SIZE,
  BROADCAST_SEND_GAP_MS,
  BROADCAST_SEND_INTERVAL_MS,
  BroadcastSenderService,
} from '../../../src/modules/broadcasts/broadcast-sender.service';
import { MailerFake } from '../../support/account-security-fakes';
import { fakeSealedEmail } from '../../support/auth-factories';
import { ClockFake, DataCipherFake } from '../../support/auth-fakes';
import {
  BroadcastDeliveriesFake,
  BroadcastSenderLogFake,
  claimedDelivery,
  SendPaceFake,
} from '../../support/broadcasts-fakes';
import { SchedulerFake } from '../../support/sessions-fakes';

const NOW = new Date('2026-11-19T12:00:00Z');

function accountOf(name: string) {
  const id = `user-${name}`;
  const { emailCipher } = fakeSealedEmail(`${name}@mesa.com`, id);
  return { id, name, username: name, emailCipher };
}

describe('BroadcastSenderService', () => {
  let deliveries: BroadcastDeliveriesFake;
  let mailer: MailerFake;
  let scheduler: SchedulerFake;
  let pace: SendPaceFake;
  let log: BroadcastSenderLogFake;
  let sender: BroadcastSenderService;

  beforeEach(() => {
    deliveries = new BroadcastDeliveriesFake();
    mailer = new MailerFake();
    scheduler = new SchedulerFake();
    pace = new SendPaceFake();
    log = new BroadcastSenderLogFake();
    sender = new BroadcastSenderService({
      ...{ deliveries, mailer, scheduler, pace, log },
      cipher: new DataCipherFake(),
      clock: new ClockFake(NOW),
      appPublicUrl: 'https://app.lorkarium.com.br',
      replyTo: 'contato@lorkarium.com.br',
    });
  });

  it('a batch of 50 opens each address, sends with the reply-to and records it sent', async () => {
    const names = Array.from({ length: 50 }, (_, index) => `conta${index}`);
    deliveries.pending.push(...names.map((name, i) => claimedDelivery(`d-${i}`, accountOf(name))));
    await sender.cycle();
    expect(mailer.sent).toHaveLength(50);
    expect(mailer.sent[0]).toMatchObject({
      to: 'conta0@mesa.com',
      replyTo: 'contato@lorkarium.com.br',
    });
    expect(deliveries.sent.map(({ id }) => id)).toEqual(names.map((_, i) => `d-${i}`));
  });

  it('reserves at most a batch, until 5 minutes ahead', async () => {
    await sender.cycle();
    expect(deliveries.claims).toEqual([
      { now: NOW, until: new Date('2026-11-19T12:05:00Z'), limit: BROADCAST_BATCH_SIZE },
    ]);
  });

  it('pauses between two e-mails, never before the first', async () => {
    deliveries.pending.push(claimedDelivery('d-1', accountOf('ana')));
    deliveries.pending.push(claimedDelivery('d-2', accountOf('bia')));
    deliveries.pending.push(claimedDelivery('d-3', accountOf('caio')));
    await sender.cycle();
    expect(pace.pauses).toEqual([BROADCAST_SEND_GAP_MS, BROADCAST_SEND_GAP_MS]);
  });

  it('an account deleted after the confirmation is skipped without an e-mail', async () => {
    deliveries.pending.push(claimedDelivery('d-gone', null));
    await sender.cycle();
    expect([mailer.sent.length, deliveries.skipped]).toEqual([0, ['d-gone']]);
  });

  it('an SMTP failure counts one attempt and frees the row for the next cycle', async () => {
    mailer.failWith = new Error('421 <ana@mesa.com> try again later');
    deliveries.pending.push(claimedDelivery('d-1', accountOf('ana')));
    await sender.cycle();
    expect(deliveries.failed).toEqual([
      { id: 'd-1', attempts: 1, error: '421 <destinatário> try again later', failedAt: null },
    ]);
    expect(deliveries.sent).toEqual([]);
  });

  it('the third failure gives the delivery up with the error', async () => {
    mailer.failWith = new Error('550 mailbox unavailable');
    deliveries.pending.push(claimedDelivery('d-1', accountOf('ana'), 2));
    await sender.cycle();
    expect(deliveries.failed).toEqual([
      { id: 'd-1', attempts: 3, error: '550 mailbox unavailable', failedAt: NOW },
    ]);
  });

  it('a failure of one e-mail does not stop the rest of the batch', async () => {
    deliveries.pending.push(claimedDelivery('d-1', { ...accountOf('ana'), emailCipher: 'broken' }));
    deliveries.pending.push(claimedDelivery('d-2', accountOf('bia')));
    await sender.cycle();
    expect([deliveries.failed.map(({ id }) => id), deliveries.sent.map(({ id }) => id)]).toEqual([
      ['d-1'],
      ['d-2'],
    ]);
  });

  it('every cycle ends by finishing the notices with nothing left', async () => {
    await sender.cycle();
    expect(deliveries.finished).toEqual([NOW]);
  });

  it('a failed reservation goes to the log and the cycle does not reject', async () => {
    deliveries.claimFailure = new Error('connection lost');
    await expect(sender.cycle()).resolves.toBeUndefined();
    expect(log.errors.map(({ message }) => message)).toEqual([
      'broadcast sending cycle failed; retrying in a minute',
    ]);
  });

  it('start schedules a cycle a minute later and close cancels it', () => {
    sender.start();
    expect(scheduler.scheduled['broadcast-sender']?.delayMs).toBe(BROADCAST_SEND_INTERVAL_MS);
    sender.close();
    expect(scheduler.scheduled['broadcast-sender']).toBeUndefined();
  });

  it('after a cycle the next one is scheduled again', async () => {
    sender.start();
    scheduler.fire('broadcast-sender');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deliveries.claims).toHaveLength(1);
    expect(scheduler.scheduled['broadcast-sender']?.delayMs).toBe(BROADCAST_SEND_INTERVAL_MS);
  });
});
