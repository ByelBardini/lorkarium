/** How long the dice of a roll stay still on the table after the last one stops. */
export const DICE_REST_HOLD_MS = 3000;
/** How long the dice take to fade out once the hold is over. */
export const DICE_FADE_MS = 600;
/** From the last stop to the roll leaving the scene: hold + fade. */
export const DICE_VISIBLE_AFTER_SETTLE_MS = DICE_REST_HOLD_MS + DICE_FADE_MS;

function assertSettle(settleMs: number): void {
  if (Number.isFinite(settleMs) && settleMs >= 0) return;
  throw new RangeError(
    `Dice settle ${settleMs} ms is invalid: expected a finite number of 0 or more.`,
  );
}

/** The opacity of a roll whose last die stops at `settleMs`, at `tMs` (both on the clock of
 *  the throw): 1 while rolling and through the hold, linear down to 0 over the fade, and
 *  `null` once it is over (the roll leaves the scene).
 *
 *  Example: `diceOpacityAt(2000, 5300) // 0.5` */
export function diceOpacityAt(settleMs: number, tMs: number): number | null {
  assertSettle(settleMs);
  const fadeStartMs = settleMs + DICE_REST_HOLD_MS;
  if (tMs >= fadeStartMs + DICE_FADE_MS) return null;
  if (tMs <= fadeStartMs) return 1;
  return 1 - (tMs - fadeStartMs) / DICE_FADE_MS;
}
