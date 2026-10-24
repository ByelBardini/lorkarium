import { useEffect, useState } from 'react';
import type { PerfProbe, PerfSnapshot } from '@/lib/perf-probe';

export type PerfPanelProps = Readonly<{
  probe: PerfProbe;
  /** The clock the per-second counts divide by (`performance.now` in the app). */
  now?: () => number;
  intervalMs?: number;
}>;

const ONE_DECIMAL = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** The dev-only board panel (`?perf=1`): frames per second, the frame time and what was redrawn
 *  each second, read from the renderer's probe. Never mounted in production.
 *
 *  Example: `<PerfPanel probe={probe} />` */
export function PerfPanel({
  probe,
  now = () => performance.now(),
  intervalMs = 1000,
}: PerfPanelProps): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<PerfSnapshot>(() => probe.snapshot(now()));
  useEffect(() => {
    const timer = setInterval(() => setSnapshot(probe.snapshot(now())), intervalMs);
    return () => clearInterval(timer);
  }, [probe, now, intervalMs]);
  const { fps, frameMs, perSecond } = snapshot;
  const ms = (value: number): string => ONE_DECIMAL.format(value);
  return (
    <div
      role="status"
      aria-label="Desempenho"
      className="pointer-events-none fixed right-2 bottom-2 z-50 rounded-[4px] border border-border bg-panel/90 px-3 py-2 font-mono text-xs text-foreground"
    >
      <p>{Math.round(fps)} FPS</p>
      <p>{`quadro p50 ${ms(frameMs.p50)} · p95 ${ms(frameMs.p95)} · máx ${ms(frameMs.max)} ms`}</p>
      <p>
        {`vista ${Math.round(perSecond['view.draw'])} · tokens ${Math.round(perSecond['token.redraw'])}` +
          ` · sobreposições ${Math.round(perSecond['overlays.draw'])}` +
          ` · grade ${Math.round(perSecond['grid.draw'])} por s`}
      </p>
    </div>
  );
}
