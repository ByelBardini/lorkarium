import { describe, expect, it } from 'vitest';
import { NO_PERF_PROBE, RecordingPerfProbe } from '@/lib/perf-probe';

// 20 frames of 10, 12, …, 48 ms: sorted, the nearest-rank p50 is the 10th (28) and the p95 the
// 19th (46); the mean is 29 ms, 34.48 frames per second.
const RISING_FRAMES = Array.from({ length: 20 }, (_, index) => 10 + index * 2);

describe('RecordingPerfProbe', () => {
  it('sums up the frames: fps from the mean, p50, p95 and the longest', () => {
    const probe = new RecordingPerfProbe();
    for (const ms of RISING_FRAMES) probe.frame(ms);
    const { fps, frameMs } = probe.snapshot(1000);
    expect(fps).toBeCloseTo(1000 / 29, 5);
    expect(frameMs).toEqual({ p50: 28, p95: 46, max: 48 });
  });

  it('keeps only the last frames of its window', () => {
    const probe = new RecordingPerfProbe(4);
    for (const ms of [100, 100, 10, 10, 10, 10]) probe.frame(ms);
    expect(probe.snapshot(1000).frameMs).toEqual({ p50: 10, p95: 10, max: 10 });
  });

  it('counts each metric per second since the last snapshot, then starts over', () => {
    const probe = new RecordingPerfProbe();
    probe.snapshot(0);
    probe.count('view.draw');
    probe.count('view.draw');
    probe.count('token.redraw', 300);
    const first = probe.snapshot(500);
    expect(first.perSecond).toEqual({
      'view.draw': 4,
      'token.redraw': 600,
      'overlays.draw': 0,
      'grid.draw': 0,
    });
    expect(probe.snapshot(1500).perSecond['view.draw']).toBe(0);
  });
});

describe('NO_PERF_PROBE', () => {
  it('keeps nothing: the snapshot is empty however much it was fed', () => {
    NO_PERF_PROBE.frame(16);
    NO_PERF_PROBE.count('view.draw', 5);
    expect(NO_PERF_PROBE.snapshot(1000)).toEqual({
      fps: 0,
      frameMs: { p50: 0, p95: 0, max: 0 },
      perSecond: { 'view.draw': 0, 'token.redraw': 0, 'overlays.draw': 0, 'grid.draw': 0 },
    });
  });
});
