import type { Point } from './camera';

/** How long the primary button stays down, still, before the press becomes a ping. */
export const PING_HOLD_MS = 500;

// The same 4 px as a token press: from there on the press is a drag or a marquee.
const PING_HOLD_SLOP_PX = 4;

/** A press that may become a ping: where and when it started, and whether it moved too far. */
export type PingHold = Readonly<{ start: Point; startedAt: number; cancelled: boolean }>;

/** The keys and button of a press, as `PointerEvent` has them. */
export type PressKeys = Readonly<{
  button: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}>;

/** Example: `hold = startPingHold(pointOf(event), clock.now())` */
export function startPingHold(start: Point, startedAt: number): PingHold {
  return { start, startedAt, cancelled: false };
}

/** The hold after the pointer moved: 4 px of screen away cancels it for good.
 *
 *  Example: `hold = movePingHold(hold, pointOf(event))` */
export function movePingHold(hold: PingHold, at: Point): PingHold {
  if (hold.cancelled) return hold;
  const travelled = Math.hypot(at.x - hold.start.x, at.y - hold.start.y);
  return travelled >= PING_HOLD_SLOP_PX ? { ...hold, cancelled: true } : hold;
}

/** Whether the hold, still in place, lasted long enough to be a ping.
 *
 *  Example: `if (pingHoldDue(hold, ticker.lastTime)) onIntent({ type: 'pingRequested', … })` */
export function pingHoldDue(hold: PingHold, now: number): boolean {
  return !hold.cancelled && now - hold.startedAt >= PING_HOLD_MS;
}

/** Alt + the primary button pings in any tool; Ctrl/⌘ belong to other gestures.
 *
 *  Example: `if (isAltPing(event)) return requestPing(event)` */
export function isAltPing(press: PressKeys): boolean {
  return press.button === 0 && press.altKey && !press.ctrlKey && !press.metaKey;
}
