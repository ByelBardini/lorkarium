import { useEffect } from 'react';
import { TABLE_IDLE_MS, createIdleWatch } from '@/lib/idle-watch';
import type { InteractionClock } from '@/lib/interaction-clock';

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;

export type TabActivityOptions = Readonly<{
  clock: InteractionClock;
  /** `true` after 10 minutes without activity on this tab, `false` at the next one. */
  onAway: (away: boolean) => void;
}>;

/** Watches this tab for mouse, keyboard, wheel or touch. A hidden tab does not count as activity
 *  (switching tabs for a minute marks nobody, but leaving it hidden for 10 does).
 *
 *  Example: `useTabActivity({ clock: deps.interactionClock, onAway: openTables.getState().setAway })` */
export function useTabActivity({ clock, onAway }: TabActivityOptions): void {
  useEffect(() => {
    const watch = createIdleWatch({ clock, idleMs: TABLE_IDLE_MS, onChange: onAway });
    const touch = (): void => {
      if (document.visibilityState !== 'hidden') watch.touch();
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, touch, { passive: true });
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, touch);
      watch.dispose();
    };
  }, [clock, onAway]);
}
