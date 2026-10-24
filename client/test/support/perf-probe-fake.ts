import type { PerfMetric, PerfProbe, PerfSnapshot } from '@/lib/perf-probe';

const NOTHING: Record<PerfMetric, number> = {
  'view.draw': 0,
  'token.redraw': 0,
  'overlays.draw': 0,
  'grid.draw': 0,
};

/** A probe whose snapshot is set by the spec; it also totals every count it was fed (`counts`).
 *
 *  Example: `probe.answer({ fps: 60 }); render(<PerfPanel probe={probe} />)` */
export class PerfProbeFake implements PerfProbe {
  readonly counts: Record<PerfMetric, number> = { ...NOTHING };
  readonly frames: number[] = [];
  readonly snapshotsAt: number[] = [];
  private next: PerfSnapshot = { fps: 0, frameMs: { p50: 0, p95: 0, max: 0 }, perSecond: NOTHING };

  answer(snapshot: Partial<PerfSnapshot>): void {
    this.next = { ...this.next, ...snapshot };
  }

  frame(ms: number): void {
    this.frames.push(ms);
  }

  count(metric: PerfMetric, amount = 1): void {
    this.counts[metric] += amount;
  }

  snapshot(nowMs: number): PerfSnapshot {
    this.snapshotsAt.push(nowMs);
    return this.next;
  }
}
