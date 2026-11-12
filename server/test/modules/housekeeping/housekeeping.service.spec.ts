import { beforeEach, describe, expect, it } from 'vitest';
import {
  HOUSEKEEPING_BATCH_MAX,
  HOUSEKEEPING_INTERVAL_MS,
  HousekeepingService,
} from '../../../src/modules/housekeeping/housekeeping.service';
import { ClockFake } from '../../support/auth-fakes';
import { HousekeepingDaoFake, HousekeepingFailureLogFake } from '../../support/housekeeping-fakes';
import { SchedulerFake } from '../../support/sessions-fakes';

const NOW = new Date('2026-11-10T12:00:00Z');
const A_DAY_AGO = new Date('2026-11-09T12:00:00Z');
const TASK = 'housekeeping-sweep';

describe('HousekeepingService', () => {
  let dao: HousekeepingDaoFake;
  let scheduler: SchedulerFake;
  let log: HousekeepingFailureLogFake;
  let service: HousekeepingService;

  beforeEach(() => {
    dao = new HousekeepingDaoFake();
    scheduler = new SchedulerFake();
    log = new HousekeepingFailureLogFake();
    service = new HousekeepingService({ dao, clock: new ClockFake(NOW), scheduler, log });
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
