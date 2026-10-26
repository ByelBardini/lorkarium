import { useEffect, useState } from 'react';
import { nextRevealAtOf, type RevealEntry } from '@/lib/dice-reveal';
import type { InteractionClock } from '@/lib/interaction-clock';

export type RevealClock = Readonly<{ now: number; shownAt: number }>;

/** `now` moves to each `revealAtMs` as it comes (and, with `holdMs`, to each `revealAtMs +
 *  holdMs`, when a notice ends); `shownAt` is when the screen appeared, so what was already
 *  revealed then (an F5, the tab opened again) can be told apart.
 *
 *  Example: `const { now, shownAt } = useRevealClock(entries, deps.diceClock, DICE_NOTICE_MS)` */
export function useRevealClock(
  entries: readonly RevealEntry[],
  clock: InteractionClock,
  holdMs = 0,
): RevealClock {
  const [shownAt] = useState(() => clock.now());
  const [now, setNow] = useState(shownAt);
  const next = earliestOf(
    nextRevealAtOf(entries, now),
    holdMs > 0 ? nextRevealAtOf(entries, now, holdMs) : null,
  );
  useEffect(() => {
    if (next === null) return;
    return clock.after(next - clock.now(), () => setNow(clock.now()));
  }, [next, clock]);
  return { now, shownAt };
}

function earliestOf(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  return right === null ? left : Math.min(left, right);
}
