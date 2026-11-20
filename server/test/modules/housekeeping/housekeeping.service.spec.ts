import { beforeEach, describe, expect, it } from 'vitest';
import {
  HOUSEKEEPING_BATCH_MAX,
  HOUSEKEEPING_INTERVAL_MS,
  HousekeepingService,
} from '../../../src/modules/housekeeping/housekeeping.service';
import { userPo } from '../../support/auth-factories';
import { ClockFake } from '../../support/auth-fakes';
import {
  ExpiredSuspensionsDaoFake,
  HousekeepingDaoFake,
  HousekeepingFailureLogFake,
  SuspensionEndedFake,
} from '../../support/housekeeping-fakes';
import { FeedbackRetentionFake } from '../../support/feedback-fakes';
import { ReportRetentionFake } from '../../support/reports-fakes';
import { SchedulerFake } from '../../support/sessions-fakes';

const NOW = new Date('2026-11-10T12:00:00Z');
const A_DAY_AGO = new Date('2026-11-09T12:00:00Z');
// 5 × 365 days plus 2 before NOW: one day past the calendar 5 years (one leap day in between).
const FIVE_YEARS_AGO = new Date('2021-11-09T12:00:00Z');
const TASK = 'housekeeping-sweep';

describe('HousekeepingService', () => {
  let dao: HousekeepingDaoFake;
  let expired: ExpiredSuspensionsDaoFake;
  let suspensionEnded: SuspensionEndedFake;
  let scheduler: SchedulerFake;
  let log: HousekeepingFailureLogFake;
  let service: HousekeepingService;

  beforeEach(() => {
    dao = new HousekeepingDaoFake();
    expired = new ExpiredSuspensionsDaoFake();
    suspensionEnded = new SuspensionEndedFake();
    scheduler = new SchedulerFake();
    log = new HousekeepingFailureLogFake();
    const clock = new ClockFake(NOW);
    const reportRetention = new ReportRetentionFake();
    const feedbackRetention = new FeedbackRetentionFake();
    const deps = { dao, expired, suspensionEnded, reportRetention, feedbackRetention };
    service = new HousekeepingService({ ...deps, clock, scheduler, log });
  });

  async function hourPasses(): Promise<void> {
    scheduler.fire(TASK);
    await new Promise((resolve) => setImmediate(resolve));
  }

  it('waits an hour after start, then sweeps each table once with its cut', async () => {
    service.start();
    expect(scheduler.scheduled[TASK]?.delayMs).toBe(HOUSEKEEPING_INTERVAL_MS);
    expect(dao.calls).toEqual([]);

    await hourPasses();

    expect(dao.calls).toEqual([
      { swept: 'document_receipts', cut: A_DAY_AGO, limit: HOUSEKEEPING_BATCH_MAX },
      { swept: 'sheet_receipts', cut: A_DAY_AGO, limit: HOUSEKEEPING_BATCH_MAX },
      { swept: 'sessions', cut: NOW, limit: HOUSEKEEPING_BATCH_MAX },
      { swept: 'challenges', cut: NOW, limit: HOUSEKEEPING_BATCH_MAX },
      { swept: 'broadcasts', cut: FIVE_YEARS_AGO, limit: HOUSEKEEPING_BATCH_MAX },
      { swept: 'banned_emails', cut: FIVE_YEARS_AGO, limit: HOUSEKEEPING_BATCH_MAX },
    ]);
  });

  it('sweeps again an hour after each sweep', async () => {
    service.start();
    await hourPasses();

    expect(scheduler.scheduled[TASK]?.delayMs).toBe(HOUSEKEEPING_INTERVAL_MS);
  });

  it('asks the same table again right away while a batch comes back full', async () => {
    dao.deletions.sessions = [HOUSEKEEPING_BATCH_MAX, HOUSEKEEPING_BATCH_MAX, 3];

    await service.sweep();

    expect(dao.sweptTables()).toEqual([
      'document_receipts',
      'sheet_receipts',
      'sessions',
      'sessions',
      'sessions',
      'challenges',
      'broadcasts',
      'banned_emails',
    ]);
  });

  it('logs a failing table and still sweeps in an hour, without rejecting', async () => {
    dao.failure = new Error('connection refused');
    service.start();

    await hourPasses();

    expect(log.errors).toEqual([
      { fields: { err: dao.failure }, message: expect.stringContaining('retrying in an hour') },
    ]);
    expect(scheduler.scheduled[TASK]).toBeDefined();
  });

  it('close cancels the next sweep and schedules none after', async () => {
    service.start();

    service.close();

    expect(scheduler.cancelled).toEqual([TASK]);
    expect(scheduler.scheduled[TASK]).toBeUndefined();
  });
});

describe('HousekeepingService, suspensions past their end', () => {
  let expired: ExpiredSuspensionsDaoFake;
  let suspensionEnded: SuspensionEndedFake;
  let log: HousekeepingFailureLogFake;
  let service: HousekeepingService;
  const bia = userPo({ id: 'b1a00000-0000-4000-8000-000000000001', email: 'bia@mesa.com' });
  const caio = userPo({ id: 'ca100000-0000-4000-8000-000000000002', email: 'caio@mesa.com' });

  beforeEach(() => {
    expired = new ExpiredSuspensionsDaoFake();
    suspensionEnded = new SuspensionEndedFake();
    log = new HousekeepingFailureLogFake();
    const deps = { dao: new HousekeepingDaoFake(), clock: new ClockFake(NOW) };
    const scheduler = new SchedulerFake();
    const reportRetention = new ReportRetentionFake();
    service = new HousekeepingService({
      ...deps,
      expired,
      suspensionEnded,
      reportRetention,
      feedbackRetention: new FeedbackRetentionFake(),
      scheduler,
      log,
    });
  });

  it('lifts the suspensions that ended by now and tells each account its access is back', async () => {
    expired.batches.push([bia, caio]);

    await service.sweep();

    expect(expired.lifts).toEqual([{ now: NOW, limit: HOUSEKEEPING_BATCH_MAX }]);
    expect(suspensionEnded.told).toEqual([bia.id, caio.id]);
  });

  it('a notice that fails keeps the account lifted, tells the next one and is logged', async () => {
    expired.batches.push([bia, caio]);
    suspensionEnded.failingFor = bia.id;

    await service.sweep();

    expect(suspensionEnded.told).toEqual([caio.id]);
    expect(log.errors).toEqual([
      {
        fields: { err: expect.any(Error), userId: bia.id },
        message: expect.stringContaining('suspension ended'),
      },
    ]);
  });

  it('asks again right away while a batch of lifted accounts comes back full', async () => {
    expired.batches.push(
      Array.from({ length: HOUSEKEEPING_BATCH_MAX }, () => bia),
      [caio],
    );

    await service.sweep();

    expect(expired.lifts).toHaveLength(2);
  });

  it('no suspension past its end tells nobody', async () => {
    await service.sweep();

    expect(suspensionEnded.told).toEqual([]);
  });
});

describe("HousekeepingService, the reports' and the feedback's retention", () => {
  let reportRetention: ReportRetentionFake;
  let feedbackRetention: FeedbackRetentionFake;
  let log: HousekeepingFailureLogFake;
  let service: HousekeepingService;

  beforeEach(() => {
    reportRetention = new ReportRetentionFake();
    feedbackRetention = new FeedbackRetentionFake();
    log = new HousekeepingFailureLogFake();
    service = new HousekeepingService({
      dao: new HousekeepingDaoFake(),
      expired: new ExpiredSuspensionsDaoFake(),
      suspensionEnded: new SuspensionEndedFake(),
      reportRetention,
      feedbackRetention,
      clock: new ClockFake(NOW),
      scheduler: new SchedulerFake(),
      log,
    });
  });

  it('each sweep purges the old reports and the loose screenshots of both once', async () => {
    await service.sweep();

    expect(reportRetention.purges).toBe(1);
    expect(feedbackRetention.purges).toBe(1);
  });

  it("a feedback purge that fails is logged after the reports' one ran", async () => {
    feedbackRetention.failure = new Error('lock timeout');

    await service.sweep();

    expect(reportRetention.purges).toBe(1);
    expect(log.errors).toEqual([
      {
        fields: { err: feedbackRetention.failure },
        message: expect.stringContaining('housekeeping'),
      },
    ]);
  });

  it('a purge that fails is logged and the sweep does not reject', async () => {
    reportRetention.failure = new Error('deadlock');

    await service.sweep();

    expect(log.errors).toEqual([
      {
        fields: { err: reportRetention.failure },
        message: expect.stringContaining('housekeeping'),
      },
    ]);
  });
});
