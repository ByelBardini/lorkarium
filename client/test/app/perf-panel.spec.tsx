import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerfPanel } from '@/app/perf-panel';
import { PerfProbeFake } from '../support/perf-probe-fake';

describe('PerfPanel', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows the frame summary and the redraws per second of the probe', () => {
    const probe = new PerfProbeFake();
    probe.answer({
      fps: 58.6,
      frameMs: { p50: 16.4, p95: 21.04, max: 40 },
      perSecond: {
        'view.draw': 3,
        'token.redraw': 900,
        'overlays.draw': 60,
        'grid.draw': 2,
        'zoom.event': 42,
        'strip.redraw': 300,
      },
    });
    render(<PerfPanel probe={probe} now={() => 1000} />);

    const panel = screen.getByRole('status', { name: 'Desempenho' });
    expect(panel).toHaveTextContent('59 FPS');
    expect(panel).toHaveTextContent('quadro p50 16,4 · p95 21,0 · máx 40,0 ms');
    expect(panel).toHaveTextContent('vista 3 · tokens 900 · sobreposições 60 · grade 2 por s');
    expect(panel).toHaveTextContent('zoom 42 · faixas 300 por s');
  });

  it("shows 'texturas 41,5 MB' when the probe has the texture gauge", () => {
    const probe = new PerfProbeFake();
    probe.answer({ gauges: { 'texture.mb': 41.48 } });
    render(<PerfPanel probe={probe} now={() => 1000} />);

    expect(screen.getByRole('status', { name: 'Desempenho' })).toHaveTextContent(
      'texturas 41,5 MB',
    );
  });

  it('leaves the texture line out while the gauge was never measured', () => {
    render(<PerfPanel probe={new PerfProbeFake()} now={() => 1000} />);

    expect(screen.getByRole('status', { name: 'Desempenho' })).not.toHaveTextContent('texturas');
  });

  it('asks the probe again at every interval', () => {
    const probe = new PerfProbeFake();
    let clock = 1000;
    render(<PerfPanel probe={probe} now={() => clock} />);
    probe.answer({ fps: 30 });
    clock = 2000;
    act(() => vi.advanceTimersByTime(1000));

    expect(screen.getByRole('status', { name: 'Desempenho' })).toHaveTextContent('30 FPS');
    expect(probe.snapshotsAt).toEqual([1000, 2000]);
  });
});
