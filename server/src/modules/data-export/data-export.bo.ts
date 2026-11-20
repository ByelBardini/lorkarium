import { DataExportTooSoonError } from './data-export.error';

/** How often an account may export its data: once per `intervalMs`, counted from the last one.
 *
 *  Example: `new DataExportBo(DAY_MS).requireAllowed(userId, lastExportedAt, now)` */
export class DataExportBo {
  constructor(private readonly intervalMs: number) {}

  /** Throws `DataExportTooSoonError` (with the next allowed instant) inside the interval.
   *
   *  Example: `rule.requireAllowed(biaId, null, now) // never throws for a first export` */
  requireAllowed(userId: string, lastExportedAt: Date | null, now: Date): void {
    if (lastExportedAt === null) return;
    const nextAt = new Date(lastExportedAt.getTime() + this.intervalMs);
    if (nextAt.getTime() <= now.getTime()) return;
    throw new DataExportTooSoonError(userId, lastExportedAt, nextAt, now);
  }

  /** The newest last export that still lets one more out at `now`: what the claim compares with,
   *  so two exports at the same time cannot both pass.
   *
   *  Example: `rule.latestLastExportAllowedAt(now) // now minus one interval` */
  latestLastExportAllowedAt(now: Date): Date {
    return new Date(now.getTime() - this.intervalMs);
  }
}
