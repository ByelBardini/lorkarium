import type { SheetFrameRolledDieDto, SheetFrameRollDto } from '@lorkarium/contracts';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { DiceRollFailure, DiceRollOutcome } from '@/services/dice-commands';
import { refusedWith, type SheetBridgeAnswer } from './sheet-bridge-answer';

/** The roll as the sheet's author reads it: the one part the sheet rolled, without the 3D model
 *  indices (the frame has no dice of its own to point at).
 *
 *  Example: `sheetRollOf(outcome) // { expression: '1d20+5', total: 22, dice: [{ sides: 20, value: 17, status: 'kept' }] }` */
export function sheetRollOf(outcome: DiceRollOutcome): SheetFrameRollDto {
  const [part] = outcome.parts;
  if (!part) throw new Error(`roll ${outcome.rollId} has no part; expected the sheet's one`);
  return { expression: part.expression, total: outcome.total, dice: frameDiceOf(part.dice) };
}

/** A part's dice as the frame reads them: without the 3D model indices.
 *
 *  Example: `frameDiceOf(part.dice) // [{ sides: 20, value: 17, status: 'kept' }]` */
export function frameDiceOf(
  dice: DiceRollOutcome['parts'][number]['dice'],
): SheetFrameRolledDieDto[] {
  return dice.map(({ sides, value, status, success }) =>
    success === undefined ? { sides, value, status } : { sides, value, status, success },
  );
}

/** A refused `dice:roll` as the frame's error: the notation keeps the server's message.
 *
 *  Example: `diceRefusalOf('dice.roll', { kind: 'offline' }) // { ok: false, code: 'OFFLINE', … }` */
export function diceRefusalOf(request: string, failure: DiceRollFailure): SheetBridgeAnswer {
  if (failure.kind === 'invalid_expression') {
    return refusedWith('INVALID_DICE_EXPRESSION', failure.message);
  }
  return refusedWith(failure.kind.toUpperCase(), `${request} refused with ${failure.kind}`);
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
