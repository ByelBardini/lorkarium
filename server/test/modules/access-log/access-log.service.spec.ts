import { beforeEach, describe, expect, it } from 'vitest';
import {
  AccessLogService,
  BATCH_MAX_RECORDS,
  FLUSH_INTERVAL_MS,
  PENDING_MAX_RECORDS,
} from '../../../src/modules/access-log/access-log.service';
import { AccessLogArchiveFake, AccessLogFailureLogFake } from '../../support/access-log-fakes';
import { ClockFake } from '../../support/auth-fakes';
import { SchedulerFake } from '../../support/sessions-fakes';

const BOOT = 'a1b2c3d4';
const FLUSH_TASK = 'access-log-flush';
const ANA_ID = '7d0f8c39-2b8e-4f4e-9d1a-5c6b7a8e9f01';
const LOGIN = {
  ip: '203.0.113.7',
  userId: null,
  method: 'POST',
  routePattern: '/api/auth/login',
  url: '/api/auth/login',
  status: 200,
};
const ANA_ONLINE = { ip: '203.0.113.7', userId: ANA_ID };

describe('AccessLogService', () => {
  let archive: AccessLogArchiveFake;
  let clock: ClockFake;
  let scheduler: SchedulerFake;
  let log: AccessLogFailureLogFake;
  let service: AccessLogService;

  beforeEach(() => {
    archive = new AccessLogArchiveFake();
    clock = new ClockFake(new Date('2026-10-25T03:04:05.000Z'));
    scheduler = new SchedulerFake();
    log = new AccessLogFailureLogFake();
    service = new AccessLogService({ archive, clock, scheduler, bootId: BOOT, log });
  });

  function keys(): string[] {
    return archive.batches.map((batch) => batch.key);
  }

  function recordConnections(count: number): void {
    for (let index = 0; index < count; index += 1) {
      service.recordRealtime('realtime-connect', ANA_ONLINE);
    }
  }

  it('start writes the empty boot marker and schedules the first flush', async () => {
    await service.start();

    expect(archive.batches).toStrictEqual([
      { key: 'access-log/boots/2026/10/25/030405Z-a1b2c3d4.jsonl.gz', jsonLines: '' },
    ]);
    expect(scheduler.scheduled[FLUSH_TASK]?.delayMs).toBe(FLUSH_INTERVAL_MS);
  });

  it('start rejects when the archive refuses, and schedules nothing (the boot fails)', async () => {
    archive.refusing = true;

    await expect(service.start()).rejects.toThrow(/archive refused access-log\/boots\//);
    expect(scheduler.scheduled).toStrictEqual({});
  });

  it('a flush writes the pending lines as one batch named after the first line', async () => {
    service.recordHttp(LOGIN);
    clock.current = new Date('2026-10-25T03:09:00.000Z');
    service.recordRealtime('realtime-connect', ANA_ONLINE);

    await service.flush();

    expect(keys()).toStrictEqual(['access-log/2026/10/25/030405Z-a1b2c3d4-0.jsonl.gz']);
    expect(archive.records()).toStrictEqual([
      {
        kind: 'http',
        at: '2026-10-25T03:04:05.000Z',
        ip: '203.0.113.7',
        userId: null,
        method: 'POST',
        route: '/api/auth/login',
        status: 200,
      },
      { kind: 'realtime-connect', at: '2026-10-25T03:09:00.000Z', ...ANA_ONLINE },
    ]);
  });

  it('a line is written once: the next flush with nothing new writes nothing', async () => {
    service.recordHttp(LOGIN);
    await service.flush();

    await service.flush();

    expect(archive.batches).toHaveLength(1);
  });

  it('the health check never reaches the archive', async () => {
    service.recordHttp({ ...LOGIN, routePattern: '/api/health', url: '/api/health' });

    await service.flush();

    expect(archive.batches).toStrictEqual([]);
  });

  it(`more than ${BATCH_MAX_RECORDS} lines are split into objects of at most that many`, async () => {
    recordConnections(BATCH_MAX_RECORDS + 1);

    await service.flush();

    expect(archive.batches.map((batch) => batch.jsonLines.split('\n').length - 1)).toStrictEqual([
      BATCH_MAX_RECORDS,
      1,
    ]);
    expect(new Set(keys()).size).toBe(2);
  });

  it('a refused batch is reported and written first on the next flush, under a new key', async () => {
    service.recordHttp(LOGIN);
    archive.refusing = true;
    await service.flush();
    archive.refusing = false;
    service.recordRealtime('realtime-connect', ANA_ONLINE);

    await service.flush();

    expect(log.errors.map((entry) => entry.fields)).toMatchObject([
      { key: 'access-log/2026/10/25/030405Z-a1b2c3d4-0.jsonl.gz', records: 1 },
    ]);
    expect(keys()).toStrictEqual(['access-log/2026/10/25/030405Z-a1b2c3d4-1.jsonl.gz']);
    expect(archive.records().map((record) => record.kind)).toStrictEqual([
      'http',
      'realtime-connect',
    ]);
  });

  it('two flushes at once write the pending lines once', async () => {
    service.recordHttp(LOGIN);

    await Promise.all([service.flush(), service.flush()]);

    expect(archive.batches).toHaveLength(1);
  });

  it('the timer flushes and schedules the next turn', async () => {
    await service.start();
    service.recordHttp(LOGIN);

    scheduler.fire(FLUSH_TASK);
    await service.flush();

    expect(archive.records()).toHaveLength(1);
    expect(scheduler.scheduled[FLUSH_TASK]?.delayMs).toBe(FLUSH_INTERVAL_MS);
  });

  it('close stops the timer and writes what is left', async () => {
    await service.start();
    service.recordHttp(LOGIN);

    await service.close();

    expect(scheduler.cancelled).toStrictEqual([FLUSH_TASK]);
    expect(archive.records()).toHaveLength(1);
    expect(log.errors).toStrictEqual([]);
  });

  it('a timer flush that ends after close does not schedule another turn', async () => {
    await service.start();
    service.recordHttp(LOGIN);
    scheduler.fire(FLUSH_TASK);

    await service.close();

    expect(scheduler.scheduled).toStrictEqual({});
  });

  it('close with the archive refusing reports how many lines are lost', async () => {
    recordConnections(3);
    archive.refusing = true;

    await service.close();

    expect(log.errors.at(-1)).toStrictEqual({
      fields: { lost: 3 },
      message: 'access log lines lost on close',
    });
  });

  it(`past ${PENDING_MAX_RECORDS} pending lines the oldest batch is dropped and reported`, async () => {
    service.recordHttp(LOGIN);
    recordConnections(PENDING_MAX_RECORDS);

    await service.flush();

    expect(log.errors.map((entry) => entry.fields)).toStrictEqual([{ dropped: BATCH_MAX_RECORDS }]);
    expect(archive.records()).toHaveLength(PENDING_MAX_RECORDS + 1 - BATCH_MAX_RECORDS);
    expect(archive.records()[0]?.kind).toBe('realtime-connect');
  });
});
