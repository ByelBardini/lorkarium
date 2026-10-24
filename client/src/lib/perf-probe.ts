/** What the board redraws: the whole view, a token, the zoom-bound overlays, the grid lines. */
export type PerfMetric = 'view.draw' | 'token.redraw' | 'overlays.draw' | 'grid.draw';

const METRICS: readonly PerfMetric[] = ['view.draw', 'token.redraw', 'overlays.draw', 'grid.draw'];

/** The frames of the window and, per second since the last snapshot, each redraw. */
export type PerfSnapshot = Readonly<{
  fps: number;
  frameMs: Readonly<{ p50: number; p95: number; max: number }>;
  perSecond: Readonly<Record<PerfMetric, number>>;
}>;

/** What the dev panel (`?perf=1`) reads from the renderer; production gets `NO_PERF_PROBE`. */
export interface PerfProbe {
  frame(ms: number): void;
  count(metric: PerfMetric, amount?: number): void;
  snapshot(nowMs: number): PerfSnapshot;
}

function zeroCounts(): Record<PerfMetric, number> {
  return { 'view.draw': 0, 'token.redraw': 0, 'overlays.draw': 0, 'grid.draw': 0 };
}

const EMPTY_SNAPSHOT: PerfSnapshot = {
  fps: 0,
  frameMs: { p50: 0, p95: 0, max: 0 },
  perSecond: zeroCounts(),
};

/** The probe that keeps nothing: the renderer's default outside the dev panel.
 *
 *  Example: `createPixiBoardRenderer(onIntent) // probe = NO_PERF_PROBE` */
export const NO_PERF_PROBE: PerfProbe = {
  frame: () => undefined,
  count: () => undefined,
  snapshot: () => EMPTY_SNAPSHOT,
};

/** Keeps the last `windowSize` frame times and the redraws since the last snapshot.
 *
 *  Example: `const probe = new RecordingPerfProbe(); app.ticker.add((t) => probe.frame(t.deltaMS))` */
export class RecordingPerfProbe implements PerfProbe {
  private readonly frames: number[] = [];
  private counts = zeroCounts();
  private since: number | null = null;

  constructor(private readonly windowSize = 120) {}

  frame(ms: number): void {
    this.frames.push(ms);
    if (this.frames.length > this.windowSize) this.frames.shift();
  }

  count(metric: PerfMetric, amount = 1): void {
    this.counts[metric] += amount;
  }

  snapshot(nowMs: number): PerfSnapshot {
    const seconds = this.since === null ? 1 : Math.max(nowMs - this.since, 1) / 1000;
    const perSecond = zeroCounts();
    for (const metric of METRICS) perSecond[metric] = this.counts[metric] / seconds;
    this.counts = zeroCounts();
    this.since = nowMs;
    return { fps: fpsOf(this.frames), frameMs: frameSummaryOf(this.frames), perSecond };
  }
}

function fpsOf(frames: readonly number[]): number {
  if (frames.length === 0) return 0;
  const mean = frames.reduce((sum, ms) => sum + ms, 0) / frames.length;
  return mean > 0 ? 1000 / mean : 0;
}

// Nearest rank: the p-th percentile is the smallest sample at or above p of them.
function frameSummaryOf(frames: readonly number[]): PerfSnapshot['frameMs'] {
  if (frames.length === 0) return EMPTY_SNAPSHOT.frameMs;
  const sorted = [...frames].sort((a, b) => a - b);
  const rank = (p: number): number => sorted[Math.max(Math.ceil(p * sorted.length) - 1, 0)] ?? 0;
  return { p50: rank(0.5), p95: rank(0.95), max: sorted[sorted.length - 1] ?? 0 };
}
