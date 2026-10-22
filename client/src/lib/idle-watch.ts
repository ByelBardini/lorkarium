import type { InteractionClock } from './interaction-clock';

/** How long the table waits without mouse, keyboard, wheel or touch before saying "away": the
 *  10 minutes of Slack's auto-away; whoever only listens to the narration stays still for long. */
export const TABLE_IDLE_MS = 10 * 60_000;

export type IdleWatchOptions = Readonly<{
  clock: InteractionClock;
  idleMs: number;
  /** `true` once nothing happened for `idleMs`, `false` at the first touch after it. */
  onChange: (away: boolean) => void;
}>;

export type IdleWatch = Readonly<{ touch: () => void; dispose: () => void }>;

/** Counts the time since the last activity. A touch only notes the time (it fires on every
 *  pointer move); the one timer checks it when due and waits the rest when there was one.
 *
 *  Example: `const watch = createIdleWatch({ clock, idleMs: TABLE_IDLE_MS, onChange: setAway })` */
export function createIdleWatch({ clock, idleMs, onChange }: IdleWatchOptions): IdleWatch {
  let lastTouch = clock.now();
  let away = false;
  let cancel = clock.after(idleMs, check);
  function check(): void {
    const idleFor = clock.now() - lastTouch;
    if (idleFor < idleMs) {
      cancel = clock.after(idleMs - idleFor, check);
      return;
    }
    away = true;
    onChange(true);
  }
  return {
    touch: () => {
      lastTouch = clock.now();
      if (!away) return;
      away = false;
      onChange(false);
      cancel = clock.after(idleMs, check);
    },
    dispose: () => cancel(),
  };
}
