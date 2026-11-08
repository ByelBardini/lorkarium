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
      'zoom.event': 0,
      'strip.redraw': 0,
    });
    expect(probe.snapshot(1500).perSecond['view.draw']).toBe(0);
  });

  it('counts 3 zoom events in one second as 3 per second, and strip redraws apart', () => {
    const probe = new RecordingPerfProbe();
    probe.snapshot(0);
    for (let tick = 0; tick < 3; tick += 1) probe.count('zoom.event');
    probe.count('strip.redraw', 300);
    const { perSecond } = probe.snapshot(1000);
    expect(perSecond['zoom.event']).toBe(3);
    expect(perSecond['strip.redraw']).toBe(300);
  });

  it('shows the gauge it was given', () => {
    const probe = new RecordingPerfProbe();
    probe.gauge('texture.mb', 41.5);
    expect(probe.snapshot(1000).gauges).toEqual({ 'texture.mb': 41.5 });
  });

  it('keeps the last of two gauges, and keeps it across snapshots', () => {
    const probe = new RecordingPerfProbe();
    probe.gauge('texture.mb', 41.5);
    probe.gauge('texture.mb', 12);
    expect(probe.snapshot(1000).gauges['texture.mb']).toBe(12);
    expect(probe.snapshot(2000).gauges['texture.mb']).toBe(12);
  });

  it('leaves a gauge never measured out of the snapshot instead of showing 0', () => {
    const probe = new RecordingPerfProbe();
    const { gauges } = probe.snapshot(1000);
    expect(gauges).toEqual({});
    expect('texture.mb' in gauges).toBe(false);
  });

  it.each([Number.NaN, -1, Number.POSITIVE_INFINITY])(
    'refuses the gauge %s, naming it and the expected shape',
    (value) => {
      const probe = new RecordingPerfProbe();
      expect(() => probe.gauge('texture.mb', value)).toThrow(
        `texture.mb: expected a number ≥ 0 (número ≥ 0), got ${String(value)}`,
      );
      expect(probe.snapshot(1000).gauges).toEqual({});
    },
  );
});

describe('NO_PERF_PROBE', () => {
  it('keeps nothing: the snapshot is empty however much it was fed', () => {
    NO_PERF_PROBE.frame(16);
    NO_PERF_PROBE.count('view.draw', 5);
    NO_PERF_PROBE.count('zoom.event', 5);
    NO_PERF_PROBE.gauge('texture.mb', 41.5);
    expect(NO_PERF_PROBE.snapshot(1000)).toEqual({
      fps: 0,
      frameMs: { p50: 0, p95: 0, max: 0 },
      perSecond: {
        'view.draw': 0,
        'token.redraw': 0,
        'overlays.draw': 0,
        'grid.draw': 0,
        'zoom.event': 0,
        'strip.redraw': 0,
      },
      gauges: {},
    });
  });
});
