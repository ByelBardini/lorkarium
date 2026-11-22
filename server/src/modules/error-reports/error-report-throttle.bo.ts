/** Admitted: send it, with how many of the same were silenced since the last one sent. */
export type ThrottleVerdict =
  Readonly<{ admitted: true; suppressed: number }> | Readonly<{ admitted: false }>;

type FingerprintWindow = { startedAt: number; suppressed: number };

const DEFAULT_MAX_FINGERPRINTS = 500;

/** One report per fingerprint per window, so a loop does not spend the monthly quota; the table
 *  keeps the most recent fingerprints only, so it never grows past the ceiling.
 *
 *  Example: `new ErrorReportThrottleBo({ windowMs: 60_000 }).admits('f1', Date.now())` */
export class ErrorReportThrottleBo {
  private readonly windows = new Map<string, FingerprintWindow>();
  private readonly windowMs: number;
  private readonly maxFingerprints: number;

  constructor(options: Readonly<{ windowMs: number; maxFingerprints?: number }>) {
    if (!(options.windowMs > 0)) {
      throw new RangeError(
        `windowMs must be a positive number of milliseconds (received ${options.windowMs})`,
      );
    }
    this.windowMs = options.windowMs;
    this.maxFingerprints = options.maxFingerprints ?? DEFAULT_MAX_FINGERPRINTS;
  }

  get size(): number {
    return this.windows.size;
  }

  /** Example: `throttle.admits('f1', now) // { admitted: true, suppressed: 0 }` */
  admits(fingerprint: string, now: number): ThrottleVerdict {
    const current = this.windows.get(fingerprint);
    if (current && now - current.startedAt < this.windowMs) {
      current.suppressed += 1;
      return { admitted: false };
    }
    this.windows.delete(fingerprint);
    this.windows.set(fingerprint, { startedAt: now, suppressed: 0 });
    this.forgetOldest();
    return { admitted: true, suppressed: current?.suppressed ?? 0 };
  }

  private forgetOldest(): void {
    if (this.windows.size <= this.maxFingerprints) return;
    const oldest = this.windows.keys().next();
    if (!oldest.done) this.windows.delete(oldest.value);
  }
}
