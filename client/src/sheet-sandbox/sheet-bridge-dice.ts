import type { SheetFrameRollDto } from '@lorkarium/contracts';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { DiceRollOutcome } from '@/services/dice-commands';

/** The roll as the sheet's author reads it: the one part the sheet rolled, without the 3D model
 *  indices (the frame has no dice of its own to point at).
 *
 *  Example: `sheetRollOf(outcome) // { expression: '1d20+5', total: 22, dice: [{ sides: 20, value: 17, status: 'kept' }] }` */
export function sheetRollOf(outcome: DiceRollOutcome): SheetFrameRollDto {
  const [part] = outcome.parts;
  if (!part) throw new Error(`roll ${outcome.rollId} has no part; expected the sheet's one`);
  const dice = part.dice.map(({ sides, value, status, success }) =>
    success === undefined ? { sides, value, status } : { sides, value, status, success },
  );
  return { expression: part.expression, total: outcome.total, dice };
}

/** Waits until the dice of a roll stand still, so the sheet never shows a number before the
 *  table sees it land.
 *
 *  Example: `await diceSettled(clock, outcome.settlesInMs)` */
export function diceSettled(clock: InteractionClock, settlesInMs: number): Promise<void> {
  return new Promise((resolve) => {
    clock.after(settlesInMs, resolve);
  });
}
