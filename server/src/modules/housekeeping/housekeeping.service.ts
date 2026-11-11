import type { ClockPort } from '../auth/clock.port';
import type { SchedulerPort } from '../sessions/scheduler.port';
import type { HousekeepingDao, SweptTable } from './housekeeping.dao';

/** The slice of the pino logger a failed sweep is reported to. */
export type HousekeepingFailureLog = Readonly<{ error: (fields: object, message: string) => void }>;

export type HousekeepingServiceDeps = Readonly<{
  dao: Pick<HousekeepingDao, 'deleteBefore'>;
  clock: ClockPort;
  scheduler: SchedulerPort;
  log: HousekeepingFailureLog;
}>;

export const HOUSEKEEPING_INTERVAL_MS = 60 * 60_000;
// A receipt answers a repeated actionId (a retry after a lost ack); a day later it is a new command.
export const RECEIPT_TTL_MS = 24 * 60 * 60_000;
export const HOUSEKEEPING_BATCH_MAX = 1000;
const SWEEP_TASK = 'housekeeping-sweep';

// How old a row of each table must be to go: receipts after a day, the rest once expired.
const AGE_LIMIT_MS: Readonly<Record<SweptTable, number>> = {
  document_receipts: RECEIPT_TTL_MS,
  sheet_receipts: RECEIPT_TTL_MS,
  sessions: 0,
  challenges: 0,
};

/** Every hour deletes the receipts a day old, the expired sessions and the expired 2FA steps, a
 *  batch at a time until each table is clean; a failure is logged and waits for the next hour.
 *
 *  Example: `service.start(); …; service.close()` */
export class HousekeepingService {
  private closed = false;

  constructor(private readonly deps: HousekeepingServiceDeps) {}

  start(): void {
    this.scheduleSweep();
  }

  /** Cleans every table now; never rejects. */
  async sweep(): Promise<void> {
    try {
      for (const swept of Object.keys(AGE_LIMIT_MS) as SweptTable[]) await this.clean(swept);
    } catch (error) {
      this.deps.log.error({ err: error }, 'housekeeping sweep failed; retrying in an hour');
    }
  }

  close(): void {
    this.closed = true;
    this.deps.scheduler.cancel(SWEEP_TASK);
  }

  private async clean(swept: SweptTable): Promise<void> {
    const cut = new Date(this.deps.clock.now().getTime() - AGE_LIMIT_MS[swept]);
    let deleted = HOUSEKEEPING_BATCH_MAX;
    while (deleted === HOUSEKEEPING_BATCH_MAX && !this.closed)
      deleted = await this.deps.dao.deleteBefore(swept, cut, HOUSEKEEPING_BATCH_MAX);
  }

  private scheduleSweep(): void {
    if (this.closed) return;
    this.deps.scheduler.schedule(SWEEP_TASK, HOUSEKEEPING_INTERVAL_MS, () => {
      void this.sweep().then(() => this.scheduleSweep());
    });
  }
}
