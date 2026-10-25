import type { ClockPort } from '../auth/clock.port';
import type { SchedulerPort } from '../sessions/scheduler.port';
import type { AccessLogArchivePort } from './access-log-archive.port';
import {
  batchKeyOf,
  bootKeyOf,
  httpAccessRecordOf,
  realtimeAccessRecordOf,
  type AccessRecord,
  type HttpAccessFacts,
  type RealtimeAccessKind,
} from './access-log.bo';
import { jsonLinesOf } from './access-log.mapper';

/** The slice of the pino logger a lost or delayed batch is reported to. */
export type AccessLogFailureLog = Readonly<{ error: (fields: object, message: string) => void }>;

export type AccessLogServiceDeps = Readonly<{
  archive: AccessLogArchivePort;
  clock: ClockPort;
  scheduler: SchedulerPort;
  /** Random per boot: the two instances of a rolling update write different keys. */
  bootId: string;
  log: AccessLogFailureLog;
}>;

// A crash loses at most this much of the log; a SIGTERM (deploy, docker stop) loses nothing.
export const FLUSH_INTERVAL_MS = 5 * 60_000;
export const BATCH_MAX_RECORDS = 10_000;
// About 40 MB: with the archive down for hours the oldest lines go, not the whole process.
export const PENDING_MAX_RECORDS = 200_000;
const FLUSH_TASK = 'access-log-flush';

/** Keeps the access log lines in memory and writes them to the archive in batches: every
 *  `FLUSH_INTERVAL_MS` and on close. A failed batch waits for the next turn.
 *
 *  Example: `await service.start(); service.recordHttp(facts); await service.close()` */
export class AccessLogService {
  private pending: AccessRecord[] = [];
  private sequence = 0;
  private flushing: Promise<void> | null = null;
  private closed = false;

  constructor(private readonly deps: AccessLogServiceDeps) {}

  /** Writes the boot marker and starts the timer; rejects when the archive refuses, which fails the
   *  boot (a wrong key shows up in the deploy, not months later). */
  async start(): Promise<void> {
    const { archive, clock, bootId } = this.deps;
    await archive.store(bootKeyOf(clock.now(), bootId), '');
    this.scheduleFlush();
  }

  recordHttp(facts: Omit<HttpAccessFacts, 'at'>): void {
    const record = httpAccessRecordOf({ ...facts, at: this.deps.clock.now() });
    if (record) this.keep(record);
  }

  recordRealtime(kind: RealtimeAccessKind, facts: Readonly<{ ip: string; userId: string }>): void {
    this.keep(realtimeAccessRecordOf(kind, { ...facts, at: this.deps.clock.now() }));
  }

  /** Writes every pending line, at most `BATCH_MAX_RECORDS` per object; never rejects. A call
   *  while a flush runs joins it. */
  flush(): Promise<void> {
    this.flushing ??= this.drain().finally(() => (this.flushing = null));
    return this.flushing;
  }

  /** Stops the timer and writes what is left; the lines the archive still refuses are reported. */
  async close(): Promise<void> {
    this.closed = true;
    this.deps.scheduler.cancel(FLUSH_TASK);
    await this.flush();
    if (this.pending.length === 0) return;
    this.deps.log.error({ lost: this.pending.length }, 'access log lines lost on close');
  }

  private keep(record: AccessRecord): void {
    this.pending.push(record);
    if (this.pending.length <= PENDING_MAX_RECORDS) return;
    // A whole batch at a time: one splice per BATCH_MAX_RECORDS lines, not a shift per request.
    const dropped = this.pending.splice(0, BATCH_MAX_RECORDS).length;
    this.deps.log.error(
      { dropped },
      'access log archive unreachable for too long; oldest lines dropped',
    );
  }

  private async drain(): Promise<void> {
    while (this.pending.length > 0) {
      const batch = this.pending.splice(0, BATCH_MAX_RECORDS);
      if (!(await this.write(batch))) return;
    }
  }

  private async write(batch: AccessRecord[]): Promise<boolean> {
    const firstAt = batch[0]?.at ?? this.deps.clock.now().toISOString();
    const key = batchKeyOf(firstAt, this.deps.bootId, this.sequence++);
    try {
      await this.deps.archive.store(key, jsonLinesOf(batch));
      return true;
    } catch (error) {
      this.pending = batch.concat(this.pending);
      const fields = { err: error, key, records: batch.length };
      this.deps.log.error(fields, 'access log batch not stored; retrying on the next flush');
      return false;
    }
  }

  private scheduleFlush(): void {
    if (this.closed) return;
    this.deps.scheduler.schedule(FLUSH_TASK, FLUSH_INTERVAL_MS, () => {
      void this.flush().then(() => this.scheduleFlush());
    });
  }
}
